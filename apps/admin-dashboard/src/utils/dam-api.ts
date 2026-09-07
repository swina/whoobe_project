import type { FolderVisibilityRule, ThumbnailPreset, ExtractedAssetMetadata, SupportedImageFormat } from '@whoobe-cms/core'

// Thin HTTP client for the asset-processor DAM endpoints. S3/MinIO
// credentials never touch the browser: the backend owns them via its
// own environment variables and only ever hands back URLs/keys.
//
// Every function takes the DAM backend's base URL explicitly (sourced
// from the user-editable damStore.config.assetProcessorUrl) rather than
// reading import.meta.env directly, so the Settings UI field actually
// takes effect without a rebuild.
//
// These endpoints require an authenticated session (see authStore /
// auth-api.ts) - `credentials: 'include'` sends the httpOnly session
// cookie set by core-api's /auth/login, which the browser would
// otherwise withhold on a cross-origin request to a different port/host.

export interface DamBackendInfo {
  bucket: string
  endpoint: string
  publicBaseUrl: string
  keyPrefix: string
}

export interface DamAssetUrls {
  isPublic: boolean
  url: string
  thumbnailUrl: string
  thumbnails: Record<ThumbnailPreset, string>
}

// Multi-user source of truth for what folders/assets exist - persisted in
// Postgres (see packages/core/src/db/dam-schema.ts), not browser
// localStorage. Dates arrive as ISO strings over JSON.
export interface DamFolderRecord {
  id: string
  path: string
  name: string
  parentPath: string
  isPublic: boolean | null
  createdAt: string
}

export interface DamAssetRecord {
  id: string
  pimcorePath: string
  filename: string
  folderPath: string
  sizeBytes: number
  mimeType: string
  fileType: string
  version: number
  s3Key: string
  isPublic: boolean
  metadata: ExtractedAssetMetadata | null
  uploadedAt: string
  updatedAt: string
}

// Asset record plus freshly-resolved (public or presigned) URLs - never
// persisted server-side (presigned URLs expire), always computed at
// response time. Returned by upload and list, but not by the metadata
// PATCH (which doesn't need to touch URLs at all).
export interface DamAssetRecordWithUrls extends DamAssetRecord {
  url: string
  thumbnailUrl: string
  thumbnails: Record<ThumbnailPreset, string>
}

/** Fetch a single asset by its UUID from the DAM backend, returning
 * its record + resolved URLs. Used as a fallback when the asset isn't
 * yet in the client-side store (ObjectsView.vue's recordAssetUrl). */
export async function fetchAssetById(
  baseUrl: string,
  assetId: string,
  folderRules: FolderVisibilityRule[]
): Promise<DamAssetRecordWithUrls> {
  const query = `?folderRules=${encodeURIComponent(JSON.stringify(folderRules))}`
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/dam/assets/${assetId}${query}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.asset
}

export async function regenerateThumbnailsApi(
  baseUrl: string,
  paths: string[],
  folderRules: FolderVisibilityRule[]
): Promise<{ succeeded: number; failed: number; results: { pimcorePath: string; success: boolean; error?: string }[] }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/dam/regenerate-thumbnails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths, folderRules }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export interface DamUploadResult {
  s3Key: string
  url: string
  thumbnailUrl: string
  thumbnails: Record<ThumbnailPreset, string>
  asset: DamAssetRecordWithUrls
}

// Respect the build-time env var first (set in .env for production, e.g.
// VITE_ASSET_PROCESSOR_URL=https://whoobecms.example.com). For localhost
// dev, use the Vite dev server's own hostname:port (the vite.config.ts proxy
// forwards /api/v1/dam to the asset-processor on port 3002). For remote
// hostnames (production behind nginx), omit the port — nginx serves
// everything on 443 and routes /api/v1/* to port 3002 internally.
export function getDefaultAssetProcessorUrl(): string {
  if (import.meta.env.VITE_ASSET_PROCESSOR_URL) {
    return import.meta.env.VITE_ASSET_PROCESSOR_URL.replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
    if (isLocalhost) {
      const port = window.location.port || '3000'
      return `${window.location.protocol}//${hostname}:${port}`
    }
    return `${window.location.protocol}//${hostname}`
  }
  return 'http://localhost:3000'
}

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || getDefaultAssetProcessorUrl()).replace(/\/+$/, '')
}

async function parseJsonOrThrow(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // Ignore body parse failures; use the generic message above.
    }
    throw new Error(message)
  }
  return res.json()
}

export async function fetchDamInfo(baseUrl: string): Promise<DamBackendInfo> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/dam/info`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function uploadAssetToDam(
  baseUrl: string,
  fileOrBlob: Blob,
  filename: string,
  pimcorePath: string,
  isPublic: boolean,
  folderRules: FolderVisibilityRule[],
  metadata?: ExtractedAssetMetadata | null
): Promise<DamUploadResult> {
  const form = new FormData()
  form.append('file', fileOrBlob, filename)
  form.append('pimcorePath', pimcorePath)
  form.append('isPublic', String(isPublic))
  form.append('folderRules', JSON.stringify(folderRules))
  if (metadata) {
    form.append('metadata', JSON.stringify(metadata))
  }

  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/dam/upload`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function deleteAssetFromDam(
  baseUrl: string,
  pimcorePath: string,
  folderRules: FolderVisibilityRule[]
): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/dam/asset`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pimcorePath, folderRules }),
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}

export async function fetchAssetUrls(
  baseUrl: string,
  pimcorePath: string,
  folderRules: FolderVisibilityRule[],
  expiresIn?: number
): Promise<DamAssetUrls> {
  const body: Record<string, unknown> = { pimcorePath, folderRules }
  if (expiresIn) body.expiresIn = expiresIn
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/dam/asset-urls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function checkAssetExists(
  baseUrl: string,
  pimcorePath: string,
  folderRules: FolderVisibilityRule[]
): Promise<boolean> {
  const body: Record<string, unknown> = { pimcorePath, folderRules }
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/dam/exists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })
  const data = await parseJsonOrThrow(res)
  return !!data.exists
}

export async function ensureDamBucket(baseUrl: string, folderRules: FolderVisibilityRule[]): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/dam/ensure-bucket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderRules }),
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}

export async function fetchFolders(baseUrl: string): Promise<DamFolderRecord[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/dam/folders`, { credentials: 'include' })
  const data = await parseJsonOrThrow(res)
  return data.folders
}

export async function createFolderApi(
  baseUrl: string,
  input: { path: string; name: string; parentPath: string; isPublic?: boolean }
): Promise<DamFolderRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/dam/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const data = await parseJsonOrThrow(res)
  return data.folder
}

export async function deleteFolderApi(
  baseUrl: string,
  path: string,
  folderRules: FolderVisibilityRule[]
): Promise<{ deletedAssetCount: number }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/dam/folders`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, folderRules }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function fetchAssets(
  baseUrl: string,
  folderRules: FolderVisibilityRule[],
  folderPath?: string
): Promise<DamAssetRecordWithUrls[]> {
  const body: Record<string, unknown> = { folderRules }
  if (folderPath) body.folderPath = folderPath
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/dam/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })
  const data = await parseJsonOrThrow(res)
  return data.assets
}

export async function updateAssetMetadataApi(
  baseUrl: string,
  pimcorePath: string,
  metadata: ExtractedAssetMetadata
): Promise<DamAssetRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/dam/assets/metadata`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pimcorePath, metadata }),
    credentials: 'include',
  })
  const data = await parseJsonOrThrow(res)
  return data.asset
}

export interface TransformOptions {
  width?: number
  height?: number
  fit?: 'cover' | 'contain' | 'inside' | 'fill'
  format: SupportedImageFormat
  quality?: number
  rotate?: number
  grayscale?: boolean
  blur?: number
  watermarkText?: string
  watermarkPosition?: 'southeast' | 'southwest' | 'center' | 'northeast' | 'northwest'
  watermarkOpacity?: number
}

// Re-transforms an already-uploaded image through sharp on the backend -
// the browser has no way to run sharp itself, so this always goes through
// asset-processor rather than doing anything client-side.
export async function transformAssetOnDam(
  baseUrl: string,
  pimcorePath: string,
  asNewVersion: boolean,
  options: TransformOptions,
  folderRules: FolderVisibilityRule[]
): Promise<DamUploadResult> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/dam/transform`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pimcorePath, asNewVersion, options, folderRules }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

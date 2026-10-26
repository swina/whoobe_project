import { getDefaultCoreApiUrl } from './auth-api'
import { aiFetch } from './ai-usage-api'

export interface WebsiteRecord {
  id: string
  name: string
  rootPath: string
  domains: string[]
  defaultLocale: string
  supportedLocales: string[]
  settings: Record<string, unknown> | null
  themeId: string | null
  pwaEnabled: boolean
  pwaConfig: Record<string, unknown> | null
  gatewayApiKeyPrefix: string | null
  createdAt: string
  updatedAt: string
}

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')
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

export async function fetchWebsites(baseUrl: string): Promise<WebsiteRecord[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.websites
}

export async function fetchWebsiteById(baseUrl: string, id: string): Promise<WebsiteRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.website
}

export async function createWebsite(
  baseUrl: string,
  input: {
    name: string
    rootPath?: string
    domains?: string[]
    defaultLocale?: string
    supportedLocales?: string[]
    settings?: Record<string, unknown>
    themeId?: string | null
    pwaEnabled?: boolean
    pwaConfig?: Record<string, unknown>
  }
): Promise<WebsiteRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.website
}

export async function updateWebsite(
  baseUrl: string,
  id: string,
  input: {
    name?: string
    rootPath?: string
    domains?: string[]
    defaultLocale?: string
    supportedLocales?: string[]
    settings?: Record<string, unknown>
    themeId?: string | null
    pwaEnabled?: boolean
    pwaConfig?: Record<string, unknown>
  }
): Promise<WebsiteRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.website
}

export async function deleteWebsite(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}

export interface AiWebsiteStructure {
  website: { name: string; defaultLocale: string; supportedLocales: string[]; settings: Record<string, unknown> }
  pages: { slug: string; title: string; category: string; content: unknown }[]
  snippets: { name: string; category: string; node: unknown }[]
}

export async function generateAiWebsiteStructure(baseUrl: string, prompt: string): Promise<AiWebsiteStructure> {
  const res = await aiFetch(`${normalizeBaseUrl(baseUrl)}/ai/generate-website-structure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.structure
}

export async function createWebsiteFromAi(
  baseUrl: string,
  structure: AiWebsiteStructure
): Promise<{ website: WebsiteRecord; pages: any[]; snippets: any[] }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/from-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structure }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

// --- Website Export / Import ---
// The bundle is version 2 (see packages/core/src/portability/bundle.ts): the JSON is the manifest, the files of the
// assets travel next to it in a .zip (utils/website-bundle.ts). The shape is kept loose here on purpose: the client
// only adds `assets[].file` and sends the rest back.

export interface BundleAssetEntry {
  id: string
  pimcorePath: string
  filename: string
  mimeType: string
  sizeBytes: number
  isPublic: boolean
  metadata: unknown
  /** path of the file inside the .zip; absent = references only */
  file?: string
}

export interface WebsiteBundlePayload {
  version: 1 | 2
  website: { name: string; [key: string]: unknown }
  assets?: BundleAssetEntry[]
  [key: string]: unknown
}

export interface AssetPlanEntry {
  id: string
  pimcorePath: string
  action: 'upload' | 'reuse' | 'conflict'
  existingId?: string
  targetPath: string
}

export interface WebsiteImportReport {
  dryRun: boolean
  website: { id: string | null; name: string; rootPath: string }
  counts: Record<string, number>
  classes: { name: string; action: 'create' | 'reuse'; differences: string[] }[]
  assets: AssetPlanEntry[]
  /** Documentation websites: the folder of the files in the bundle, and the one they go to here. */
  docs?: { sourceFolder: string; targetFolder: string }
  warnings: string[]
}

export async function exportWebsite(
  baseUrl: string,
  id: string,
  options: { dataObjects?: 'all' | 'referenced' } = {}
): Promise<WebsiteBundlePayload> {
  const query = options.dataObjects === 'referenced' ? '?dataObjects=referenced' : ''
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}/export${query}`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function importWebsite(
  baseUrl: string,
  payload: WebsiteBundlePayload,
  options: { dryRun?: boolean; assetMap?: Record<string, { id: string; pimcorePath: string }>; docsFolder?: string } = {}
): Promise<WebsiteImportReport> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/import${options.dryRun ? '?dryRun=1' : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, ...(options.assetMap ? { assetMap: options.assetMap } : {}), ...(options.docsFolder ? { docsFolder: options.docsFolder } : {}) }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

// --- Multi-theme API ---

export interface WebsiteTheme {
  id: string
  name: string
  colors: { name: string; hex: string }[]
  fonts: string[]
  styles: string
  tailwindClasses: string
}

export interface WebsiteThemesResponse {
  themes: WebsiteTheme[]
  defaultThemeId: string
}

export async function fetchWebsiteThemes(baseUrl: string, id: string): Promise<WebsiteThemesResponse> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}/themes`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function createWebsiteTheme(
  baseUrl: string,
  websiteId: string,
  input: { name: string; colors?: { name: string; hex: string }[]; fonts?: string[]; styles?: string; tailwindClasses?: string }
): Promise<WebsiteTheme> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${websiteId}/themes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.theme
}

export async function updateWebsiteTheme(
  baseUrl: string,
  websiteId: string,
  themeId: string,
  input: { name?: string; colors?: { name: string; hex: string }[]; fonts?: string[]; styles?: string; tailwindClasses?: string; isDefault?: boolean }
): Promise<WebsiteTheme> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${websiteId}/themes/${themeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.theme
}

export async function fetchDefaultPlaceholderImage(baseUrl: string): Promise<string | null> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/default-placeholder-image`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.pimcorePath ?? null
}

export async function saveDefaultPlaceholderImage(baseUrl: string, pimcorePath: string | null): Promise<void> {
  await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/default-placeholder-image`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pimcorePath }),
    credentials: 'include',
  })
}

export interface AutosaveSettings {
  enabled: boolean
  interval: number
}

export async function fetchAutosaveSettings(baseUrl: string): Promise<AutosaveSettings> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/autosave`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return {
    enabled: !!body.enabled,
    interval: typeof body.interval === 'number' ? body.interval : 60,
  }
}

export async function saveAutosaveSettings(baseUrl: string, settings: AutosaveSettings): Promise<void> {
  await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/autosave`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
    credentials: 'include',
  })
}

export async function fetchStripHtmlCommentsSetting(baseUrl: string): Promise<boolean> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/strip-html-comments`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return !!body.enabled
}

export async function saveStripHtmlCommentsSetting(baseUrl: string, enabled: boolean): Promise<void> {
  await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/strip-html-comments`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
    credentials: 'include',
  })
}

export async function fetchLoggingEnabled(baseUrl: string): Promise<boolean> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/logging`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return typeof body.enabled === 'boolean' ? body.enabled : true
}

export async function saveLoggingEnabled(baseUrl: string, enabled: boolean): Promise<void> {
  await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/logging`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
    credentials: 'include',
  })
}

// CDN mirroring settings (docs/plans/assets/assets-cdn.md, docs/plans/assets/cdn-providers-plan.md): per website, with the installation's default as the
// fallback. The provider decides which fields exist; a credential is write-only (`secretsSet` says which ones are stored).
export interface CdnProviderField { name: string; label: string; required?: boolean; secret?: boolean; help?: string; placeholder?: string }
export interface CdnProviderInfo { id: string; label: string; description: string; fields: CdnProviderField[] }

export interface CdnMirrorSettings {
  /** where the effective settings come from: the website's own, the installation's default, or nothing is set */
  scope: 'website' | 'default' | 'none'
  websiteId: string | null
  provider: string
  config: Record<string, string>
  secretsSet: Record<string, boolean>
  /** what is still missing for the provider to be usable */
  missing: string[]
  configured: boolean
  /** this website has settings of its own (false: it uses the default) */
  own: boolean
  // the Cloudinary values the sync script has always read
  gatewayRouteId?: string | null
  uploadPreset?: string | null
}

export interface CdnMirrorInput {
  websiteId?: string | null
  provider: string
  config: Record<string, string>
  /** a credential left out keeps the stored one */
  secrets?: Record<string, string>
}

const cdnQuery = (websiteId?: string | null) => (websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : '')

export async function fetchCdnProviders(baseUrl: string): Promise<CdnProviderInfo[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/cdn-providers`, { credentials: 'include' })
  return (await parseJsonOrThrow(res)).providers
}

/** The settings that apply to a website (its own, else the default); without a website, the default. */
export async function fetchCdnMirrorSettings(baseUrl: string, websiteId?: string | null): Promise<CdnMirrorSettings> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/cdn-mirror${cdnQuery(websiteId)}`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function saveCdnMirrorSettings(baseUrl: string, input: CdnMirrorInput): Promise<CdnMirrorSettings> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/cdn-mirror`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

/** A website's own settings go (it uses the default again); without a website, the default itself goes. */
export async function removeCdnMirrorSettings(baseUrl: string, websiteId?: string | null): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/cdn-mirror${cdnQuery(websiteId)}`, { method: 'DELETE', credentials: 'include' })
  await parseJsonOrThrow(res)
}

export async function testCdnMirrorSettings(baseUrl: string, websiteId?: string | null): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/cdn-mirror/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ websiteId: websiteId ?? undefined }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

// --- Gateway API key (docs/plans/api-gateway/gateway-auth-authz.md) ---
// The plaintext is returned exactly once by regenerate() and never again -
// callers must show it to the admin immediately and never persist it
// client-side beyond that single display.

export async function regenerateWebsiteGatewayApiKey(baseUrl: string, id: string): Promise<{ key: string; prefix: string }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}/gateway-api-key/regenerate`, {
    method: 'POST',
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function clearWebsiteGatewayApiKey(baseUrl: string, id: string): Promise<void> {
  await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}/gateway-api-key`, {
    method: 'DELETE',
    credentials: 'include',
  })
}

// Legacy single-theme API (backward-compatible) — reads/writes the default theme.
export interface WebsiteThemeLegacy {
  colors: { name: string; hex: string }[]
  fonts: string[]
}

export async function fetchWebsiteTheme(baseUrl: string, id: string): Promise<WebsiteThemeLegacy> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}/theme`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.theme
}

export async function updateWebsiteThemeLegacy(baseUrl: string, id: string, theme: WebsiteThemeLegacy): Promise<WebsiteThemeLegacy> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}/theme`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(theme),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.theme
}
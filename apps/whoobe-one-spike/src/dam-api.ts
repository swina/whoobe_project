import { runtimeEnv } from './runtime-env'

// Minimal client for this monorepo's real backend asset library
// (apps/asset-processor). Defaults to the VITE_ASSET_PROCESSOR_URL env var
// (set by .env for production, e.g. https://cms.example.com), or
// on localhost to port 3002 directly (the asset-processor dev server), or
// on a remote host to the page's own origin (nginx proxies /api/v1/* to
// the asset-processor on port 3002). Always sends credentials: 'include'.
//
// This is the one precondition worth being explicit about: this app has no
// login flow of its own. `requireAuth` on the backend means these calls
// only succeed if a session cookie already exists for the current
// hostname - i.e. you're already logged into apps/admin-dashboard in the
// same browser, reached via the same hostname (cookies are host-scoped,
// not port-scoped, so a session from admin-dashboard's own port is sent
// automatically to asset-processor's port 3002 too - see this project's
// established pattern for why). Opening this app via a bare "localhost"
// when you logged in via "develop.local" (or vice versa) will not work.
export interface DamAssetThumbnails {
  thumb: string
  medium: string
  large: string
}

// One provider's CDN mirror of an asset (docs/plans/assets/assets-cdn.md) -
// mirrors packages/core/src/dam/cdn-mirror.ts's CdnMirrorRecord shape,
// duplicated here (not imported from @whoobe-cms/core) to keep this
// hand-rolled client file self-contained, matching its existing pattern
// (DamAssetThumbnails is the same kind of local shape).
export interface DamCdnMirror {
  provider: string
  url: string
  providerAssetId?: string
  mirroredAt: string
  bytesSent: number
}

export interface DamAssetRecord {
  pimcorePath: string
  filename: string
  folderPath: string
  mimeType: string
  sizeBytes: number
  isPublic: boolean
  url: string
  thumbnailUrl: string
  thumbnails: DamAssetThumbnails
  cdnMirrors?: Record<string, DamCdnMirror>
}

export interface DamFolderRecord {
  path: string
  name: string
  parentPath: string
  isPublic: boolean | null
}

export function getDefaultAssetProcessorUrl(): string {
  if (typeof import.meta !== 'undefined' && runtimeEnv('VITE_ASSET_PROCESSOR_URL')) {
    return runtimeEnv('VITE_ASSET_PROCESSOR_URL')!.replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${window.location.protocol}//${hostname}:3002`
    }
    const port = window.location.port
    return `${window.location.protocol}//${hostname}${port ? `:${port}` : ''}`
  }
  return 'http://localhost:3002'
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

/** GET /api/v1/dam/assets - lists real, already-uploaded assets from this
 * project's own DAM, each with a resolved `url` and thumbnail set already
 * attached (the backend does the presigned-vs-public resolution, same as
 * every other caller of this endpoint in this monorepo). Only used to
 * populate MediaPickerModal.vue's grid - the *picked* value stored on a
 * node is always the stable `pimcorePath`, never this resolved `url` (see
 * resolve-display-url.ts for why). */
export async function listDamAssets(folderPath?: string): Promise<DamAssetRecord[]> {
  const base = getDefaultAssetProcessorUrl()
  const params = new URLSearchParams()
  if (folderPath) params.set('folderPath', folderPath)
  const res = await fetch(`${base}/api/v1/dam/assets?${params.toString()}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.assets
}

/** GET /api/v1/dam/folders - returns *every* folder flat, not scoped to a
 * parent (confirmed from the route's own implementation) - MediaPickerModal.
 * vue does the parent/child grouping client-side, filtering by
 * `parentPath` as the user navigates. Root-level folders have
 * `parentPath === "/"` (confirmed against this project's real DAM data). */
export async function listDamFolders(): Promise<DamFolderRecord[]> {
  const base = getDefaultAssetProcessorUrl()
  const res = await fetch(`${base}/api/v1/dam/folders`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.folders
}

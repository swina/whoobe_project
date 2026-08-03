// Minimal client for this monorepo's real backend asset library
// (apps/asset-processor), following the exact same pattern already
// established in apps/whoobe-studio (a different, standalone-embedded app
// in this monorepo that also has no auth/session UI of its own): default
// to whatever hostname this page was loaded from, on port 3002, and always
// send `credentials: 'include'`.
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

export interface DamAssetRecord {
  pimcorePath: string
  filename: string
  folderPath: string
  mimeType: string
  isPublic: boolean
  url: string
  thumbnailUrl: string
  thumbnails: DamAssetThumbnails
}

export interface DamFolderRecord {
  path: string
  name: string
  parentPath: string
  isPublic: boolean | null
}

function getDefaultAssetProcessorUrl(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:3002`
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

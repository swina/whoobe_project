import { ApiClient } from '@whoobe-cms/renderer'

// Orchestrates CDN mirroring (docs/plans/assets/assets-cdn.md) for every
// image referenced by a website's published pages, as a step to run before
// (or alongside) publishing a production site - see Fase B of
// docs referenced in CHANGES.md's "publish site" entry. Talks to core-api
// purely over HTTP (no direct DB access - this is a CLI tool, same
// constraint as the rest of packages/publish), reusing:
//  - ApiClient.listPages() (already public, no auth)
//  - GET /public/dam/assets/mirror-status (public, added alongside this)
//  - POST /auth/login + POST /api/v1/dam/assets/:id/mirror-cdn (both need
//    an authenticated session - a dedicated service account, see below)

export interface SyncCdnOptions {
  apiUrl: string
  websiteId: string
  /** Service-account credentials - never pass these as CLI args (they'd
   *  leak via `ps`/shell history); read from env in the bin entrypoint. */
  email: string
  password: string
  /** The OLD way: a Gateway route id for Cloudinary's upload route (and `uploadPreset`). When omitted - the normal case - the server's settings for the
   *  website apply (its own CDN, else the installation's default: Cloudinary or Cloudflare Images). An explicit value here wins over them. */
  gatewayRouteId?: string
  uploadPreset?: string
  provider?: string
  /** Base URL of asset-processor, which owns POST /api/v1/dam/assets/:id/
   *  mirror-cdn - a DIFFERENT service from core-api (apiUrl above), on a
   *  different port in local dev (3002 vs 3003) even though both live under
   *  the same hostname once behind nginx (which routes /api/v1/* to
   *  asset-processor - see deploy/nginx/_locations.conf.template). Defaults
   *  to apiUrl, correct for any nginx-fronted deployment; must be set
   *  explicitly when running against raw local-dev ports. */
  assetProcessorUrl?: string
}

/** Same walk as packages/core/src/dam/resolve-content-image-refs.ts's
 *  collectImageRefs() - duplicated rather than depending on @whoobe-cms/core
 *  (a Node/DB-only package with a much heavier dependency chain) for a
 *  10-line pure function; this script only ever talks HTTP, never DB. */
function collectImageRefs(content: unknown): Set<string> {
  const refs = new Set<string>()
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return
    const url = node.image?.url
    if (typeof url === 'string' && (url.startsWith('/') && !url.startsWith('//'))) refs.add(url)
    if (Array.isArray(node.blocks)) node.blocks.forEach(walk)
  }
  walk(content)
  return refs
}

async function login(apiUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => ({}) as any)
  if (body?.mfaRequired) {
    throw new Error(
      'The sync service account has MFA enabled - use a dedicated account without TOTP for automation (WHOOBE_SYNC_EMAIL/WHOOBE_SYNC_PASSWORD).',
    )
  }
  if (!res.ok) {
    throw new Error(`Login failed: ${body?.error ?? res.status}`)
  }
  const setCookie = res.headers.get('set-cookie')
  const match = setCookie?.match(/wcms_session=[^;]+/)
  if (!match) throw new Error('Login succeeded but no session cookie was returned.')
  return match[0]
}

interface SavedCdnMirrorSettings {
  provider: string
  /** the provider's settings are complete: an upload can be tried */
  configured: boolean
  scope: 'website' | 'default' | 'none'
  missing?: string[]
}

/** The CDN settings that apply to the website (its own, else the installation's default), the same ones the dashboard shows
 *  (docs/plans/assets/cdn-providers-plan.md). Needs the service account to have the objects:read permission; null (not a thrown error) on any failure. */
async function fetchSavedCdnMirrorSettings(apiUrl: string, cookie: string, websiteId: string): Promise<SavedCdnMirrorSettings | null> {
  try {
    const res = await fetch(`${apiUrl}/whoobe-one/settings/cdn-mirror?websiteId=${encodeURIComponent(websiteId)}`, { headers: { Cookie: cookie } })
    if (!res.ok) return null
    return (await res.json()) as SavedCdnMirrorSettings
  } catch {
    return null
  }
}

async function fetchMirrorStatus(
  apiUrl: string,
  refs: string[],
  provider?: string,
): Promise<Record<string, { mirrored: boolean; assetId: string | null }>> {
  if (refs.length === 0) return {}
  const qs = new URLSearchParams({ paths: refs.join(',') })
  // only a mirror at THIS provider counts: two websites may use two CDNs for one shared asset
  if (provider) qs.set('provider', provider)
  const res = await fetch(`${apiUrl}/public/dam/assets/mirror-status?${qs.toString()}`)
  if (!res.ok) throw new Error(`mirror-status lookup failed: ${res.status}`)
  const body = (await res.json()) as { status: Record<string, { mirrored: boolean; assetId: string | null }> }
  return body.status ?? {}
}

export async function syncCdnAssets(options: SyncCdnOptions): Promise<void> {
  const apiUrl = options.apiUrl.replace(/\/+$/, '')
  const assetProcessorUrl = (options.assetProcessorUrl ?? options.apiUrl).replace(/\/+$/, '')
  const client = new ApiClient(apiUrl)

  console.log('Logging in...')
  const cookie = await login(apiUrl, options.email, options.password)

  // The provider and its settings come from the server, for THIS website (its own, else the installation's default). An explicit --gateway-route-id is the
  // old way (Cloudinary through that Gateway route) and still wins.
  const explicit = !!options.gatewayRouteId
  let provider = options.provider
  if (!explicit) {
    const saved = await fetchSavedCdnMirrorSettings(apiUrl, cookie, options.websiteId)
    if (!saved || !saved.configured) {
      throw new Error(
        saved && saved.scope !== 'none'
          ? `The CDN set for this website is incomplete (missing: ${(saved.missing ?? []).join(', ')}) - complete it in the website's settings or in Settings → DAM → CDN Mirroring.`
          : 'No CDN is set up for this website - set one in the website\'s settings or the installation\'s default under Settings → DAM → CDN Mirroring (or pass --gateway-route-id for Cloudinary).',
      )
    }
    provider = saved.provider
    console.log(`Using the ${saved.scope === 'website' ? "website's own" : "installation's default"} CDN settings (${saved.provider}).`)
  }

  console.log('Listing published pages...')
  const pages = await client.listPages(options.websiteId)

  const refs = new Set<string>()
  for (const page of pages) {
    for (const ref of collectImageRefs(page.content)) refs.add(ref)
  }
  console.log(`Found ${refs.size} unique image reference(s) across ${pages.length} page(s).`)

  const status = await fetchMirrorStatus(apiUrl, [...refs], explicit ? (provider ?? 'cloudinary') : provider)
  const toMirror = [...refs].filter((ref) => status[ref]?.assetId && !status[ref].mirrored)
  const alreadyMirrored = [...refs].filter((ref) => status[ref]?.mirrored).length
  const unresolvable = [...refs].filter((ref) => !status[ref]?.assetId).length

  console.log(`${alreadyMirrored} already mirrored, ${toMirror.length} to mirror, ${unresolvable} unresolvable (skipped).`)

  let mirrored = 0
  let failed = 0
  for (const ref of toMirror) {
    const assetId = status[ref].assetId!
    try {
      const res = await fetch(`${assetProcessorUrl}/api/v1/dam/assets/${assetId}/mirror-cdn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(explicit ? { gatewayRouteId: options.gatewayRouteId, uploadPreset: options.uploadPreset, provider } : { websiteId: options.websiteId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as any)
        // `detail` carries the CDN provider's own error (e.g. Cloudinary's
        // "Upload preset must be whitelisted for unsigned uploads") - the
        // top-level `error` alone ("CDN mirror upload failed") isn't
        // actionable on its own, found the hard way debugging this script.
        const detail = body?.detail?.body?.error?.message ?? body?.detail
        throw new Error([body?.error ?? `HTTP ${res.status}`, detail ? JSON.stringify(detail) : null].filter(Boolean).join(' - '))
      }
      mirrored += 1
      console.log(`  mirrored: ${ref}`)
    } catch (err) {
      failed += 1
      console.error(`  FAILED: ${ref} - ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(`\nDone. ${mirrored} mirrored, ${failed} failed, ${alreadyMirrored} already mirrored, ${unresolvable} unresolvable.`)
  if (failed > 0) {
    throw new Error(`${failed} asset(s) failed to mirror.`)
  }
}

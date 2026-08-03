// Ported from apps/whoobe-studio's own resolve-display-url.ts (same
// monorepo, different standalone app, identical underlying problem) -
// picked assets are stored as stable Pimcore-style paths (e.g.
// "/communication/hero.jpg"), never a resolved URL. Baking a resolved URL
// into a node's `image.url` at pick time would mean storing something
// that goes stale: presigned private-asset URLs expire in about an hour,
// the same reason this project's own DAM asset records never store URLs
// either (see packages/core/src/db/asset-records.ts). This resolves a raw
// path to a real, currently-valid URL on demand at render time instead,
// with a shared in-memory cache so the same path appearing in multiple
// nodes/renders isn't re-fetched every time.
import { reactive } from 'vue'

function getDefaultAssetProcessorUrl(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:3002`
  }
  return 'http://localhost:3002'
}

async function fetchAssetUrl(pimcorePath: string): Promise<string> {
  const base = getDefaultAssetProcessorUrl()
  const params = new URLSearchParams({ pimcorePath })
  const res = await fetch(`${base}/api/v1/dam/asset-urls?${params.toString()}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to resolve asset URL (${res.status})`)
  const body = await res.json()
  return body.url
}

const cache = reactive<Record<string, string | null>>({})
const inFlight = new Set<string>()

function looksLikeRawPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
}

/**
 * Returns the value unchanged if it's already a real URL (a full https://
 * URL, a data: URI from applyImagePlaceholder(), etc.) or not a string at
 * all. If it looks like a raw Pimcore-style path, kicks off (at most once)
 * an async resolution via asset-processor and returns undefined until it
 * completes - the cache is reactive, so the caller's template re-renders
 * once the real URL lands.
 */
export function resolveDisplayUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!looksLikeRawPath(value)) return value

  if (value in cache) return cache[value] ?? undefined

  if (!inFlight.has(value)) {
    inFlight.add(value)
    fetchAssetUrl(value)
      .then((url) => {
        cache[value] = url
      })
      .catch((e) => {
        console.warn(`resolveDisplayUrl: failed to resolve "${value}":`, e)
        cache[value] = null
      })
      .finally(() => inFlight.delete(value))
  }
  return undefined
}

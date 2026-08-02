// Migrated documents store image/video references as stable Pimcore-style
// paths (e.g. "/communication/hero.jpg"), never a resolved URL - baking a
// resolved URL into cms_documents.root_block at migration time would mean
// storing something that goes stale (presigned private-asset URLs expire
// in ~1h, same reason the DAM's own asset records never store URLs either,
// see dam-schema.ts). This resolves a raw path to a real, currently-valid
// URL on demand at render time instead, with a shared in-memory cache so
// the same path appearing in multiple nodes/renders isn't re-fetched.
import { reactive } from 'vue'
import { fetchAssetUrls } from './dam-api'
import { useDamStore } from '../stores/damStore'

const cache = reactive<Record<string, string | null>>({})
const inFlight = new Set<string>()

function looksLikeRawPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
}

/**
 * Returns the value unchanged if it's already a real URL (an external
 * image pasted via MediaUrlImporter, a data: URI, etc.) or not a string at
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
    const damStore = useDamStore()
    fetchAssetUrls(damStore.config.assetProcessorUrl, value, damStore.config.folderRules)
      .then((urls) => {
        cache[value] = urls.url
      })
      .catch((e) => {
        console.warn(`resolveDisplayUrl: failed to resolve "${value}":`, e)
        cache[value] = null
      })
      .finally(() => inFlight.delete(value))
  }
  return undefined
}

const BACKGROUND_IMAGE_URL_RE = /^url\((.+)\)$/

/**
 * Resolves a raw path embedded in a `style.backgroundImage: "url(...)"`
 * value the same way resolveDisplayUrl does for a plain src, without
 * mutating the node's own style object. Drops backgroundImage entirely
 * while resolution is pending, rather than requesting a browser load of a
 * relative path that isn't a URL at all.
 */
export function resolveStyleBackgroundImage(style: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!style?.backgroundImage) return style
  const match = style.backgroundImage.match(BACKGROUND_IMAGE_URL_RE)
  if (!match) return style

  const resolved = resolveDisplayUrl(match[1])
  if (!resolved) {
    const { backgroundImage: _drop, ...rest } = style
    return rest
  }
  return { ...style, backgroundImage: `url(${resolved})` }
}

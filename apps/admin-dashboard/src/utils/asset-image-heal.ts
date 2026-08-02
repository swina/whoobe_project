import { AssetItem, useDamStore } from '../stores/damStore'

export const FALLBACK_ASSET_IMAGE_URL = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'

// Assets uploaded before the DAM backend refactor can have stale/broken
// cached URLs (old bucket names, placeholder signed URLs, etc). On a load
// failure, try once to re-resolve a fresh URL from the backend using the
// asset's stable pimcorePath before giving up to a visual placeholder.
export async function handleAssetImageError(event: Event, asset: AssetItem) {
  const target = event.target as HTMLImageElement

  if (target.dataset.healAttempted === 'true') {
    target.src = FALLBACK_ASSET_IMAGE_URL
    return
  }
  target.dataset.healAttempted = 'true'

  const failedSrc = target.src
  const damStore = useDamStore()
  try {
    const fresh = await damStore.generateAssetUrl(asset.pimcorePath)
    asset.url = fresh.url
    asset.thumbnailUrl = fresh.thumbnailUrl
    asset.thumbnails = fresh.thumbnails

    const unchanged = fresh.url === failedSrc && fresh.thumbnailUrl === failedSrc
    if (unchanged) {
      target.src = FALLBACK_ASSET_IMAGE_URL
    }
    // Otherwise the reactive asset.url/thumbnailUrl update above causes
    // Vue to re-bind :src and the browser retries loading automatically.
  } catch (error) {
    console.warn(`Could not refresh URL for ${asset.pimcorePath}:`, error)
    target.src = FALLBACK_ASSET_IMAGE_URL
  }
}

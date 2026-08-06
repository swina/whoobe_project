// Shared asset-category filter - used by AssetPickerModal.vue (to narrow
// what's browsable) and ClassSettingsCard.vue (to author an `asset`
// field's own filter). Mirrors AssetsView.vue's own IMAGE/VIDEO/DOCUMENT/
// ARCHIVE filterType categories and asset-file-icons.ts's PREVIEWABLE_
// IMAGE_TYPES exactly, rather than inventing a second categorization
// scheme for the same file types.
import { PREVIEWABLE_IMAGE_TYPES } from './asset-file-icons'
import type { AssetItem } from '../stores/damStore'

export type AssetCategoryFilter = 'any' | 'image' | 'video' | 'document' | 'archive'

export const ASSET_CATEGORY_LABELS: Record<AssetCategoryFilter, string> = {
  any: 'Any file type',
  image: 'Images only',
  video: 'Videos only',
  document: 'Documents only',
  archive: 'Archives only',
}

export function matchesAssetCategory(fileType: string, filter: AssetCategoryFilter | undefined): boolean {
  switch (filter ?? 'any') {
    case 'image':
      return PREVIEWABLE_IMAGE_TYPES.includes(fileType)
    case 'video':
      return fileType === 'MP4'
    case 'document':
      return fileType === 'PDF'
    case 'archive':
      return fileType === 'ZIP'
    default:
      return true
  }
}

export function filterAssetsByCategory(assets: AssetItem[], filter: AssetCategoryFilter | undefined): AssetItem[] {
  return assets.filter((a) => matchesAssetCategory(a.fileType, filter))
}

import JSZip from 'jszip'
import {
  exportWebsite,
  importWebsite,
  type AssetPlanEntry,
  type BundleAssetEntry,
  type WebsiteBundlePayload,
  type WebsiteImportReport,
} from './websites-api'
import type { FolderVisibilityRule } from '@whoobe-cms/core'
import { fetchAssetById, uploadAssetToDam } from './dam-api'

// Website bundle as a .zip: `bundle.json` (the manifest, version 2) and `assets/<n>-<name>` (the files). Built and
// read in the browser: the files come from, and go back to, the asset-processor through the same endpoints the DAM
// view uses, so permissions, limits and the sandbox's caps apply as they do for any upload.

export interface DamEndpoint {
  assetProcessorUrl: string
  folderRules: FolderVisibilityRule[]
}

export type Progress = (message: string) => void

const safeName = (s: string) => s.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'file'

async function downloadAsset(dam: DamEndpoint, asset: BundleAssetEntry): Promise<Blob | null> {
  try {
    const record = await fetchAssetById(dam.assetProcessorUrl, asset.id, dam.folderRules)
    // private assets need the session; a public one may refuse credentials on a cross-origin CDN, so try both
    for (const credentials of ['include', 'omit'] as RequestCredentials[]) {
      const res = await fetch(record.url, { credentials })
      if (res.ok) return await res.blob()
    }
  } catch {
    // reported by the caller as a missing file
  }
  return null
}

/** The zip of a website; with `withAssets: false` the assets are listed but their files are not included. */
export async function buildWebsiteZip(
  coreApiUrl: string,
  dam: DamEndpoint,
  websiteId: string,
  options: { withAssets: boolean; dataObjects: 'all' | 'referenced' },
  progress: Progress = () => {}
): Promise<{ blob: Blob; assets: number; missing: string[] }> {
  progress('Reading the website…')
  const bundle = await exportWebsite(coreApiUrl, websiteId, { dataObjects: options.dataObjects })
  const zip = new JSZip()
  const missing: string[] = []
  const assets = bundle.assets ?? []
  let stored = 0
  if (options.withAssets) {
    for (const [i, asset] of assets.entries()) {
      progress(`Assets ${i + 1}/${assets.length}: ${asset.pimcorePath}`)
      const file = await downloadAsset(dam, asset)
      if (!file) { missing.push(asset.pimcorePath); continue }
      asset.file = `assets/${String(i + 1).padStart(4, '0')}-${safeName(asset.filename)}`
      zip.file(asset.file, file)
      stored++
    }
  }
  zip.file('bundle.json', JSON.stringify(bundle, null, 2))
  progress('Compressing…')
  // images and most media are compressed already: store them, deflate only the JSON
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true })
  return { blob, assets: stored, missing }
}

export interface OpenedBundle {
  bundle: WebsiteBundlePayload
  /** the files of the archive by their path in it (empty for a plain .json) */
  zip: JSZip | null
}

export async function openBundleFile(file: File): Promise<OpenedBundle> {
  if (file.name.toLowerCase().endsWith('.json')) {
    return { bundle: JSON.parse(await file.text()), zip: null }
  }
  const zip = await JSZip.loadAsync(file)
  const manifest = zip.file('bundle.json')
  if (!manifest) throw new Error('Not a website bundle: bundle.json is missing')
  return { bundle: JSON.parse(await manifest.async('string')), zip }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function uploadWithRetry(dam: DamEndpoint, blob: Blob, entry: AssetPlanEntry, asset: BundleAssetEntry) {
  const filename = entry.targetPath.split('/').pop() || asset.filename
  for (let attempt = 0; ; attempt++) {
    try {
      return await uploadAssetToDam(dam.assetProcessorUrl, blob, filename, entry.targetPath, asset.isPublic, dam.folderRules, asset.metadata as any)
    } catch (e: any) {
      // the edge rate limit answers 429: wait and try again, a few times
      if (attempt < 4 && /429|too many/i.test(String(e?.message))) { await sleep(1000 * (attempt + 1)); continue }
      throw e
    }
  }
}

export interface ImportOutcome {
  report: WebsiteImportReport
  uploaded: number
  failed: { path: string; error: string }[]
}

/** What an import would do, without writing anything (the asset plan included). */
export function previewBundleImport(coreApiUrl: string, opened: OpenedBundle): Promise<WebsiteImportReport> {
  return importWebsite(coreApiUrl, opened.bundle, { dryRun: true })
}

/** Stores the asset files that are new here, then imports the website with the mapping from old to new ids. */
export async function importOpenedBundle(
  coreApiUrl: string,
  dam: DamEndpoint,
  opened: OpenedBundle,
  progress: Progress = () => {}
): Promise<ImportOutcome> {
  progress('Checking what is already here…')
  const preview = await previewBundleImport(coreApiUrl, opened)
  const assets = new Map((opened.bundle.assets ?? []).map((a) => [a.id, a]))
  const assetMap: Record<string, { id: string; pimcorePath: string }> = {}
  const failed: ImportOutcome['failed'] = []
  let uploaded = 0

  const todo = preview.assets.filter((a) => a.action !== 'reuse')
  for (const [i, entry] of todo.entries()) {
    const asset = assets.get(entry.id)
    const zipFile = asset?.file && opened.zip ? opened.zip.file(asset.file) : null
    if (!asset || !zipFile) { failed.push({ path: entry.pimcorePath, error: 'the file is not in the archive' }); continue }
    progress(`Assets ${i + 1}/${todo.length}: ${entry.targetPath}`)
    try {
      const blob = new Blob([await zipFile.async('arraybuffer')], { type: asset.mimeType || 'application/octet-stream' })
      const result = await uploadWithRetry(dam, blob, entry, asset)
      assetMap[entry.id] = { id: result.asset.id, pimcorePath: result.asset.pimcorePath }
      uploaded++
    } catch (e: any) {
      failed.push({ path: entry.pimcorePath, error: e?.message || 'upload failed' })
    }
  }

  progress('Importing the website…')
  // a documentation website: the same folder the files were stored in
  const report = await importWebsite(coreApiUrl, opened.bundle, { assetMap, docsFolder: preview.docs?.targetFolder })
  return { report, uploaded, failed }
}

/** Builds the zip of a website and offers it as a download. A documentation website is its files, so they are always included. */
export async function downloadWebsiteZip(
  coreApiUrl: string,
  dam: DamEndpoint,
  website: { id: string; name: string },
  options: { withAssets: boolean; dataObjects: 'all' | 'referenced' },
  progress: Progress = () => {}
): Promise<{ assets: number; missing: string[] }> {
  const { blob, assets, missing } = await buildWebsiteZip(coreApiUrl, dam, website.id, options, progress)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${website.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-export.zip`
  a.click()
  URL.revokeObjectURL(url)
  return { assets, missing }
}

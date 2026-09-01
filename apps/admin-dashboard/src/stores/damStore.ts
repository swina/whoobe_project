import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import JSZip from 'jszip'
import {
  FolderVisibilityManager,
  FolderVisibilityRule,
  ThumbnailPreset,
  ExtractedAssetMetadata,
  AssetMetadataExtractor,
  getFileTypeFromFilename
} from '@whoobe-cms/core'
import {
  fetchDamInfo,
  uploadAssetToDam,
  deleteAssetFromDam,
  fetchAssetUrls,
  ensureDamBucket,
  fetchFolders,
  createFolderApi,
  deleteFolderApi,
  fetchAssets,
  updateAssetMetadataApi,
  transformAssetOnDam,
  regenerateThumbnailsApi,
  DamBackendInfo,
  DamFolderRecord,
  DamAssetRecordWithUrls,
  TransformOptions,
  getDefaultAssetProcessorUrl
} from '../utils/dam-api'
import { isStaleLocalhostUrl } from '../utils/stale-localhost'

const CONFIG_STORAGE_KEY = 'whoobe_custom_dam_config'

// Only non-secret, client-relevant settings live here. Bucket, endpoint,
// and S3 credentials are owned exclusively by the asset-processor backend
// (its own environment variables) and are never sent to or stored by the
// browser - see dam-api.ts and apps/asset-processor/src/server.ts.
//
// Folders and assets themselves are NOT persisted here (see folders/assets
// refs below) - this is a multi-user system, so the browser's localStorage
// can no longer be the source of truth for what exists. Postgres is - see
// packages/core/src/db/dam-schema.ts.
export interface DamConfigState {
  assetProcessorUrl: string
  folderRules: FolderVisibilityRule[]
}

export interface FolderItem {
  name: string
  path: string // e.g. /logos
  parentPath: string // e.g. /
  isPublic?: boolean
  createdAt: string
}

export interface AssetItem {
  id: string
  pimcorePath: string // asset path (e.g. /logos/brand_banner.png)
  filename: string
  folderPath: string // e.g. /logos or /
  sizeBytes: number
  sizeFormatted: string
  mimeType: string
  fileType: string // PNG, PDF, MP4, ZIP, etc.
  version: number
  uploadedAt: string
  updatedAt: string
  s3Key: string
  isPublic: boolean
  url?: string
  // Ephemeral, in-memory-only immediate preview right after upload - never
  // sent to or persisted by the backend (too large for a DB column; the S3
  // thumbnails already serve this purpose for anything beyond the current
  // browser session).
  dataUrl?: string
  thumbnailUrl?: string
  thumbnails?: Record<ThumbnailPreset, string>
  metadata?: ExtractedAssetMetadata
}

const defaultConfig: DamConfigState = {
  assetProcessorUrl: getDefaultAssetProcessorUrl(),
  folderRules: [
    { pathPrefix: '/public/**', isPublic: true },
    { pathPrefix: '/uploads/marketing/**', isPublic: true }
  ]
}

const defaultDamInfo: DamBackendInfo = {
  bucket: '',
  endpoint: '',
  publicBaseUrl: '',
  keyPrefix: ''
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve((e.target?.result as string) || '')
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })
}

function toFolderItem(record: DamFolderRecord): FolderItem {
  return {
    name: record.name,
    path: record.path,
    parentPath: record.parentPath,
    isPublic: record.isPublic ?? undefined,
    createdAt: record.createdAt
  }
}

function toAssetItem(record: DamAssetRecordWithUrls, dataUrl?: string): AssetItem {
  return {
    id: record.id,
    pimcorePath: record.pimcorePath,
    filename: record.filename,
    folderPath: record.folderPath,
    sizeBytes: record.sizeBytes,
    sizeFormatted: formatBytes(record.sizeBytes),
    mimeType: record.mimeType,
    fileType: record.fileType,
    version: record.version,
    uploadedAt: record.uploadedAt,
    updatedAt: record.updatedAt,
    s3Key: record.s3Key,
    isPublic: record.isPublic,
    url: record.url,
    dataUrl,
    thumbnailUrl: record.thumbnailUrl,
    thumbnails: record.thumbnails,
    metadata: record.metadata ?? undefined
  }
}

function loadInitialConfig(): DamConfigState {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Reconstruct explicitly (rather than spreading `parsed`) so any
      // legacy accessKeyId/secretAccessKey persisted by older versions of
      // this store is dropped instead of being carried forward.
      const storedUrl = typeof parsed.assetProcessorUrl === 'string' ? parsed.assetProcessorUrl : ''
      return {
        assetProcessorUrl: storedUrl && !isStaleLocalhostUrl(storedUrl)
          ? storedUrl
          : defaultConfig.assetProcessorUrl,
        folderRules: Array.isArray(parsed.folderRules) ? parsed.folderRules : [...defaultConfig.folderRules]
      }
    }
  } catch (e) {
    console.error('Failed to load DAM config:', e)
  }
  return { ...defaultConfig, folderRules: [...defaultConfig.folderRules] }
}

export const useDamStore = defineStore('dam', () => {
  // Config state (per-browser UI settings only - see DamConfigState doc comment)
  const config = ref<DamConfigState>(loadInitialConfig())
  // Overwrite storage immediately so any plaintext secret persisted by an
  // older version of this store is purged from localStorage right away.
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config.value))
  watch(config, (newVal) => localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(newVal)), { deep: true })

  // Backend-owned, non-secret storage info (bucket/endpoint/publicBaseUrl),
  // fetched from the asset-processor service - never held as client config.
  const damInfo = ref<DamBackendInfo>({ ...defaultDamInfo })

  // Folders & assets: fetched from Postgres via asset-processor - the
  // multi-user source of truth. Not persisted to localStorage.
  const folders = ref<FolderItem[]>([])
  const assets = ref<AssetItem[]>([])
  const isLoadingAssets = ref(false)

  const currentFolderPath = ref<string>('/')
  const connectionStatus = ref<'idle' | 'testing' | 'success' | 'error'>('idle')
  const statusMessage = ref<string>('')

  // Persist the last-selected folder across sessions
  const FOLDER_PATH_KEY = 'whoobe:dam-current-folder-path'
  try {
    const saved = localStorage.getItem(FOLDER_PATH_KEY)
    if (saved) currentFolderPath.value = saved
  } catch { /* ignore */ }

  function saveCurrentFolderPath() {
    try { localStorage.setItem(FOLDER_PATH_KEY, currentFolderPath.value) } catch { /* ignore */ }
  }

  // Auto-persist on every navigation
  watch(currentFolderPath, () => { saveCurrentFolderPath() })

  async function refreshDamInfo(): Promise<void> {
    try {
      damInfo.value = await fetchDamInfo(config.value.assetProcessorUrl)
    } catch (e) {
      console.warn('Could not load DAM backend info:', e)
    }
  }

  async function refreshFolders(): Promise<void> {
    try {
      const records = await fetchFolders(config.value.assetProcessorUrl)
      folders.value = records.map(toFolderItem)
    } catch (e) {
      console.warn('Could not load folders:', e)
    }
  }

  async function refreshAssets(): Promise<void> {
    isLoadingAssets.value = true
    try {
      const records = await fetchAssets(config.value.assetProcessorUrl, config.value.folderRules)
      // Keep any in-memory dataUrl previews already attached this session.
      const dataUrlByPath = new Map(assets.value.map((a) => [a.pimcorePath, a.dataUrl]))
      assets.value = records.map((r) => toAssetItem(r, dataUrlByPath.get(r.pimcorePath)))
    } catch (e) {
      console.warn('Could not load assets:', e)
    } finally {
      isLoadingAssets.value = false
    }
  }

  refreshDamInfo()
  refreshFolders()
  refreshAssets()

  watch(
    () => config.value.assetProcessorUrl,
    () => {
      refreshDamInfo()
      refreshFolders()
      refreshAssets()
    }
  )

  const visibilityManager = computed(() => {
    return new FolderVisibilityManager(config.value.folderRules)
  })

  function isPathPublic(pimcorePath: string): boolean {
    // 1. Check most specific folder in folders list
    const matchingFolders = folders.value
      .filter((f) => f.path !== '/' && (pimcorePath === f.path || pimcorePath.startsWith(f.path + '/')))
      .sort((a, b) => b.path.length - a.path.length)

    if (matchingFolders.length > 0 && typeof matchingFolders[0].isPublic === 'boolean') {
      return matchingFolders[0].isPublic
    }

    // 2. Fall back to FolderVisibilityManager rules
    return visibilityManager.value.isPathPublic(pimcorePath)
  }

  // Filtered subfolders & assets for current folder view
  const currentSubfolders = computed(() => {
    return folders.value.filter((f) => f.parentPath === currentFolderPath.value)
  })

  const currentAssets = computed(() => {
    return assets.value.filter((a) => a.folderPath === currentFolderPath.value)
  })

  // Resolves real (public or freshly-presigned) URLs from the DAM backend.
  async function generateAssetUrl(pimcorePath: string): Promise<{
    isPublic: boolean
    url: string
    thumbnailUrl: string
    thumbnails: Record<ThumbnailPreset, string>
  }> {
    return fetchAssetUrls(config.value.assetProcessorUrl, pimcorePath, config.value.folderRules)
  }

  // --- Folder Management ---
  async function createFolder(folderName: string, isPublic: boolean = false, parentPath?: string): Promise<void> {
    const cleanName = folderName.trim().replace(/[\/\\]/g, '')
    if (!cleanName) return

    const parent = parentPath ?? currentFolderPath.value
    const folderPath = parent === '/' ? `/${cleanName}` : `${parent}/${cleanName}`

    if (folders.value.some((f) => f.path === folderPath)) {
      throw new Error(`Folder "${folderPath}" already exists.`)
    }

    const record = await createFolderApi(config.value.assetProcessorUrl, {
      path: folderPath,
      name: cleanName,
      parentPath: parent,
      isPublic
    })
    folders.value.push(toFolderItem(record))

    // Automatically register folder visibility rule
    addFolderRule(`${folderPath}/**`, isPublic)
  }

  // Upload progress tracking — updated during uploadMultipleAssets/uploadZipAsset
const uploadProgress = ref<{ current: number; total: number; label: string } | null>(null)

async function uploadMultipleAssets(files: File[], folderPath?: string, isPublicOverride?: boolean): Promise<AssetItem[]> {
    const uploaded: AssetItem[] = []
    uploadProgress.value = { current: 0, total: files.length, label: 'Starting...' }
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      uploadProgress.value = { current: i, total: files.length, label: file.name }
      if (file.name.toLowerCase().endsWith('.zip')) {
        await uploadZipAsset(file, folderPath, true, isPublicOverride)
      } else {
        const item = await uploadAsset(file, folderPath, isPublicOverride)
        uploaded.push(item)
      }
      uploadProgress.value = { current: i + 1, total: files.length, label: file.name }
    }
    uploadProgress.value = null
    return uploaded
  }

  async function deleteFolder(folderPath: string): Promise<void> {
    if (folderPath === '/') return

    const targetFolder = folders.value.find((f) => f.path === folderPath)
    const parentPath = targetFolder?.parentPath ?? '/'

    await deleteFolderApi(config.value.assetProcessorUrl, folderPath, config.value.folderRules)

    // Remove folder and subfolders
    folders.value = folders.value.filter((f) => f.path !== folderPath && !f.path.startsWith(folderPath + '/'))
    // Remove all assets inside folder and subfolders
    assets.value = assets.value.filter((a) => a.folderPath !== folderPath && !a.folderPath.startsWith(folderPath + '/'))

    // Reset current view to parent folder if currently viewing deleted folder or subfolder
    if (currentFolderPath.value === folderPath || currentFolderPath.value.startsWith(folderPath + '/')) {
      currentFolderPath.value = parentPath
    }
  }

  async function uploadAsset(file: File, folderPath?: string, isPublicOverride?: boolean): Promise<AssetItem> {
    const targetFolder = folderPath ?? currentFolderPath.value
    const pimcorePath = targetFolder === '/' ? `/${file.name}` : `${targetFolder}/${file.name}`
    const { mimeType } = getFileTypeFromFilename(file.name)
    const isPublic = isPublicOverride ?? isPathPublic(pimcorePath)

    let dataUrl: string | undefined
    if (file.type.startsWith('image/')) {
      dataUrl = await readFileAsDataUrl(file)
    }

    // Extract technical & EXIF metadata via Core or Microservice worker
    let metadata: ExtractedAssetMetadata | undefined
    try {
      const arrayBuffer = await file.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)
      metadata = await AssetMetadataExtractor.extractMetadata(uint8, file.type || mimeType)
    } catch (e) {
      console.warn('Metadata extraction warning:', e)
    }

    // Upload binary file + persist its DB record in one call via the DAM
    // backend, which alone holds S3 credentials.
    const result = await uploadAssetToDam(config.value.assetProcessorUrl, file, file.name, pimcorePath, isPublic, config.value.folderRules, metadata)
    const newAsset = toAssetItem(result.asset, dataUrl)

    const existingIndex = assets.value.findIndex((a) => a.pimcorePath === pimcorePath)
    if (existingIndex >= 0) {
      assets.value[existingIndex] = newAsset
    } else {
      assets.value.unshift(newAsset)
    }

    return newAsset
  }

  // --- Zip Asset Upload & Auto-Extract ---
  async function uploadZipAsset(
    zipFile: File,
    folderPath?: string,
    autoExtract: boolean = true,
    isPublicOverride?: boolean
  ): Promise<{ extractedCount: number; rootAsset?: AssetItem }> {
    const targetFolder = folderPath ?? currentFolderPath.value

    if (!autoExtract) {
      const asset = await uploadAsset(zipFile, targetFolder, isPublicOverride)
      return { extractedCount: 0, rootAsset: asset }
    }

    // Auto-extract zip contents
    const zip = await JSZip.loadAsync(zipFile)
    const extractedFolder = zipFile.name.replace(/\.zip$/i, '')
    const baseExtractPath = targetFolder === '/' ? `/${extractedFolder}` : `${targetFolder}/${extractedFolder}`

    // Ensure folder exists
    try {
      await createFolder(extractedFolder, isPublicOverride ?? false, targetFolder)
    } catch {
      // Ignore if folder already exists
    }

    let extractedCount = 0
    const entries = Object.keys(zip.files)

    for (const relativePath of entries) {
      const zipEntry = zip.files[relativePath]
      if (zipEntry.dir) {
        // Create directory
        const dirParts = relativePath.split('/').filter(Boolean)
        let currPath = baseExtractPath
        for (const dirName of dirParts) {
          const newPath = currPath === '/' ? `/${dirName}` : `${currPath}/${dirName}`
          if (!folders.value.some((f) => f.path === newPath)) {
            try {
              await createFolder(dirName, isPublicOverride ?? false, currPath)
            } catch {
              // Ignore if folder already exists
            }
          }
          currPath = newPath
        }
      } else {
        // Extract file
        const blob = await zipEntry.async('blob')
        const entryFilename = relativePath.split('/').pop() || relativePath
        const fileFolderDir = relativePath.includes('/') ? relativePath.substring(0, relativePath.lastIndexOf('/')) : ''
        const entryFolderPath = fileFolderDir ? `${baseExtractPath}/${fileFolderDir}` : baseExtractPath

        const extractedFile = new File([blob], entryFilename, { type: blob.type })
        await uploadAsset(extractedFile, entryFolderPath, isPublicOverride)
        extractedCount++
      }
    }

    return { extractedCount }
  }

  // --- Upload New Version ---
  async function uploadNewVersion(assetId: string, newFile: File): Promise<AssetItem> {
    const targetAsset = assets.value.find((a) => a.id === assetId)
    if (!targetAsset) {
      throw new Error(`Asset ID "${assetId}" not found.`)
    }

    const isPublic = isPathPublic(targetAsset.pimcorePath)

    let dataUrl: string | undefined
    if (newFile.type.startsWith('image/')) {
      dataUrl = await readFileAsDataUrl(newFile)
    }

    const result = await uploadAssetToDam(config.value.assetProcessorUrl, newFile, newFile.name, targetAsset.pimcorePath, isPublic, config.value.folderRules)
    const updated = toAssetItem(result.asset, dataUrl || targetAsset.dataUrl)

    const index = assets.value.findIndex((a) => a.id === assetId)
    if (index >= 0) {
      assets.value[index] = updated
    }

    return updated
  }

  // --- Delete Asset ---
  async function deleteAsset(assetId: string): Promise<void> {
    const target = assets.value.find((a) => a.id === assetId)
    if (target) {
      try {
        await deleteAssetFromDam(config.value.assetProcessorUrl, target.pimcorePath, config.value.folderRules)
      } catch (e) {
        console.warn(`DAM backend delete failed for ${target.pimcorePath}:`, e)
      }
    }
    assets.value = assets.value.filter((a) => a.id !== assetId)
  }

  // --- Regenerate Thumbnails ---
  async function regenerateThumbnails(paths: string[]): Promise<{ succeeded: number; failed: number }> {
    const result = await regenerateThumbnailsApi(config.value.assetProcessorUrl, paths, config.value.folderRules)
    const updatedPaths = new Set(result.results.filter((r) => r.success).map((r) => r.pimcorePath))
    for (const asset of assets.value) {
      if (updatedPaths.has(asset.pimcorePath)) {
        try {
          const fresh = await generateAssetUrl(asset.pimcorePath)
          asset.url = fresh.url
          asset.thumbnailUrl = fresh.thumbnailUrl
          asset.thumbnails = fresh.thumbnails
        } catch { /* will heal on next image error */ }
      }
    }
    return { succeeded: result.succeeded, failed: result.failed }
  }

  // --- Update Metadata (EXIF/technical/camera/gps/rights editor) ---
  async function updateAssetMetadata(assetId: string, metadata: ExtractedAssetMetadata): Promise<void> {
    const target = assets.value.find((a) => a.id === assetId)
    if (!target) return
    const updated = await updateAssetMetadataApi(config.value.assetProcessorUrl, target.pimcorePath, metadata)
    target.metadata = updated.metadata ?? undefined
    target.updatedAt = updated.updatedAt
  }

  // --- Image Editor: re-transform through sharp on the backend ---
  // asNewVersion=true replaces the same asset (version+1); false creates a
  // new "_edited" copy alongside it. Either way the transform itself always
  // runs server-side - the browser can't run sharp.
  async function transformAsset(assetId: string, asNewVersion: boolean, options: TransformOptions): Promise<AssetItem> {
    const target = assets.value.find((a) => a.id === assetId)
    if (!target) {
      throw new Error(`Asset ID "${assetId}" not found.`)
    }

    const result = await transformAssetOnDam(config.value.assetProcessorUrl, target.pimcorePath, asNewVersion, options, config.value.folderRules)
    const updated = toAssetItem(result.asset)

    if (asNewVersion) {
      const index = assets.value.findIndex((a) => a.id === assetId)
      if (index >= 0) assets.value[index] = updated
    } else {
      assets.value.unshift(updated)
    }

    return updated
  }

  // Config helpers
  function addFolderRule(pathPrefix: string, isPublic: boolean) {
    if (!pathPrefix.trim()) return
    const cleanPrefix = pathPrefix.trim()
    config.value.folderRules = config.value.folderRules.filter((r) => r.pathPrefix !== cleanPrefix)
    config.value.folderRules.unshift({ pathPrefix: cleanPrefix, isPublic })
  }

  function removeFolderRule(index: number) {
    if (index >= 0 && index < config.value.folderRules.length) {
      config.value.folderRules.splice(index, 1)
    }
  }

  function toggleRuleVisibility(index: number) {
    if (index >= 0 && index < config.value.folderRules.length) {
      config.value.folderRules[index].isPublic = !config.value.folderRules[index].isPublic
    }
  }

  function resetToDefaults() {
    config.value = { ...defaultConfig, folderRules: [...defaultConfig.folderRules] }
    currentFolderPath.value = '/'
    connectionStatus.value = 'idle'
    statusMessage.value = 'Configuration reset to defaults'
    refreshDamInfo()
    refreshFolders()
    refreshAssets()
  }

  function testConnection() {
    connectionStatus.value = 'testing'
    statusMessage.value = 'Validating DAM backend connection...'
    ;(async () => {
      try {
        const info = await fetchDamInfo(config.value.assetProcessorUrl)
        damInfo.value = info
        await ensureDamBucket(config.value.assetProcessorUrl, config.value.folderRules)
        await refreshFolders()
        await refreshAssets()
        connectionStatus.value = 'success'
        statusMessage.value = `Successfully connected to S3/MinIO bucket "${info.bucket}" via DAM backend`
      } catch (e: any) {
        connectionStatus.value = 'error'
        statusMessage.value = `Connection failed: ${e?.message || 'Could not reach the DAM asset-processor backend.'}`
      }
    })()
  }

  // For PUBLIC assets the stored URL never expires, so it's returned as-is.
  // PRIVATE assets use short-lived presigned URLs, so a fresh one is fetched.
  async function getAssetUrl(asset: AssetItem | string): Promise<string> {
    if (typeof asset === 'string') {
      const { url } = await generateAssetUrl(asset)
      return url
    }
    if (asset.isPublic && asset.url) {
      return asset.url
    }
    try {
      const { url } = await generateAssetUrl(asset.pimcorePath)
      return url
    } catch (e) {
      console.warn('Failed to refresh signed URL, falling back to cached value:', e)
      return asset.url || ''
    }
  }

  return {
    config,
    damInfo,
    folders,
    assets,
    isLoadingAssets,
    currentFolderPath,
    currentSubfolders,
    currentAssets,
    connectionStatus,
    statusMessage,
    visibilityManager,
    generateAssetUrl,
    getAssetUrl,
    refreshFolders,
    refreshAssets,
    createFolder,
    deleteFolder,
    uploadAsset,
    uploadZipAsset,
    uploadMultipleAssets,
    uploadProgress,
    uploadNewVersion,
    deleteAsset,
    regenerateThumbnails,
    updateAssetMetadata,
    transformAsset,
    addFolderRule,
    removeFolderRule,
    toggleRuleVisibility,
    resetToDefaults,
    testConnection
  }
})

import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import JSZip from 'jszip'
import {
  FolderVisibilityManager,
  FolderVisibilityRule,
  formatS3ObjectKey,
  formatThumbnailS3Key,
  ThumbnailPreset,
  S3AssetStorageProvider
} from '@pimcore-custom/core'

const CONFIG_STORAGE_KEY = 'whoobe_custom_dam_config'
const ASSETS_STORAGE_KEY = 'whoobe_custom_dam_assets'
const FOLDERS_STORAGE_KEY = 'whoobe_custom_dam_folders'

export interface DamConfigState {
  bucket: string
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl: string
  keyPrefix: string
  forcePathStyle: boolean
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
  dataUrl?: string
  thumbnailUrl?: string
  thumbnails?: Record<ThumbnailPreset, string>
}

const defaultConfig: DamConfigState = {
  bucket: 'whoobe-cms',
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadminpassword',
  publicBaseUrl: '',
  keyPrefix: '', // Root bucket by default
  forcePathStyle: true,
  folderRules: [
    { pathPrefix: '/public/**', isPublic: true },
    { pathPrefix: '/uploads/marketing/**', isPublic: true }
  ]
}

const defaultFolders: FolderItem[] = [
  { name: 'logos', path: '/logos', parentPath: '/', createdAt: new Date().toISOString() },
  { name: 'documents', path: '/documents', parentPath: '/', createdAt: new Date().toISOString() },
  { name: 'videos', path: '/videos', parentPath: '/', createdAt: new Date().toISOString() }
]

const defaultAssets: AssetItem[] = [
  {
    id: 'asset_1',
    pimcorePath: '/logos/hero_banner_homepage.png',
    filename: 'hero_banner_homepage.png',
    folderPath: '/logos',
    sizeBytes: 2516582,
    sizeFormatted: '2.4 MB',
    mimeType: 'image/png',
    fileType: 'PNG',
    version: 1,
    uploadedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    s3Key: 'logos/hero_banner_homepage.png',
    isPublic: true,
    url: 'http://localhost:9000/whoobe-assets/logos/hero_banner_homepage.png',
    dataUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'
  },
  {
    id: 'asset_2',
    pimcorePath: '/documents/q3_financial_report.pdf',
    filename: 'q3_financial_report.pdf',
    folderPath: '/documents',
    sizeBytes: 1153433,
    sizeFormatted: '1.1 MB',
    mimeType: 'application/pdf',
    fileType: 'PDF',
    version: 1,
    uploadedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    s3Key: 'documents/q3_financial_report.pdf',
    isPublic: false,
    url: 'http://localhost:9000/whoobe-assets/documents/q3_financial_report.pdf?X-Amz-Signature=demo'
  },
  {
    id: 'asset_3',
    pimcorePath: '/videos/brand_video_intro.mp4',
    filename: 'brand_video_intro.mp4',
    folderPath: '/videos',
    sizeBytes: 19398656,
    sizeFormatted: '18.5 MB',
    mimeType: 'video/mp4',
    fileType: 'MP4',
    version: 2,
    uploadedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    s3Key: 'videos/brand_video_intro.mp4',
    isPublic: true,
    url: 'http://localhost:9000/whoobe-assets/videos/brand_video_intro.mp4'
  },
  {
    id: 'asset_4',
    pimcorePath: '/export_backup_2026.zip',
    filename: 'export_backup_2026.zip',
    folderPath: '/',
    sizeBytes: 148897792,
    sizeFormatted: '142.0 MB',
    mimeType: 'application/zip',
    fileType: 'ZIP',
    version: 1,
    uploadedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    s3Key: 'export_backup_2026.zip',
    isPublic: false,
    url: 'http://localhost:9000/whoobe-assets/export_backup_2026.zip?X-Amz-Signature=demo'
  }
]

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function getFileTypeFromFilename(filename: string): { fileType: string; mimeType: string } {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'png': return { fileType: 'PNG', mimeType: 'image/png' }
    case 'jpg':
    case 'jpeg': return { fileType: 'JPG', mimeType: 'image/jpeg' }
    case 'gif': return { fileType: 'GIF', mimeType: 'image/gif' }
    case 'svg': return { fileType: 'SVG', mimeType: 'image/svg+xml' }
    case 'webp': return { fileType: 'WEBP', mimeType: 'image/webp' }
    case 'pdf': return { fileType: 'PDF', mimeType: 'application/pdf' }
    case 'zip': return { fileType: 'ZIP', mimeType: 'application/zip' }
    case 'mp4': return { fileType: 'MP4', mimeType: 'video/mp4' }
    case 'json': return { fileType: 'JSON', mimeType: 'application/json' }
    default: return { fileType: ext.toUpperCase() || 'FILE', mimeType: 'application/octet-stream' }
  }
}

function loadInitialConfig(): DamConfigState {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.bucket === 'whoobe-assets' || parsed.bucket === 'pimcore-assets') {
        parsed.bucket = 'whoobe-cms'
      }
      return { ...defaultConfig, ...parsed }
    }
  } catch (e) {
    console.error('Failed to load DAM config:', e)
  }
  return { ...defaultConfig }
}

function loadInitialFolders(): FolderItem[] {
  try {
    const stored = localStorage.getItem(FOLDERS_STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch (e) {
    console.error('Failed to load DAM folders:', e)
  }
  return [...defaultFolders]
}

function loadInitialAssets(): AssetItem[] {
  try {
    // Clear legacy storage keys if present
    localStorage.removeItem('pimcore_custom_dam_assets')
    localStorage.removeItem('pimcore_custom_dam_config')
    localStorage.removeItem('pimcore_custom_dam_folders')

    const stored = localStorage.getItem(ASSETS_STORAGE_KEY)
    if (stored) {
      const parsed: AssetItem[] = JSON.parse(stored)
      return parsed.map((asset) => {
        if (asset.url?.includes('emulator-x3.png') || asset.url?.includes('whoobe-cms')) {
          return {
            ...asset,
            url: asset.url?.replace('whoobe-cms', 'whoobe-assets'),
            thumbnailUrl: asset.thumbnailUrl?.replace('whoobe-cms', 'whoobe-assets'),
            dataUrl: asset.dataUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'
          }
        }
        return asset
      })
    }
  } catch (e) {
    console.error('Failed to load DAM assets:', e)
  }
  return [...defaultAssets]
}

export const useDamStore = defineStore('dam', () => {
  // Config state
  const config = ref<DamConfigState>(loadInitialConfig())

  // Folders state
  const folders = ref<FolderItem[]>(loadInitialFolders())

  // Assets state
  const assets = ref<AssetItem[]>(loadInitialAssets())

  const currentFolderPath = ref<string>('/')
  const connectionStatus = ref<'idle' | 'testing' | 'success' | 'error'>('idle')
  const statusMessage = ref<string>('')

  // Watch & persist state changes (strip heavy dataUrls to prevent localStorage QuotaExceededError)
  watch(config, (newVal) => localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(newVal)), { deep: true })
  watch(folders, (newVal) => localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(newVal)), { deep: true })
  watch(
    assets,
    (newVal) => {
      try {
        const cleanAssets = newVal.map(({ dataUrl, ...rest }) => rest)
        localStorage.setItem(ASSETS_STORAGE_KEY, JSON.stringify(cleanAssets))
      } catch (e) {
        console.warn('Could not save assets to localStorage:', e)
      }
    },
    { deep: true }
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

  function generateAssetUrl(pimcorePath: string): {
    isPublic: boolean
    url: string
    thumbnailUrl: string
    thumbnails: Record<ThumbnailPreset, string>
  } {
    const isPub = isPathPublic(pimcorePath)
    const s3Key = formatS3ObjectKey(pimcorePath, config.value.keyPrefix)
    const thumbKey = formatThumbnailS3Key(pimcorePath, 'thumb', config.value.keyPrefix)
    const medKey = formatThumbnailS3Key(pimcorePath, 'medium', config.value.keyPrefix)
    const lrgKey = formatThumbnailS3Key(pimcorePath, 'large', config.value.keyPrefix)
    const base = config.value.publicBaseUrl ? config.value.publicBaseUrl.replace(/\/+$/, '') : `${config.value.endpoint}/${config.value.bucket}`

    if (isPub) {
      return {
        isPublic: true,
        url: `${base}/${s3Key}`,
        thumbnailUrl: `${base}/${thumbKey}`,
        thumbnails: {
          thumb: `${base}/${thumbKey}`,
          medium: `${base}/${medKey}`,
          large: `${base}/${lrgKey}`
        }
      }
    } else {
      const endpointBucket = `${config.value.endpoint}/${config.value.bucket}`
      return {
        isPublic: false,
        url: `${endpointBucket}/${s3Key}?X-Amz-Signature=signed`,
        thumbnailUrl: `${endpointBucket}/${thumbKey}?X-Amz-Signature=signed`,
        thumbnails: {
          thumb: `${endpointBucket}/${thumbKey}?X-Amz-Signature=signed`,
          medium: `${endpointBucket}/${medKey}?X-Amz-Signature=signed`,
          large: `${endpointBucket}/${lrgKey}?X-Amz-Signature=signed`
        }
      }
    }
  }

  // --- Folder Management ---
  function createFolder(folderName: string, isPublic: boolean = false, parentPath?: string) {
    const cleanName = folderName.trim().replace(/[\/\\]/g, '')
    if (!cleanName) return

    const parent = parentPath ?? currentFolderPath.value
    const folderPath = parent === '/' ? `/${cleanName}` : `${parent}/${cleanName}`

    if (folders.value.some((f) => f.path === folderPath)) {
      throw new Error(`Folder "${folderPath}" already exists.`)
    }

    folders.value.push({
      name: cleanName,
      path: folderPath,
      parentPath: parent,
      isPublic,
      createdAt: new Date().toISOString()
    })

    // Automatically register folder visibility rule
    addFolderRule(`${folderPath}/**`, isPublic)
  }

  async function uploadMultipleAssets(files: File[], folderPath?: string): Promise<AssetItem[]> {
    const uploaded: AssetItem[] = []
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        await uploadZipAsset(file, folderPath, true)
      } else {
        const item = await uploadAsset(file, folderPath)
        uploaded.push(item)
      }
    }
    return uploaded
  }

  function deleteFolder(folderPath: string) {
    if (folderPath === '/') return

    // Find parent path before deletion
    const targetFolder = folders.value.find((f) => f.path === folderPath)
    const parentPath = targetFolder?.parentPath ?? '/'

    // Remove folder and subfolders
    folders.value = folders.value.filter((f) => f.path !== folderPath && !f.path.startsWith(folderPath + '/'))
    // Remove all assets inside folder and subfolders
    assets.value = assets.value.filter((a) => a.folderPath !== folderPath && !a.folderPath.startsWith(folderPath + '/'))

    // Reset current view to parent folder if currently viewing deleted folder or subfolder
    if (currentFolderPath.value === folderPath || currentFolderPath.value.startsWith(folderPath + '/')) {
      currentFolderPath.value = parentPath
    }
  }

  const storageProvider = computed(() => {
    return new S3AssetStorageProvider({
      bucket: config.value.bucket,
      endpoint: config.value.endpoint,
      region: config.value.region,
      accessKeyId: config.value.accessKeyId,
      secretAccessKey: config.value.secretAccessKey,
      forcePathStyle: config.value.forcePathStyle,
      publicBaseUrl: config.value.publicBaseUrl,
      keyPrefix: config.value.keyPrefix,
      visibilityManager: visibilityManager.value
    })
  })

  async function uploadAsset(file: File, folderPath?: string): Promise<AssetItem> {
    const targetFolder = folderPath ?? currentFolderPath.value
    const pimcorePath = targetFolder === '/' ? `/${file.name}` : `${targetFolder}/${file.name}`
    const s3Key = formatS3ObjectKey(pimcorePath, config.value.keyPrefix)
    const { fileType, mimeType } = getFileTypeFromFilename(file.name)
    const { isPublic, url, thumbnailUrl, thumbnails } = generateAssetUrl(pimcorePath)

    let dataUrl: string | undefined
    if (file.type.startsWith('image/')) {
      dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve((e.target?.result as string) || '')
        reader.onerror = () => resolve('')
        reader.readAsDataURL(file)
      })
    }

    // Upload binary file directly using S3 Storage Provider with SigV4 credentials
    try {
      const arrayBuffer = await file.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)
      await storageProvider.value.uploadAsset(pimcorePath, uint8 as any, file.type || mimeType, { isPublic })
    } catch (e) {
      console.warn(`S3 Storage Provider upload for ${s3Key}:`, e)
    }

    // Replace asset if exists or create new
    const existingIndex = assets.value.findIndex((a) => a.pimcorePath === pimcorePath)
    const newAsset: AssetItem = {
      id: existingIndex >= 0 ? assets.value[existingIndex].id : 'asset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      pimcorePath,
      filename: file.name,
      folderPath: targetFolder,
      sizeBytes: file.size,
      sizeFormatted: formatBytes(file.size),
      mimeType: file.type || mimeType,
      fileType,
      version: existingIndex >= 0 ? assets.value[existingIndex].version + 1 : 1,
      uploadedAt: existingIndex >= 0 ? assets.value[existingIndex].uploadedAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      s3Key,
      isPublic,
      url,
      dataUrl: dataUrl || undefined,
      thumbnailUrl,
      thumbnails
    }

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
    autoExtract: boolean = true
  ): Promise<{ extractedCount: number; rootAsset?: AssetItem }> {
    const targetFolder = folderPath ?? currentFolderPath.value

    if (!autoExtract) {
      const asset = await uploadAsset(zipFile, targetFolder)
      return { extractedCount: 0, rootAsset: asset }
    }

    // Auto-extract zip contents
    const zip = await JSZip.loadAsync(zipFile)
    const extractedFolder = zipFile.name.replace(/\.zip$/i, '')
    const baseExtractPath = targetFolder === '/' ? `/${extractedFolder}` : `${targetFolder}/${extractedFolder}`

    // Ensure folder exists
    try {
      createFolder(extractedFolder, false, targetFolder)
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
            const parent = currPath
            folders.value.push({
              name: dirName,
              path: newPath,
              parentPath: parent,
              createdAt: new Date().toISOString()
            })
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
        await uploadAsset(extractedFile, entryFolderPath)
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

    const { fileType, mimeType } = getFileTypeFromFilename(newFile.name)
    const { isPublic, url } = generateAssetUrl(targetAsset.pimcorePath)

    let dataUrl: string | undefined
    if (newFile.type.startsWith('image/')) {
      dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve((e.target?.result as string) || '')
        reader.onerror = () => resolve('')
        reader.readAsDataURL(newFile)
      })
    }

    targetAsset.filename = newFile.name
    targetAsset.sizeBytes = newFile.size
    targetAsset.sizeFormatted = formatBytes(newFile.size)
    targetAsset.mimeType = newFile.type || mimeType
    targetAsset.fileType = fileType
    targetAsset.version += 1
    targetAsset.updatedAt = new Date().toISOString()
    targetAsset.isPublic = isPublic
    targetAsset.url = url
    targetAsset.dataUrl = dataUrl || targetAsset.dataUrl

    return { ...targetAsset }
  }

  // --- Delete Asset ---
  function deleteAsset(assetId: string) {
    assets.value = assets.value.filter((a) => a.id !== assetId)
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
    config.value = { ...defaultConfig }
    folders.value = [...defaultFolders]
    assets.value = [...defaultAssets]
    currentFolderPath.value = '/'
    connectionStatus.value = 'idle'
    statusMessage.value = 'Configuration & demo data reset to defaults'
  }

function dataUrlToUint8Array(dataUrl: string): { data: Uint8Array; mimeType: string } {
  try {
    const parts = dataUrl.split(',')
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png'
    const bstr = atob(parts[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return { data: u8arr, mimeType: mime }
  } catch {
    const encoder = new TextEncoder()
    return { data: encoder.encode('Sample binary image'), mimeType: 'image/png' }
  }
}

  async function syncAssetsToMinIO(): Promise<number> {
    let count = 0
    await storageProvider.value.ensureBucket()
    for (const asset of assets.value) {
      try {
        const exists = await storageProvider.value.existsAsset(asset.pimcorePath)
        if (!exists) {
          let uint8Payload: Uint8Array
          let payloadMime = asset.mimeType || 'application/octet-stream'

          if (asset.dataUrl && asset.dataUrl.startsWith('data:')) {
            const parsed = dataUrlToUint8Array(asset.dataUrl)
            uint8Payload = parsed.data
            payloadMime = parsed.mimeType
          } else {
            const encoder = new TextEncoder()
            uint8Payload = encoder.encode(`Sample content for ${asset.filename}`)
          }

          await storageProvider.value.uploadAsset(
            asset.pimcorePath,
            uint8Payload as any,
            payloadMime,
            { isPublic: asset.isPublic }
          )
          count++
        }
      } catch (e) {
        console.warn(`Could not sync ${asset.s3Key} to MinIO:`, e)
      }
    }
    return count
  }

  function testConnection() {
    connectionStatus.value = 'testing'
    statusMessage.value = 'Validating S3/MinIO configuration & syncing storage keys...'
    setTimeout(async () => {
      if (config.value.bucket && config.value.endpoint) {
        const synced = await syncAssetsToMinIO()
        connectionStatus.value = 'success'
        statusMessage.value = `Successfully connected to S3/MinIO bucket "${config.value.bucket}" (Synced ${synced} missing keys)`
      } else {
        connectionStatus.value = 'error'
        statusMessage.value = 'Connection failed: Bucket and Endpoint are required.'
      }
    }, 600)
  }

  function getAssetUrl(asset: AssetItem | string): string {
    const path = typeof asset === 'string' ? asset : asset.pimcorePath
    const { url } = generateAssetUrl(path)
    return url
  }

  return {
    config,
    folders,
    assets,
    currentFolderPath,
    currentSubfolders,
    currentAssets,
    connectionStatus,
    statusMessage,
    visibilityManager,
    generateAssetUrl,
    getAssetUrl,
    syncAssetsToMinIO,
    createFolder,
    deleteFolder,
    uploadAsset,
    uploadZipAsset,
    uploadMultipleAssets,
    uploadNewVersion,
    deleteAsset,
    addFolderRule,
    removeFolderRule,
    toggleRuleVisibility,
    resetToDefaults,
    testConnection
  }
})

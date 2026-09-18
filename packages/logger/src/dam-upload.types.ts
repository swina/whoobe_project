export interface DamUploadRequest {
  file: Buffer
  filename: string
  folder: string
  isPublic: boolean
}

export interface DamUploadResponse {
  success: boolean
  s3Key?: string
  url?: string
  error?: string
}

export interface DamListResponse {
  assets: DamAsset[]
}

export interface DamAsset {
  id: string
  filename: string
  pimcorePath: string
  s3Key: string
  url: string
  sizeBytes: number
  mimeType: string
  createdAt: string
}
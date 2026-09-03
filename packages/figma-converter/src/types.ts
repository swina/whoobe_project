export interface ConversionResult {
  element: WhoobeElementNode
  name: string
  images: Record<string, string>
  warnings: string[]
}

export interface FigmaConversionOptions {
  mode: FigmaImportMode
  uploadImages?: boolean
  imageBaseUrl?: string
}

export type FigmaImportMode = 'page' | 'snippet'

export type WhoobeElementNode = Record<string, unknown> & {
  id: string
  type: string
  tag: string
  element?: string
  blocks?: WhoobeElementNode[]
  css?: { css: string; container: string }
  content?: string
  style?: string
  image?: { url?: string | null; alt?: string | null }
  data?: Record<string, unknown>
  font?: string
  level?: number
  editable?: boolean
  semantic?: string
  link?: string
  [key: string]: unknown
}

export interface LayoutResult {
  tailwind: string[]
  inline: string[]
  isFlex: boolean
}

export interface StyleResult {
  tailwind: string[]
  inline: string[]
}

export interface TextConversionResult {
  tag: string
  level?: number
  tailwind: string[]
  inlineStyle: string[]
  fontFamily: string
}

export interface FetchOptions extends FigmaConversionOptions {
  accessToken: string
  fileKey: string
  nodeIds?: string[]
  apiBaseUrl?: string
  imageUploadFn?: (imageRef: string, url: string) => Promise<string>
}
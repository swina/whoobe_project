import type { FigmaFileResponse, FigmaNodesResponse, FigmaImagesResponse, FigmaImageFillsResponse } from './figma-types.js'
import type { FigmaConversionOptions, ConversionResult } from './types.js'
import { convertFigmaNode } from './figma-node-converter.js'
import type { FetchOptions } from './types.js'

export async function fetchAndConvert(options: FetchOptions): Promise<ConversionResult> {
  const { accessToken, fileKey, nodeIds, apiBaseUrl = 'https://api.figma.com/v1', imageUploadFn } = options

  const headers = { Authorization: `Bearer ${accessToken}` }

  let figmaNode: import('./figma-types.js').SubcanvasNode

  if (nodeIds && nodeIds.length > 0) {
    const nodesUrl = `${apiBaseUrl}/files/${fileKey}/nodes?ids=${nodeIds.join(',')}`
    const nodesRes = await fetch(nodesUrl, { headers })
    if (!nodesRes.ok) throw new Error(`Figma API error (nodes): ${nodesRes.status} ${nodesRes.statusText}`)
    const nodesData: FigmaNodesResponse = await nodesRes.json()
    const firstKey = Object.keys(nodesData.nodes)[0]
    const firstNode = nodesData.nodes[firstKey]?.document
    if (!firstNode) throw new Error(`Node ${nodeIds[0]} not found`)
    figmaNode = firstNode as import('./figma-types.js').SubcanvasNode
  } else {
    const fileUrl = `${apiBaseUrl}/files/${fileKey}`
    const fileRes = await fetch(fileUrl, { headers })
    if (!fileRes.ok) throw new Error(`Figma API error (file): ${fileRes.status} ${fileRes.statusText}`)
    const fileData: FigmaFileResponse = await fileRes.json()
    const canvas = fileData.document?.children?.[0]
    if (!canvas) throw new Error('No canvas found in Figma file')
    figmaNode = canvas.children?.[0]
    if (!figmaNode) throw new Error('No frame found in first canvas')
  }

  const result = convertFigmaNode(figmaNode, options)

  if (imageUploadFn) {
    const imageRefs = collectImageRefs(result.element)
    if (imageRefs.length > 0) {
      const fillsUrl = `${apiBaseUrl}/files/${fileKey}/images`
      const fillsRes = await fetch(fillsUrl, { headers })
      if (fillsRes.ok) {
        const fillsData: FigmaImageFillsResponse = await fillsRes.json()
        if (!fillsData.error) {
          for (const imageRef of imageRefs) {
            const url = fillsData.meta.images[imageRef]
            if (url) {
              try {
                const damUrl = await imageUploadFn(imageRef, url)
                replaceImageRef(result.element, imageRef, damUrl)
              } catch {
                result.warnings.push(`Failed to upload image: ${imageRef}`)
              }
            }
          }
        }
      }
    }
  }

  return result
}

function collectImageRefs(node: Record<string, unknown>): string[] {
  const refs: string[] = []
  const image = node.image as { url?: string } | undefined
  if (image?.url && typeof image.url === 'string' && image.url.startsWith('figma-image:')) {
    refs.push(image.url.replace('figma-image:', ''))
  }
  const blocks = node.blocks as Record<string, unknown>[] | undefined
  if (blocks) {
    for (const child of blocks) {
      refs.push(...collectImageRefs(child))
    }
  }
  return [...new Set(refs)]
}

function replaceImageRef(node: Record<string, unknown>, imageRef: string, damUrl: string): void {
  const image = node.image as { url?: string } | undefined
  if (image?.url === `figma-image:${imageRef}`) {
    image.url = damUrl
  }
  const blocks = node.blocks as Record<string, unknown>[] | undefined
  if (blocks) {
    for (const child of blocks) {
      replaceImageRef(child, imageRef, damUrl)
    }
  }
}

export async function fetchImageUrls(fileKey: string, imageRefs: string[], accessToken: string, apiBaseUrl = 'https://api.figma.com/v1'): Promise<Record<string, string>> {
  const headers = { Authorization: `Bearer ${accessToken}` }
  const fillsUrl = `${apiBaseUrl}/files/${fileKey}/images`
  const res = await fetch(fillsUrl, { headers })
  if (!res.ok) throw new Error(`Figma API error (image fills): ${res.status}`)
  const data: FigmaImageFillsResponse = await res.json()
  if (data.error) throw new Error('Figma image fills API error')
  return data.meta.images
}

export async function renderNodeToImage(fileKey: string, nodeId: string, accessToken: string, format: 'png' | 'jpg' | 'svg' = 'png', apiBaseUrl = 'https://api.figma.com/v1'): Promise<string | null> {
  const headers = { Authorization: `Bearer ${accessToken}` }
  const url = `${apiBaseUrl}/images/${fileKey}?ids=${nodeId}&format=${format}&scale=2`
  const res = await fetch(url, { headers })
  if (!res.ok) return null
  const data: FigmaImagesResponse = await res.json()
  return data.images[nodeId] || null
}
import type { FrameProperties, LayoutMixin } from './figma-types.js'
import { cleanTailwind } from './utils.js'

export interface LayoutResult {
  tailwind: string[]
  inline: string[]
  isFlex: boolean
  isAbsolute: boolean
}

export function convertLayout(props: FrameProperties & Partial<LayoutMixin>, parentBounds?: { x: number; y: number }): LayoutResult {
  const tailwind: string[] = []
  const inline: string[] = []
  let isFlex = false
  let isAbsolute = false

  const { layoutMode, primaryAxisAlignItems, counterAxisAlignItems, itemSpacing, paddingLeft, paddingRight, paddingTop, paddingBottom, layoutWrap, clipsContent, absoluteBoundingBox } = props

  if (layoutMode === 'HORIZONTAL' || layoutMode === 'VERTICAL') {
    isFlex = true
    tailwind.push('flex')
    tailwind.push(layoutMode === 'HORIZONTAL' ? 'flex-row' : 'flex-col')

    if (primaryAxisAlignItems && primaryAxisAlignItems !== 'MIN') {
      const map: Record<string, string> = {
        CENTER: 'justify-center',
        MAX: 'justify-end',
        SPACE_BETWEEN: 'justify-between',
      }
      if (map[primaryAxisAlignItems]) tailwind.push(map[primaryAxisAlignItems])
    }

    if (counterAxisAlignItems && counterAxisAlignItems !== 'MIN') {
      const map: Record<string, string> = {
        CENTER: 'items-center',
        MAX: 'items-end',
        BASELINE: 'items-baseline',
      }
      if (map[counterAxisAlignItems]) tailwind.push(map[counterAxisAlignItems])
    }

    if (itemSpacing != null && itemSpacing !== 0) {
      tailwind.push(`gap-[${itemSpacing}px]`)
    }

    if (layoutWrap === 'WRAP') {
      tailwind.push('flex-wrap')
    }

    if (props.layoutSizingHorizontal === 'FILL') {
      tailwind.push('w-full')
    }
  } else if (layoutMode === 'NONE' || !layoutMode) {
    isAbsolute = true
    tailwind.push('relative')
  }

  if (paddingLeft != null || paddingRight != null) {
    const pl = paddingLeft ?? 0
    const pr = paddingRight ?? 0
    if (pl === pr && pl > 0) {
      tailwind.push(`px-[${pl}px]`)
    } else {
      if (pl > 0) tailwind.push(`pl-[${pl}px]`)
      if (pr > 0) tailwind.push(`pr-[${pr}px]`)
    }
  }

  if (paddingTop != null || paddingBottom != null) {
    const pt = paddingTop ?? 0
    const pb = paddingBottom ?? 0
    if (pt === pb && pt > 0) {
      tailwind.push(`py-[${pt}px]`)
    } else {
      if (pt > 0) tailwind.push(`pt-[${pt}px]`)
      if (pb > 0) tailwind.push(`pb-[${pb}px]`)
    }
  }

  if (clipsContent) {
    tailwind.push('overflow-hidden')
  }

  if (absoluteBoundingBox) {
    if (absoluteBoundingBox.width > 0) {
      inline.push(`width: ${Math.round(absoluteBoundingBox.width)}px`)
    }
    if (absoluteBoundingBox.height > 0) {
      inline.push(`height: ${Math.round(absoluteBoundingBox.height)}px`)
    }
  }

  if (props.layoutPositioning === 'ABSOLUTE' && absoluteBoundingBox && parentBounds) {
    const relX = Math.round(absoluteBoundingBox.x - parentBounds.x)
    const relY = Math.round(absoluteBoundingBox.y - parentBounds.y)
    inline.push('position: absolute')
    inline.push(`left: ${relX}px`)
    inline.push(`top: ${relY}px`)
  }

  if (props.minWidth != null) inline.push(`min-width: ${props.minWidth}px`)
  if (props.maxWidth != null) inline.push(`max-width: ${props.maxWidth}px`)
  if (props.minHeight != null) inline.push(`min-height: ${props.minHeight}px`)
  if (props.maxHeight != null) inline.push(`max-height: ${props.maxHeight}px`)

  return {
    tailwind: cleanTailwind(tailwind.join(' ')).split(/\s+/).filter(Boolean),
    inline,
    isFlex,
    isAbsolute,
  }
}

export function computeRelativePosition(childBounds: { x: number; y: number; width: number; height: number }, parentBounds: { x: number; y: number }): { left: number; top: number } {
  return {
    left: Math.round(childBounds.x - parentBounds.x),
    top: Math.round(childBounds.y - parentBounds.y),
  }
}
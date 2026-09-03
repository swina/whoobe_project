import type { FrameProperties, LayoutMixin } from './figma-types.js'
import { tailwindSpacing, nearestTailwindValue, arbValue, cleanTailwind } from './utils.js'

export interface LayoutResult {
  tailwind: string[]
  inline: string[]
  isFlex: boolean
}

export function convertLayout(props: FrameProperties & Partial<LayoutMixin>): LayoutResult {
  const tailwind: string[] = []
  const inline: string[] = []
  let isFlex = false

  const { layoutMode, primaryAxisAlignItems, counterAxisAlignItems, itemSpacing, paddingLeft, paddingRight, paddingTop, paddingBottom, layoutWrap, clipsContent, layoutPositioning, absoluteBoundingBox } = props

  if (layoutMode === 'HORIZONTAL' || layoutMode === 'VERTICAL') {
    isFlex = true
    tailwind.push('flex')
    tailwind.push(layoutMode === 'HORIZONTAL' ? 'flex-row' : 'flex-col')
  }

  if (layoutMode === 'HORIZONTAL' || layoutMode === 'VERTICAL') {
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

  if (absoluteBoundingBox && absoluteBoundingBox.width > 0) {
    const widthTw = nearestTailwindValue(absoluteBoundingBox.width)
    if (widthTw && parseInt(widthTw.cls) > 0) {
      if (isFlex && false) {
        // skip for flex containers - they handle sizing naturally
      } else {
        tailwind.push(`w-[${absoluteBoundingBox.width}px]`)
      }
    }
  }

  if (absoluteBoundingBox && absoluteBoundingBox.height > 0) {
    tailwind.push(`h-[${absoluteBoundingBox.height}px]`)
  }

  if (layoutPositioning === 'ABSOLUTE' && absoluteBoundingBox) {
    inline.push(`position: absolute`)
    if (absoluteBoundingBox.x !== 0) inline.push(`left: ${absoluteBoundingBox.x}px`)
    if (absoluteBoundingBox.y !== 0) inline.push(`top: ${absoluteBoundingBox.y}px`)
  }

  if (absoluteBoundingBox && absoluteBoundingBox.width > 0) {
    inline.push(`width: ${absoluteBoundingBox.width}px`)
  }
  if (absoluteBoundingBox && absoluteBoundingBox.height > 0) {
    inline.push(`height: ${absoluteBoundingBox.height}px`)
  }

  if (props.layoutSizingHorizontal === 'FILL') {
    tailwind.push('w-full')
  }

  if (props.minWidth != null) inline.push(`min-width: ${props.minWidth}px`)
  if (props.maxWidth != null) inline.push(`max-width: ${props.maxWidth}px`)
  if (props.minHeight != null) inline.push(`min-height: ${props.minHeight}px`)
  if (props.maxHeight != null) inline.push(`max-height: ${props.maxHeight}px`)

  return {
    tailwind: cleanTailwind(tailwind.join(' ')).split(/\s+/).filter(Boolean),
    inline,
    isFlex,
  }
}
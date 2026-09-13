import { randomId, cleanTailwind } from './utils.js'
import type { WhoobeElementNode } from './types.js'

/* Plugin node shape */
interface PluginNode {
  type: string
  name?: string
  x?: number
  y?: number
  width?: number
  height?: number
  fills?: PluginFill[]
  strokes?: PluginStroke[]
  effects?: PluginEffect[]
  cornerRadius?: number
  children?: PluginNode[]
  fontSize?: number
  fontName?: { family: string; style: string }
  characters?: string
  textAlignHorizontal?: string
  textAlignVertical?: string
  lineHeight?: { unit: string; value?: number }
  fontWeight?: number
  letterSpacing?: number
  lineHeightPx?: number
  textDecoration?: string
  opacity?: number
  tailwind?: Record<string, string>
  background?: PluginFill[]
  strokeWeight?: number
}

interface PluginFill {
  type: string
  visible?: boolean
  opacity?: number
  blendMode?: string
  color?: PluginColor
  hex?: string
  name?: string
  imageRef?: string
  scaleMode?: string
  gradientHandlePositions?: PluginVector[]
  gradientStops?: PluginGradientStop[]
}

interface PluginGradientStop {
  position: number
  color: PluginColor
}

interface PluginColor {
  r: number
  g: number
  b: number
  a?: number
}

interface PluginVector {
  x: number
  y: number
}

interface PluginStroke {
  type: string
  visible?: boolean
  color?: PluginColor
  hex?: string
}

interface PluginEffect {
  type: string
  visible?: boolean
  radius?: number
  color?: PluginColor & { a?: number }
  offset?: PluginVector
  spread?: number
}

/* ---- Detect if JSON matches this format ---- */
export function isPluginFormat(data: unknown): boolean {
  if (!Array.isArray(data)) return false
  if (data.length === 0) return false
  const first = data[0] as Record<string, unknown>
  return (
    typeof first === 'object' &&
    first !== null &&
    typeof first.name === 'string' &&
    typeof first.type === 'string' &&
    (first.type === 'COMPONENT' || first.type === 'FRAME' || first.type === 'GROUP') &&
    typeof first.x === 'number' &&
    typeof first.width === 'number'
  )
}

/* ---- Main converter ---- */
export function convertPluginJson(data: PluginNode[]): { element: WhoobeElementNode; name: string; warnings: string[] } {
  const warnings: string[] = []
  const root = data[0]
  const children = root.children || []

  if (root.type === 'COMPONENT' || root.type === 'FRAME') {
    const converted = convertNode(root, warnings)
    if (converted) {
      ensureDefaults(converted)
      if (converted.tag === 'document') {
        converted.css = converted.css || { css: '', container: '' }
        // Editor-only styles (whoobe-canvas-root, editor-custom) are now
        // applied by the editor itself, not stored in content.
      }
      return { element: converted, name: root.name || 'Imported Figma', warnings }
    }
    const fallback = createFallback()
    return { element: fallback, name: root.name || 'Imported Figma', warnings: ['Root node could not be converted'] }
  }

  const children_elements = convertChildren(children, warnings)

  const wrapper: WhoobeElementNode = {
    id: randomId(),
    type: children_elements.length > 0 ? 'container' : 'element',
    tag: 'div',
    element: 'div',
    blocks: children_elements,
    css: { css: '', container: 'gap-4' },
  }

  return { element: wrapper, name: root.name || 'Imported Figma', warnings }
}

function convertNode(node: PluginNode, warnings: string[]): WhoobeElementNode | null {
  switch (node.type) {
    case 'COMPONENT':
    case 'FRAME':
      return convertContainer(node, warnings)
    case 'GROUP':
      return convertGroup(node, warnings)
    case 'RECTANGLE':
      return convertRectangle(node)
    case 'TEXT':
      return convertText(node)
    case 'VECTOR':
      return convertVector(node, warnings)
    case 'ELLIPSE':
      return convertEllipse(node)
    case 'LINE':
      return convertLine(node)
    default:
      warnings.push(`Skipping unsupported node type: ${node.type} (${node.name || 'unnamed'})`)
      return null
  }
}

function convertContainer(node: PluginNode, warnings: string[]): WhoobeElementNode {
  const children = node.children || []
  const childElements = convertChildren(children, warnings)
  const tw: string[] = []

  if (children.length > 0) {
    tw.push('flex', 'flex-col')
  }

  if (node.tailwind?.width) tw.push(node.tailwind.width)
  if (node.tailwind?.height) tw.push(node.tailwind.height)

  const fill = getFirstVisibleFill(node.fills || node.background)
  if (fill) {
    const hex = fill.hex || rgbToHex(fill.color)
    if (hex && hex !== '#ffffff') {
      tw.push(`bg-[${hex}]`)
    }
  }

  const radius = node.cornerRadius
  if (radius && radius > 0) {
    tw.push(radius === 9999 ? 'rounded-full' : `rounded-[${radius}px]`)
  }

  const el: WhoobeElementNode = {
    id: randomId(),
    type: childElements.length > 0 ? 'container' : 'element',
    tag: 'div',
    element: 'div',
    blocks: childElements,
    css: { css: cleanTailwind(tw.join(' ')), container: '' },
  }

  if (node.width && node.height) {
    el.style = `width: ${node.width}px; height: ${node.height}px`
  }

  return el
}

function convertGroup(node: PluginNode, warnings: string[]): WhoobeElementNode | null {
  const children = node.children || []
  const childElements = convertChildren(children, warnings)

  if (childElements.length === 0) return null
  if (childElements.length === 1) return childElements[0]

  const tw: string[] = []
  if (node.tailwind?.width) tw.push(node.tailwind.width)
  if (node.tailwind?.height) tw.push(node.tailwind.height)

  const el: WhoobeElementNode = {
    id: randomId(),
    type: 'container',
    tag: 'div',
    element: 'div',
    blocks: childElements,
    css: { css: cleanTailwind(tw.join(' ')), container: '' },
  }

  if (node.width && node.height) {
    el.style = `width: ${node.width}px; height: ${node.height}px`
  }

  return el
}

function convertRectangle(node: PluginNode): WhoobeElementNode | null {
  const tw: string[] = []

  if (node.tailwind?.width) tw.push(node.tailwind.width)
  if (node.tailwind?.height) tw.push(node.tailwind.height)

  const fill = getFirstVisibleFill(node.fills || node.background)
  if (fill) {
    if (fill.type === 'IMAGE') {
      const el: WhoobeElementNode = {
        id: randomId(),
        type: 'element',
        tag: 'img',
        element: 'img',
        image: { url: '', alt: node.name || '' },
        css: { css: cleanTailwind(tw.join(' ')), container: '' },
      }
      if (node.width && node.height) {
        el.style = `width: ${node.width}px; height: ${node.height}px; object-fit: cover`
      }
      if (fill.imageRef) {
        el.image = { url: `figma-image:${fill.imageRef}`, alt: node.name || '' }
      }
      return el
    }

    const hex = fill.hex || rgbToHex(fill.color)
    if (hex && hex !== '#ffffff' && hex !== '#ffffffff') {
      tw.push(`bg-[${hex}]`)
    }
  }

  const stroke = getFirstVisibleStroke(node.strokes)
  if (stroke) {
    const hex = stroke.hex || rgbToHex(stroke.color)
    if (hex) tw.push(`border-[${hex}]`)
    if (node.strokeWeight) tw.push(`border-[${node.strokeWeight}px]`)
  }

  const radius = node.cornerRadius
  if (radius && radius > 0) {
    tw.push(radius === 9999 ? 'rounded-full' : `rounded-[${radius}px]`)
  }

  const el: WhoobeElementNode = {
    id: randomId(),
    type: 'element',
    tag: 'div',
    element: 'div',
    css: { css: cleanTailwind(tw.join(' ')), container: '' },
  }

  if (node.width && node.height) {
    el.style = `width: ${node.width}px; height: ${node.height}px`
  }

  return el
}

function convertText(node: PluginNode): WhoobeElementNode | null {
  if (!node.characters) return null

  const characters = node.characters
  const fontSize = node.fontSize || 16
  const fontFamily = node.fontName?.family || ''

  const tw: string[] = []

  if (node.tailwind?.width) tw.push(node.tailwind.width)
  if (node.tailwind?.height) tw.push(node.tailwind.height)

  const fill = getFirstVisibleFill(node.fills)
  if (fill) {
    const hex = fill.hex || rgbToHex(fill.color)
    if (hex) tw.push(`text-[${hex}]`)
  }

  if (fontSize) tw.push(`text-[${fontSize}px]`)

  if (node.textAlignHorizontal === 'CENTER') tw.push('text-center')
  else if (node.textAlignHorizontal === 'RIGHT') tw.push('text-right')
  else if (node.textAlignHorizontal === 'JUSTIFIED') tw.push('text-justify')

  if (node.textDecoration === 'UNDERLINE') tw.push('underline')

  if (node.fontWeight && node.fontWeight >= 700) tw.push('font-bold')
  else if (node.fontWeight && node.fontWeight >= 500) tw.push('font-medium')

  if (node.letterSpacing) tw.push(`tracking-[${node.letterSpacing}px]`)

  let tag = 'p'
  let level: number | undefined

  if (fontSize >= 28) { tag = 'h1'; level = 1 }
  else if (fontSize >= 24) { tag = 'h2'; level = 2 }
  else if (fontSize >= 20) { tag = 'h3'; level = 3 }
  else if (fontSize >= 16) { tag = 'h4'; level = 4 }

  const el: WhoobeElementNode = {
    id: randomId(),
    type: 'element',
    tag,
    element: tag,
    content: characters.trimEnd(),
    editable: true,
    css: { css: cleanTailwind(tw.join(' ')), container: '' },
  }

  if (level) el.level = level

  if (fontFamily) {
    if (/^(Open\+Sans|Roboto|Lato|Montserrat|Nunito|Poppins|Inter|Noto|Playfair|Merriweather|Source|Raleway|PT\+Sans|Lora|Oswald|Ubuntu|Mulish|Hind|Work\+Sans|Fira|IBM|Exo|Barlow|DM)/.test(fontFamily.replace(/ /g, '+'))) {
      el.font = fontFamily.replace(/ /g, '+')
    } else {
      el.style = `font-family: ${fontFamily}`
    }
  }

  return el
}

function convertVector(node: PluginNode, warnings: string[]): WhoobeElementNode | null {
  warnings.push(`Vector "${node.name || 'unnamed'}" — rendering as empty placeholder`)
  const tw: string[] = []
  if (node.tailwind?.width) tw.push(node.tailwind.width)
  if (node.tailwind?.height) tw.push(node.tailwind.height)

  return {
    id: randomId(),
    type: 'element',
    tag: 'div',
    element: 'div',
    css: { css: cleanTailwind(tw.join(' ')), container: '' },
    style: node.width && node.height ? `width: ${node.width}px; height: ${node.height}px` : undefined,
  }
}

function convertEllipse(node: PluginNode): WhoobeElementNode | null {
  const tw = ['rounded-full']

  if (node.tailwind?.width) tw.push(node.tailwind.width)
  if (node.tailwind?.height) tw.push(node.tailwind.height)

  const fill = getFirstVisibleFill(node.fills)
  if (fill) {
    const hex = fill.hex || rgbToHex(fill.color)
    if (hex && hex !== '#ffffff') tw.push(`bg-[${hex}]`)
  }

  return {
    id: randomId(),
    type: 'element',
    tag: 'div',
    element: 'div',
    css: { css: cleanTailwind(tw.join(' ')), container: '' },
    style: node.width && node.height ? `width: ${node.width}px; height: ${node.height}px` : undefined,
  }
}

function convertLine(node: PluginNode): WhoobeElementNode | null {
  return {
    id: randomId(),
    type: 'element',
    tag: 'hr',
    element: 'hr',
    css: { css: 'border-0', container: '' },
    style: node.width ? `width: ${node.width}px` : undefined,
  }
}

/* ---- Helpers ---- */

function convertChildren(children: PluginNode[], warnings: string[]): WhoobeElementNode[] {
  const results: WhoobeElementNode[] = []
  for (const child of children) {
    if (child.fills && child.fills.length > 0) {
      const firstFill = child.fills[0]
      if (firstFill.visible === false) continue
    }
    const converted = convertNode(child, warnings)
    if (converted) results.push(converted)
  }
  return results
}

function getFirstVisibleFill(fills?: PluginFill[]): PluginFill | null {
  if (!fills || fills.length === 0) return null
  for (const f of fills) {
    if (f.visible === false) continue
    return f
  }
  return fills[0]
}

function getFirstVisibleStroke(strokes?: PluginStroke[]): PluginStroke | null {
  if (!strokes || strokes.length === 0) return null
  for (const s of strokes) {
    if (s.visible === false) continue
    return s
  }
  return strokes[0]
}

function rgbToHex(color?: PluginColor): string | null {
  if (!color) return null
  const r = Math.round(color.r * 255).toString(16).padStart(2, '0')
  const g = Math.round(color.g * 255).toString(16).padStart(2, '0')
  const b = Math.round(color.b * 255).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

function ensureDefaults(node: WhoobeElementNode): void {
  if (!node.css) node.css = { css: '', container: '' }
  if (!node.blocks) node.blocks = []
  for (const child of node.blocks as WhoobeElementNode[]) {
    ensureDefaults(child)
  }
}

function createFallback(): WhoobeElementNode {
  return {
    id: randomId(),
    type: 'container',
    tag: 'div',
    element: 'div',
    blocks: [],
    css: { css: '', container: 'gap-4' },
  }
}
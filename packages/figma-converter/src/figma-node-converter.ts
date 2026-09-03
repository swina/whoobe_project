import type { FigmaNode, SubcanvasNode, FrameNode, GroupNode, TextNode, RectangleNode, EllipseNode, LineNode, VectorNode, InstanceNode, BooleanOperationNode, Paint, FrameProperties, LayoutMixin, CornerMixin, TypeStyle, ImagePaint } from './figma-types.js'
import type { ConversionResult, FigmaConversionOptions, WhoobeElementNode } from './types.js'
import { convertLayout, computeRelativePosition } from './layout.js'
import { convertFillsToBg, convertFillsToTextColor, convertStrokeStyle, convertCornerRadius, convertEffects, convertOpacity } from './style.js'
import { convertTextStyle } from './text.js'
import { randomId, cleanTailwind, rgbaToHex } from './utils.js'

interface PositionContext {
  x: number
  y: number
  width: number
  height: number
}

export function convertFigmaNode(node: FigmaNode, options?: FigmaConversionOptions): ConversionResult {
  const warnings: string[] = []
  const images: Record<string, string> = {}

  const rootBounds: PositionContext = {
    x: 'absoluteBoundingBox' in node ? (node as any).absoluteBoundingBox?.x ?? 0 : 0,
    y: 'absoluteBoundingBox' in node ? (node as any).absoluteBoundingBox?.y ?? 0 : 0,
    width: 'absoluteBoundingBox' in node ? (node as any).absoluteBoundingBox?.width ?? 1440 : 1440,
    height: 'absoluteBoundingBox' in node ? (node as any).absoluteBoundingBox?.height ?? 900 : 900,
  }

  const element = convertNode(node as SubcanvasNode, warnings, rootBounds, true)

  if (element) {
    ensureDefaults(element)
    if (node.name) element.label = node.name
  }

  return {
    element: element || createEmptyRoot(),
    name: node.name || 'Untitled',
    images,
    warnings,
  }
}

function convertNode(node: SubcanvasNode, warnings: string[], parentBounds: PositionContext, isRoot: boolean): WhoobeElementNode | null {
  switch (node.type) {
    case 'FRAME':
      return convertFrame(node as FrameNode, warnings, parentBounds, isRoot)
    case 'GROUP':
      return convertGroup(node as GroupNode, warnings, parentBounds)
    case 'TEXT':
      return convertTextNode(node as TextNode, parentBounds)
    case 'RECTANGLE':
      return convertRectangle(node as RectangleNode, warnings, parentBounds)
    case 'ELLIPSE':
      return convertEllipse(node as EllipseNode, parentBounds)
    case 'LINE':
      return convertLine(node as LineNode, parentBounds)
    case 'VECTOR':
      return convertVector(node as VectorNode, warnings, parentBounds)
    case 'INSTANCE':
      return convertFrame(node as unknown as FrameNode, warnings, parentBounds, isRoot)
    case 'BOOLEAN_OPERATION':
      return convertBooleanOperation(node as BooleanOperationNode, warnings, parentBounds)
    case 'SECTION':
      return convertFrame(node as unknown as FrameNode, warnings, parentBounds, isRoot)
    case 'COMPONENT':
      return convertFrame(node as unknown as FrameNode, warnings, parentBounds, isRoot)
    case 'STAR':
    case 'REGULAR_POLYGON':
    case 'SLICE':
      warnings.push(`Skipping unsupported node type: ${node.type} (${node.name})`)
      return null
    default:
      warnings.push(`Unknown node type: ${node.type} (${node.name})`)
      return null
  }
}

function convertFrame(node: FrameNode, warnings: string[], parentBounds: PositionContext, isRoot: boolean): WhoobeElementNode | null {
  const children = node.children || []
  const layout = convertLayout(node, isRoot ? undefined : parentBounds)
  const childElements = convertChildren(children, warnings, getNodeBounds(node))

  const bgStyle = node.fills ? convertFillsToBg(node.fills as Paint[]) : null
  const strokeStyle = node.strokes ? convertStrokeStyle(node.strokes as Paint[], node.strokeWeight) : null
  const cornerStyle = convertCornerRadius(node as unknown as CornerMixin)
  const effectsStyle = convertEffects(node.effects)
  const opacityStyle = convertOpacity(node.opacity)

  const tailwindClasses = cleanTailwind([
    ...layout.tailwind,
    ...(bgStyle?.tailwind || []),
    ...(strokeStyle?.tailwind || []),
    ...(cornerStyle?.tailwind || []),
    ...(effectsStyle?.tailwind || []),
    ...(opacityStyle ? [opacityStyle] : []),
  ].join(' ')).split(/\s+/).filter(Boolean)

  const inlineStyle = [
    ...layout.inline,
    ...(bgStyle?.inline || []),
    ...(strokeStyle?.inline || []),
    ...(cornerStyle?.inline || []),
    ...(effectsStyle?.inline || []),
  ].filter(Boolean).join('; ')

  const el: WhoobeElementNode = {
    id: randomId(),
    type: childElements.length > 0 || layout.isFlex || layout.isAbsolute ? 'container' : 'element',
    tag: 'div',
    element: 'div',
    blocks: childElements,
    css: {
      css: tailwindClasses.join(' '),
      container: isRoot ? 'gap-4' : '',
    },
  }

  if (inlineStyle) el.style = inlineStyle
  if (isRoot) {
    el.type = 'container'
    el.tag = 'document'
    el.css = el.css || { css: '', container: '' }
    el.css.container = 'gap-4'
  }

  return el
}

function convertGroup(node: GroupNode, warnings: string[], parentBounds: PositionContext): WhoobeElementNode | null {
  const children = node.children || []
  const childElements = convertChildren(children, warnings, getNodeBounds(node))

  if (childElements.length === 0) return null
  if (childElements.length === 1) {
    const single = childElements[0]
    if (node.absoluteBoundingBox && single.style) {
      single.style = `width: ${Math.round(node.absoluteBoundingBox.width)}px; height: ${Math.round(node.absoluteBoundingBox.height)}px; ${single.style}`
    }
    return single
  }

  const el: WhoobeElementNode = {
    id: randomId(),
    type: 'container',
    tag: 'div',
    element: 'div',
    blocks: childElements,
    css: { css: '', container: '' },
  }

  if (node.absoluteBoundingBox) {
    el.style = `width: ${Math.round(node.absoluteBoundingBox.width)}px; height: ${Math.round(node.absoluteBoundingBox.height)}px`
  }

  return el
}

function convertTextNode(node: TextNode, parentBounds: PositionContext): WhoobeElementNode | null {
  if (!node.characters) return null

  const converted = convertTextStyle(node.characters, node.style || {} as TypeStyle)
  const textColor = node.fills ? convertFillsToTextColor(node.fills as Paint[]) : null

  const tailwindClasses = cleanTailwind([
    ...converted.tailwind,
    ...(textColor?.tailwind || []),
  ].join(' ')).split(/\s+/).filter(Boolean)

  const inlineParts = [
    ...converted.inlineStyle,
    ...(textColor?.inline || []),
  ].filter(Boolean)

  const el: WhoobeElementNode = {
    id: randomId(),
    type: 'element',
    tag: converted.tag,
    element: converted.tag,
    content: node.characters.trimEnd(),
    editable: true,
    css: {
      css: tailwindClasses.join(' '),
      container: '',
    },
  }

  if (converted.level) el.level = converted.level

  if (converted.fontFamily) {
    if (/^(Open\+Sans|Roboto|Lato|Montserrat|Nunito|Poppins|Inter|Noto|Playfair|Merriweather|Source|Raleway|PT\+Sans|Lora|Oswald|Ubuntu|Mulish|Hind|Work\+Sans|Fira|IBM|Exo|Barlow|DM)/i.test(converted.fontFamily.replace(/ /g, '+'))) {
      el.font = converted.fontFamily.replace(/ /g, '+')
    } else {
      inlineParts.unshift(`font-family: ${converted.fontFamily}`)
    }
  }

  if (node.absoluteBoundingBox && parentBounds) {
    const rel = computeRelativePosition(node.absoluteBoundingBox, parentBounds)
    inlineParts.push('position: absolute', `left: ${rel.left}px`, `top: ${rel.top}px`)
    inlineParts.push(`width: ${Math.round(node.absoluteBoundingBox.width)}px`)
  }

  if (inlineParts.length > 0) el.style = inlineParts.join('; ')

  return el
}

function convertRectangle(node: RectangleNode, warnings: string[], parentBounds: PositionContext): WhoobeElementNode | null {
  const children = node.children || []
  if (children && children.length > 0) {
    return convertFrame(node as unknown as FrameNode, warnings, parentBounds, false)
  }

  const hasImageFill = (node.fills as Paint[])?.some(f => f.type === 'IMAGE')
  if (hasImageFill) {
    const imagePaint = (node.fills as Paint[]).find(f => f.type === 'IMAGE') as ImagePaint
    return convertImageRect(node, imagePaint, parentBounds)
  }

  const bgStyle = convertFillsToBg(node.fills as Paint[])
  const strokeStyle = node.strokes ? convertStrokeStyle(node.strokes as Paint[], node.strokeWeight) : null
  const cornerStyle = convertCornerRadius(node as unknown as CornerMixin)
  const effectsStyle = convertEffects(node.effects)
  const opacityStyle = convertOpacity(node.opacity)

  const tailwindClasses = cleanTailwind([
    ...(bgStyle?.tailwind || []),
    ...(strokeStyle?.tailwind || []),
    ...(cornerStyle?.tailwind || []),
    ...(effectsStyle?.tailwind || []),
    ...(opacityStyle ? [opacityStyle] : []),
  ].join(' ')).split(/\s+/).filter(Boolean)

  const inlineParts = [
    ...(bgStyle?.inline || []),
    ...(strokeStyle?.inline || []),
    ...(cornerStyle?.inline || []),
    ...(effectsStyle?.inline || []),
  ].filter(Boolean)

  if (node.absoluteBoundingBox) {
    inlineParts.push(`width: ${Math.round(node.absoluteBoundingBox.width)}px`, `height: ${Math.round(node.absoluteBoundingBox.height)}px`)
    const rel = computeRelativePosition(node.absoluteBoundingBox, parentBounds)
    inlineParts.push('position: absolute', `left: ${rel.left}px`, `top: ${rel.top}px`)
  }

  return {
    id: randomId(),
    type: 'element',
    tag: 'div',
    element: 'div',
    css: { css: cleanTailwind(tailwindClasses.join(' ')), container: '' },
    style: inlineParts.join('; '),
  }
}

function convertImageRect(node: RectangleNode, imagePaint: ImagePaint, parentBounds: PositionContext): WhoobeElementNode | null {
  const inlineParts: string[] = []

  if (node.absoluteBoundingBox) {
    inlineParts.push(`width: ${Math.round(node.absoluteBoundingBox.width)}px`, `height: ${Math.round(node.absoluteBoundingBox.height)}px`, 'object-fit: cover')
    const rel = computeRelativePosition(node.absoluteBoundingBox, parentBounds)
    inlineParts.push('position: absolute', `left: ${rel.left}px`, `top: ${rel.top}px`)
  }

  const cornerStyle = convertCornerRadius(node as unknown as CornerMixin)
  const tailwindClasses = []
  if (cornerStyle?.tailwind) tailwindClasses.push(...cornerStyle.tailwind)

  return {
    id: randomId(),
    type: 'element',
    tag: 'img',
    element: 'img',
    image: {
      url: imagePaint.imageRef ? `figma-image:${imagePaint.imageRef}` : '',
      alt: node.name || '',
    },
    css: { css: cleanTailwind(tailwindClasses.join(' ')), container: '' },
    style: inlineParts.join('; '),
  }
}

function convertEllipse(node: EllipseNode, parentBounds: PositionContext): WhoobeElementNode | null {
  const bgStyle = node.fills ? convertFillsToBg(node.fills as Paint[]) : null
  const strokeStyle = node.strokes ? convertStrokeStyle(node.strokes as Paint[]) : null
  const effectsStyle = convertEffects(node.effects)

  const tailwindClasses = cleanTailwind([
    'rounded-full',
    ...(bgStyle?.tailwind || []),
    ...(strokeStyle?.tailwind || []),
    ...(effectsStyle?.tailwind || []),
  ].join(' ')).split(/\s+/).filter(Boolean)

  const inlineParts = [
    ...(bgStyle?.inline || []),
    ...(strokeStyle?.inline || []),
    ...(effectsStyle?.inline || []),
  ].filter(Boolean)

  if (node.absoluteBoundingBox) {
    inlineParts.push(`width: ${Math.round(node.absoluteBoundingBox.width)}px`, `height: ${Math.round(node.absoluteBoundingBox.height)}px`)
    const rel = computeRelativePosition(node.absoluteBoundingBox, parentBounds)
    inlineParts.push('position: absolute', `left: ${rel.left}px`, `top: ${rel.top}px`)
  }

  return {
    id: randomId(),
    type: 'element',
    tag: 'div',
    element: 'div',
    css: { css: cleanTailwind(tailwindClasses.join(' ')), container: '' },
    style: inlineParts.join('; '),
  }
}

function convertLine(node: LineNode, parentBounds: PositionContext): WhoobeElementNode | null {
  const strokeStyle = node.strokes ? convertStrokeStyle(node.strokes as Paint[], 1) : null

  const inlineParts = [...(strokeStyle?.inline || [])]
  if (node.absoluteBoundingBox) {
    inlineParts.push(`width: ${Math.round(node.absoluteBoundingBox.width)}px`, `height: ${Math.round(node.absoluteBoundingBox.height)}px`)
    const rel = computeRelativePosition(node.absoluteBoundingBox, parentBounds)
    inlineParts.push('position: absolute', `left: ${rel.left}px`, `top: ${rel.top}px`)
  }

  return {
    id: randomId(),
    type: 'element',
    tag: 'hr',
    element: 'hr',
    css: { css: 'border-0', container: '' },
    style: inlineParts.join('; '),
  }
}

function convertVector(node: VectorNode, warnings: string[], parentBounds: PositionContext): WhoobeElementNode | null {
  warnings.push(`Vector "${node.name}" — rendering as empty placeholder`)

  const inlineParts: string[] = []
  if (node.absoluteBoundingBox) {
    inlineParts.push(`width: ${Math.round(node.absoluteBoundingBox.width)}px`, `height: ${Math.round(node.absoluteBoundingBox.height)}px`)
    const rel = computeRelativePosition(node.absoluteBoundingBox, parentBounds)
    inlineParts.push('position: absolute', `left: ${rel.left}px`, `top: ${rel.top}px`)
  }

  return {
    id: randomId(),
    type: 'element',
    tag: 'div',
    element: 'div',
    css: { css: '', container: '' },
    style: inlineParts.join('; '),
  }
}

function convertBooleanOperation(node: BooleanOperationNode, warnings: string[], parentBounds: PositionContext): WhoobeElementNode | null {
  warnings.push(`BooleanOperation "${node.name}" — rendering as empty placeholder`)

  const inlineParts: string[] = []
  if (node.absoluteBoundingBox) {
    inlineParts.push(`width: ${Math.round(node.absoluteBoundingBox.width)}px`, `height: ${Math.round(node.absoluteBoundingBox.height)}px`)
    const rel = computeRelativePosition(node.absoluteBoundingBox, parentBounds)
    inlineParts.push('position: absolute', `left: ${rel.left}px`, `top: ${rel.top}px`)
  }

  return {
    id: randomId(),
    type: 'element',
    tag: 'div',
    element: 'div',
    css: { css: '', container: '' },
    style: inlineParts.join('; '),
  }
}

function convertChildren(children: SubcanvasNode[], warnings: string[], parentBounds: PositionContext): WhoobeElementNode[] {
  const results: WhoobeElementNode[] = []
  for (const child of children) {
    if (child.visible === false) continue
    const converted = convertNode(child, warnings, parentBounds, false)
    if (converted) results.push(converted)
  }
  return results
}

function getNodeBounds(node: SubcanvasNode): PositionContext {
  const bounds = 'absoluteBoundingBox' in node ? (node as any).absoluteBoundingBox : null
  return {
    x: bounds?.x ?? 0,
    y: bounds?.y ?? 0,
    width: bounds?.width ?? 0,
    height: bounds?.height ?? 0,
  }
}

function createEmptyRoot(): WhoobeElementNode {
  return {
    id: randomId(),
    type: 'container',
    tag: 'document',
    element: 'div',
    blocks: [],
    css: { css: '', container: 'gap-4' },
  }
}

function ensureDefaults(node: WhoobeElementNode): void {
  if (!node.css) node.css = { css: '', container: '' }
  if (!node.blocks) node.blocks = []
  for (const child of node.blocks) {
    ensureDefaults(child)
  }
}
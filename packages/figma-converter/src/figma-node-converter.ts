import type { FigmaNode, SubcanvasNode, FrameNode, GroupNode, TextNode, RectangleNode, EllipseNode, LineNode, VectorNode, InstanceNode, BooleanOperationNode, SectionNode, Paint, FrameProperties, LayoutMixin, CornerMixin, TypeStyle } from './figma-types.js'
import type { ConversionResult, FigmaConversionOptions, WhoobeElementNode } from './types.js'
import { convertLayout } from './layout.js'
import { convertFillsToBg, convertFillsToTextColor, convertStrokeStyle, convertCornerRadius, convertEffects, convertOpacity } from './style.js'
import { convertTextStyle } from './text.js'
import { randomId, cleanTailwind } from './utils.js'

export function convertFigmaNode(node: FigmaNode, options?: FigmaConversionOptions): ConversionResult {
  const warnings: string[] = []
  const images: Record<string, string> = {}
  const element = convertNode(node as SubcanvasNode, warnings, true)

  if (element) {
    ensureDefaults(element)
    element.label = node.name
  }

  return {
    element: element || createEmptyRoot(),
    name: node.name || 'Untitled',
    images,
    warnings,
  }
}

function convertNode(node: SubcanvasNode, warnings: string[], isRoot: boolean): WhoobeElementNode | null {
  switch (node.type) {
    case 'FRAME':
      return convertFrame(node as FrameNode, warnings, isRoot)
    case 'GROUP':
      return convertGroup(node as GroupNode, warnings)
    case 'TEXT':
      return convertTextNode(node as TextNode)
    case 'RECTANGLE':
      return convertRectangle(node as RectangleNode, warnings)
    case 'ELLIPSE':
      return convertEllipse(node as EllipseNode)
    case 'LINE':
      return convertLine(node as LineNode)
    case 'VECTOR':
      return convertVector(node as VectorNode, warnings)
    case 'INSTANCE':
      return convertFrame(node as unknown as FrameNode, warnings, isRoot)
    case 'BOOLEAN_OPERATION':
      return convertBooleanOperation(node as BooleanOperationNode, warnings)
    case 'SECTION':
      return convertFrame(node as unknown as FrameNode, warnings, isRoot)
    case 'COMPONENT':
      return convertFrame(node as unknown as FrameNode, warnings, isRoot)
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

function convertFrame(node: FrameNode | RectangleNode, warnings: string[], isRoot: boolean): WhoobeElementNode | null {
  const children: SubcanvasNode[] = node.children || []

  const layout = convertLayout(node as unknown as FrameProperties & Partial<LayoutMixin>)
  const bgStyle = node.fills ? convertFillsToBg(node.fills as Paint[]) : null
  const strokeStyle = node.strokes ? convertStrokeStyle(node.strokes as Paint[], (node as FrameNode).strokeWeight) : null
  const cornerStyle = convertCornerRadius(node as unknown as CornerMixin)
  const effectsStyle = convertEffects((node as FrameNode).effects)
  const opacityStyle = convertOpacity((node as unknown as { opacity?: number }).opacity)

  const childElements = convertChildren(children, warnings)

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
    type: childElements.length > 0 || layout.isFlex ? 'container' : 'element',
    tag: 'div',
    element: isRoot ? 'div' : 'div',
    blocks: childElements,
    css: {
      css: tailwindClasses.join(' '),
      container: isRoot ? 'gap-4' : '',
    },
  }

  if (inlineStyle) {
    el.style = inlineStyle
  }

  if (layout.isFlex) {
    el.data = { ...(el.data as Record<string, unknown> || {}), direction: layout.tailwind.includes('flex-col') ? 'col' : 'row' }
  }

  return el
}

function convertGroup(node: GroupNode, warnings: string[]): WhoobeElementNode | null {
  const children = node.children || []
  const childElements = convertChildren(children, warnings)

  if (!childElements || childElements.length === 0) {
    return null
  }

  if (childElements.length === 1) {
    return childElements[0]
  }

  const bgStyle = node.fills ? convertFillsToBg(node.fills as Paint[]) : null
  const cornerStyle = convertCornerRadius(node as unknown as CornerMixin)
  const effectsStyle = convertEffects(node.effects)
  const opacityStyle = convertOpacity(node.opacity)

  const tailwindClasses = cleanTailwind([
    ...(bgStyle?.tailwind || []),
    ...(cornerStyle?.tailwind || []),
    ...(effectsStyle?.tailwind || []),
    ...(opacityStyle ? [opacityStyle] : []),
  ].join(' ')).split(/\s+/).filter(Boolean)

  const inlineStyle = [
    ...(bgStyle?.inline || []),
    ...(cornerStyle?.inline || []),
    ...(effectsStyle?.inline || []),
  ].filter(Boolean).join('; ')

  const el: WhoobeElementNode = {
    id: randomId(),
    type: 'container',
    tag: 'div',
    element: 'div',
    blocks: childElements,
    css: {
      css: tailwindClasses.join(' '),
      container: '',
    },
  }

  if (inlineStyle) el.style = inlineStyle
  return el
}

function convertTextNode(node: TextNode): WhoobeElementNode | null {
  if (!node.characters) return null

  const converted = convertTextStyle(node.characters, node.style || {} as TypeStyle)

  const textColor = node.fills ? convertFillsToTextColor(node.fills as Paint[]) : null
  const opacityStyle = convertOpacity(node.opacity)

  const tailwindClasses = cleanTailwind([
    ...converted.tailwind,
    ...(textColor?.tailwind || []),
    ...(opacityStyle ? [opacityStyle] : []),
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
    content: node.characters,
    editable: true,
    css: {
      css: tailwindClasses.join(' '),
      container: '',
    },
  }

  if (converted.level) el.level = converted.level

  if (converted.fontFamily) {
    if (converted.fontFamily.match(/^(Open\+Sans|Roboto|Lato|Montserrat|Nunito\+Sans|Poppins|Inter|Noto\+Sans|Playfair\+Display|Merriweather|Source\+Sans\+Pro|Raleway|PT\+Sans|Lora|Oswald|Ubuntu|Mulish|Hind|Work\+Sans|Fira\+Sans|IBM\+Plex\+Sans|Exo\+2|Barlow|DM\+Sans)/i)) {
      el.font = converted.fontFamily.replace(/ /g, '+')
    } else {
      inlineParts.unshift(`font-family: ${converted.fontFamily}`)
    }
  }

  if (inlineParts.length > 0) el.style = inlineParts.join('; ')

  return el
}

function convertRectangle(node: RectangleNode, warnings: string[]): WhoobeElementNode | null {
  const children = node.children || []

  if (children && children.length > 0) {
    return convertFrame(node as unknown as FrameNode, warnings, false)
  }

  const hasImageFill = (node.fills as Paint[])?.some(f => f.type === 'IMAGE')
  if (hasImageFill) {
    const imagePaint = (node.fills as Paint[]).find(f => f.type === 'IMAGE') as import('./figma-types.js').ImagePaint
    const bgStyle = convertFillsToBg((node.fills as Paint[]).filter(f => f.type !== 'IMAGE'))
    const cornerStyle = convertCornerRadius(node as unknown as CornerMixin)
    const effectsStyle = convertEffects(node.effects)
    const strokeStyle = node.strokes ? convertStrokeStyle(node.strokes as Paint[], node.strokeWeight) : null

    const tailwindClasses = cleanTailwind([
      ...(bgStyle?.tailwind || []),
      ...(cornerStyle?.tailwind || []),
      ...(effectsStyle?.tailwind || []),
      ...(strokeStyle?.tailwind || []),
    ].join(' ')).split(/\s+/).filter(Boolean)

    const inlineStyle = [
      ...(bgStyle?.inline || []),
      ...(cornerStyle?.inline || []),
      ...(effectsStyle?.inline || []),
      ...(strokeStyle?.inline || []),
    ].filter(Boolean).join('; ')

    const el: WhoobeElementNode = {
      id: randomId(),
      type: 'element',
      tag: 'img',
      element: 'img',
      image: {
        url: `figma-image:${imagePaint.imageRef}`,
        alt: node.name || '',
      },
      css: {
        css: tailwindClasses.join(' '),
        container: '',
      },
    }

    if (node.absoluteBoundingBox) {
      el.style = `width: ${node.absoluteBoundingBox.width}px; height: ${node.absoluteBoundingBox.height}px; object-fit: cover` + (inlineStyle ? `; ${inlineStyle}` : '')
    }

    return el
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

  const inlineStyle = [
    ...(bgStyle?.inline || []),
    ...(strokeStyle?.inline || []),
    ...(cornerStyle?.inline || []),
    ...(effectsStyle?.inline || []),
  ].filter(Boolean).join('; ')

  const el: WhoobeElementNode = {
    id: randomId(),
    type: 'element',
    tag: 'div',
    element: 'div',
    css: {
      css: tailwindClasses.join(' '),
      container: '',
    },
  }

  if (node.absoluteBoundingBox) {
    const dims = `width: ${node.absoluteBoundingBox.width}px; height: ${node.absoluteBoundingBox.height}px`
    el.style = inlineStyle ? `${dims}; ${inlineStyle}` : dims
  } else if (inlineStyle) {
    el.style = inlineStyle
  }

  return el
}

function convertEllipse(node: EllipseNode): WhoobeElementNode | null {
  const bgStyle = node.fills ? convertFillsToBg(node.fills as Paint[]) : null
  const strokeStyle = node.strokes ? convertStrokeStyle(node.strokes as Paint[]) : null
  const effectsStyle = convertEffects(node.effects)
  const opacityStyle = convertOpacity(node.opacity)

  const tailwindClasses = cleanTailwind([
    'rounded-full',
    ...(bgStyle?.tailwind || []),
    ...(strokeStyle?.tailwind || []),
    ...(effectsStyle?.tailwind || []),
    ...(opacityStyle ? [opacityStyle] : []),
  ].join(' ')).split(/\s+/).filter(Boolean)

  const inlineStyle = [
    ...(bgStyle?.inline || []),
    ...(strokeStyle?.inline || []),
    ...(effectsStyle?.inline || []),
  ].filter(Boolean).join('; ')

  const el: WhoobeElementNode = {
    id: randomId(),
    type: 'element',
    tag: 'div',
    element: 'div',
    css: {
      css: tailwindClasses.join(' '),
      container: '',
    },
  }

  if (node.absoluteBoundingBox) {
    const dims = `width: ${node.absoluteBoundingBox.width}px; height: ${node.absoluteBoundingBox.height}px`
    el.style = inlineStyle ? `${dims}; ${inlineStyle}` : dims
  } else if (inlineStyle) {
    el.style = inlineStyle
  }

  return el
}

function convertLine(node: LineNode): WhoobeElementNode | null {
  const strokeStyle = node.strokes ? convertStrokeStyle(node.strokes as Paint[], 1) : null

  const tailwindClasses = cleanTailwind([
    'border-0',
    ...(strokeStyle?.tailwind || []),
  ].join(' ')).split(/\s+/).filter(Boolean)

  const inlineStyle = [
    ...(strokeStyle?.inline || []),
  ].join('; ')

  const el: WhoobeElementNode = {
    id: randomId(),
    type: 'element',
    tag: 'hr',
    element: 'hr',
    css: {
      css: tailwindClasses.join(' '),
      container: '',
    },
  }

  if (inlineStyle) el.style = inlineStyle

  return el
}

function convertVector(node: VectorNode, warnings: string[]): WhoobeElementNode | null {
  warnings.push(`Vector node "${node.name}" will render as placeholder SVG`)
  const bgStyle = node.fills ? convertFillsToBg(node.fills as Paint[]) : null
  const effectsStyle = convertEffects(node.effects)

  const tailwindClasses = cleanTailwind([
    ...(bgStyle?.tailwind || []),
    ...(effectsStyle?.tailwind || []),
  ].join(' ')).split(/\s+/).filter(Boolean)

  const el: WhoobeElementNode = {
    id: randomId(),
    type: 'element',
    tag: 'img',
    element: 'img',
    image: { url: '', alt: node.name || '' },
    css: {
      css: tailwindClasses.join(' '),
      container: '',
    },
  }

  if (node.absoluteBoundingBox) {
    el.style = `width: ${node.absoluteBoundingBox.width}px; height: ${node.absoluteBoundingBox.height}px`
  }

  return el
}

function convertBooleanOperation(node: BooleanOperationNode, warnings: string[]): WhoobeElementNode | null {
  warnings.push(`BooleanOperation "${node.name}" will render as placeholder`)
  const bgStyle = node.fills ? convertFillsToBg(node.fills as Paint[]) : null

  const tailwindClasses = cleanTailwind([
    ...(bgStyle?.tailwind || []),
  ].join(' ')).split(/\s+/).filter(Boolean)

  const el: WhoobeElementNode = {
    id: randomId(),
    type: 'element',
    tag: 'div',
    element: 'div',
    css: {
      css: tailwindClasses.join(' '),
      container: '',
    },
  }

  if (node.absoluteBoundingBox) {
    el.style = `width: ${node.absoluteBoundingBox.width}px; height: ${node.absoluteBoundingBox.height}px`
  }

  return el
}

function convertChildren(children: SubcanvasNode[], warnings: string[]): WhoobeElementNode[] {
  const results: WhoobeElementNode[] = []
  for (const child of children) {
    if (child.visible === false) continue
    const converted = convertNode(child, warnings, false)
    if (converted) results.push(converted)
  }
  return results
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
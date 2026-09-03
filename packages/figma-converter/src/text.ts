import type { TypeStyle } from './figma-types.js'
import { arbValue, cleanTailwind } from './utils.js'

function fontWeightToTailwind(weight: number): string | null {
  const map: Record<number, string> = {
    100: 'font-thin',
    200: 'font-extralight',
    300: 'font-light',
    400: 'font-normal',
    500: 'font-medium',
    600: 'font-semibold',
    700: 'font-bold',
    800: 'font-extrabold',
    900: 'font-black',
  }
  return map[Math.round(weight)] ?? null
}

function fontSizeToTailwind(sizePx: number): { cls: string; style: string } {
  const map: Record<number, string> = {
    12: 'text-xs',
    14: 'text-sm',
    16: 'text-base',
    18: 'text-lg',
    20: 'text-xl',
    24: 'text-2xl',
    30: 'text-3xl',
    36: 'text-4xl',
    48: 'text-5xl',
    60: 'text-6xl',
    72: 'text-7xl',
    96: 'text-8xl',
    128: 'text-9xl',
  }
  const cls = map[Math.round(sizePx)]
  if (cls) return { cls, style: '' }
  return { cls: '', style: `font-size: ${sizePx}px` }
}

function textAlignToTailwind(align: string): string {
  switch (align) {
    case 'LEFT': return 'text-left'
    case 'CENTER': return 'text-center'
    case 'RIGHT': return 'text-right'
    case 'JUSTIFIED': return 'text-justify'
    default: return ''
  }
}

export interface TextConversionResult {
  tag: string
  level?: number
  tailwind: string[]
  inlineStyle: string[]
  fontFamily: string
}

export function convertTextStyle(characters: string, style: TypeStyle): TextConversionResult {
  const tailwind: string[] = []
  const inline: string[] = []

  const size = style.fontSize || 16
  const sizeResult = fontSizeToTailwind(size)
  if (sizeResult.cls) tailwind.push(sizeResult.cls)
  if (sizeResult.style) inline.push(sizeResult.style)

  const weight = fontWeightToTailwind(style.fontWeight)
  if (weight) tailwind.push(weight)

  const align = textAlignToTailwind(style.textAlignHorizontal || 'LEFT')
  if (align) tailwind.push(align)

  if (style.italic) tailwind.push('italic')

  if (style.textDecoration === 'UNDERLINE') tailwind.push('underline')
  if (style.textDecoration === 'STRIKETHROUGH') tailwind.push('line-through')

  if (style.letterSpacing) {
    tailwind.push(`tracking-[${style.letterSpacing}px]`)
  }

  if (style.lineHeightPx && style.lineHeightPx !== size * 1.2) {
    tailwind.push(`leading-[${style.lineHeightPx}px]`)
  }

  if (style.paragraphSpacing && style.paragraphSpacing > 0) {
    tailwind.push(`space-y-[${style.paragraphSpacing}px]`)
  }

  if (style.textCase === 'UPPER') tailwind.push('uppercase')
  if (style.textCase === 'LOWER') tailwind.push('lowercase')
  if (style.textCase === 'TITLE') tailwind.push('capitalize')

  let tag = 'p'
  let level: number | undefined

  if (size >= 28) { tag = 'h1'; level = 1 }
  else if (size >= 24) { tag = 'h2'; level = 2 }
  else if (size >= 20) { tag = 'h3'; level = 3 }
  else if (size >= 16) { tag = 'h4'; level = 4 }
  else if (size >= 14) { tag = 'h5'; level = 5 }

  const fontFamily = style.fontFamily || ''

  return {
    tag,
    level,
    tailwind: cleanTailwind(tailwind.join(' ')).split(/\s+/).filter(Boolean),
    inlineStyle: inline,
    fontFamily,
  }
}

export function headingLevelForTag(tag: string): number | undefined {
  const map: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 }
  return map[tag]
}
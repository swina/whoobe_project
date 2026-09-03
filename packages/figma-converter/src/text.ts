import type { TypeStyle } from './figma-types.js'
import { cleanTailwind } from './utils.js'

function fontWeightToTailwind(weight: number): string | null {
  const map: Record<number, string> = {
    100: 'font-thin', 200: 'font-extralight', 300: 'font-light',
    400: 'font-normal', 500: 'font-medium', 600: 'font-semibold',
    700: 'font-bold', 800: 'font-extrabold', 900: 'font-black',
  }
  return map[Math.round(weight)] ?? null
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
  tailwind.push(`text-[${size}px]`)

  const weight = fontWeightToTailwind(style.fontWeight)
  if (weight) tailwind.push(weight)

  if (style.textAlignHorizontal === 'CENTER') tailwind.push('text-center')
  else if (style.textAlignHorizontal === 'RIGHT') tailwind.push('text-right')
  else if (style.textAlignHorizontal === 'JUSTIFIED') tailwind.push('text-justify')

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
    tailwind.push(`[&>p]:mb-[${style.paragraphSpacing}px]`)
  }

  if (style.textCase === 'UPPER') tailwind.push('uppercase')
  if (style.textCase === 'LOWER') tailwind.push('lowercase')
  if (style.textCase === 'TITLE') tailwind.push('capitalize')

  let tag = 'p'
  let level: number | undefined

  if (size >= 28) { tag = 'h1'; level = 1 }
  else if (size >= 24) { tag = 'h2'; level = 2 }
  else if (size >= 20) { tag = 'h3'; level = 3 }
  else if (size >= 18) { tag = 'h4'; level = 4 }
  else if (size >= 16) { tag = 'h5'; level = 5 }

  const fontFamily = style.fontFamily || ''

  return {
    tag,
    level,
    tailwind: cleanTailwind(tailwind.join(' ')).split(/\s+/).filter(Boolean),
    inlineStyle: inline,
    fontFamily,
  }
}
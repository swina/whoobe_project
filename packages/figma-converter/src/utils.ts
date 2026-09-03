import type { Paint, RGB } from './figma-types.js'

export function rgbaToHex(color: RGB, opacity?: number): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, '0')
  const g = Math.round(color.g * 255).toString(16).padStart(2, '0')
  const b = Math.round(color.b * 255).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

export function rgbaToCss(color: RGB, opacity?: number): string {
  const r = Math.round(color.r * 255)
  const g = Math.round(color.g * 255)
  const b = Math.round(color.b * 255)
  const a = opacity ?? 1
  return `rgba(${r},${g},${b},${a})`
}

export function nearestTailwindValue(px: number, threshold = 2): { cls: string; exact: string } | null {
  if (px === 0) return { cls: '0', exact: '0' }
  const rem = px / 4
  const rounded = Math.round(rem)
  const diff = Math.abs(rem - rounded) * 4
  if (diff <= threshold) {
    const value4 = Math.round(px / 4) * 4
    if (value4 === 0) return null
    return { cls: `${value4}`, exact: `${px}` }
  }
  return null
}

export function tailwindSpacing(px: number, prefix: string): string {
  if (px === 0) return `${prefix}-0`
  const nearest = nearestTailwindValue(px)
  if (nearest) {
    const value = parseInt(nearest.cls)
    const twValue = value < 4 ? `0.${value / 4}` : `${value / 4}`
    return `${prefix}-${twValue}`
  }
  return `${prefix}-[${px}px]`
}

export function arbValue(value: number | string, unit = 'px'): string {
  return `[${value}${unit}]`
}

export function randomId(): string {
  return 'fig-' + Math.random().toString(36).substring(2, 7)
}

export function isSignificantFill(fills: Paint[] | undefined | null): boolean {
  if (!fills || fills.length === 0) return false
  const visible = fills.filter(f => f.visible !== false)
  if (visible.length === 0) return false
  const first = visible[0]
  if (first.type === 'SOLID') {
    const { r, g, b } = first.color as RGB
    if (r === 1 && g === 1 && b === 1 && (first.opacity == null || first.opacity === 1)) return false
  }
  return true
}

export function cleanTailwind(str: string | null | undefined): string {
  if (!str) return ''
  const classes = str.trim().split(/\s+/).filter(Boolean)
  const deduped = [...new Set(classes)]
  return deduped.join(' ')
}
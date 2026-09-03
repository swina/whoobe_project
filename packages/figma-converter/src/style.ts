import type { Paint, SolidPaint, GradientPaint, Effect, CornerMixin } from './figma-types.js'
import { rgbaToCss, rgbaToHex, arbValue, cleanTailwind } from './utils.js'

export interface StyleResult {
  tailwind: string[]
  inline: string[]
}

export function mergeStyles(...results: (StyleResult | null)[]): StyleResult {
  const tailwind: string[] = []
  const inline: string[] = []
  for (const r of results) {
    if (r) {
      tailwind.push(...r.tailwind)
      inline.push(...r.inline)
    }
  }
  return { tailwind: cleanTailwind(tailwind.join(' ')).split(/\s+/).filter(Boolean), inline }
}

export function convertFillsToBg(fills: Paint[] | undefined | null): StyleResult | null {
  if (!fills || fills.length === 0) return null
  const visible = fills.filter(f => f.visible !== false)
  if (visible.length === 0) return null

  const first = visible[0]

  if (first.type === 'SOLID') {
    return convertSolidBg(first)
  }
  if (first.type.startsWith('GRADIENT')) {
    return convertGradientBg(first as GradientPaint)
  }
  if (first.type === 'IMAGE') {
    return null
  }

  return null
}

function convertSolidBg(paint: SolidPaint): StyleResult {
  const hex = rgbaToHex(paint.color)
  const tailwind: string[] = []
  const inline: string[] = []

  tailwind.push(`bg-[${hex}]`)

  if (paint.opacity != null && paint.opacity < 1) {
    inline.push(`background-color: ${rgbaToCss(paint.color, paint.opacity)}`)
    tailwind.pop()
  }

  return { tailwind, inline }
}

function convertGradientBg(paint: GradientPaint): StyleResult {
  const stops = paint.gradientStops
  const tailwind: string[] = []
  const inline: string[] = []

  if (stops.length === 2 && paint.type === 'GRADIENT_LINEAR') {
    const h1 = paint.gradientHandlePositions?.[0]
    const h2 = paint.gradientHandlePositions?.[1]
    if (h1 && h2) {
      const dx = h2.x - h1.x
      const dy = h2.y - h1.y
      const angle = Math.round(Math.atan2(dy, dx) * 180 / Math.PI)

      if (angle === 0) {
        tailwind.push(`bg-gradient-to-r`)
      } else if (angle === 90 || angle === -90) {
        tailwind.push(`bg-gradient-to-b`)
      } else if (angle === 180 || angle === -180) {
        tailwind.push(`bg-gradient-to-l`)
      } else if (angle === -270 || angle === 270) {
        tailwind.push(`bg-gradient-to-t`)
      } else {
        inline.push(`background: linear-gradient(${angle}deg, ${stops.map(s => `${rgbaToCss(s.color)} ${Math.round(s.position * 100)}%`).join(', ')})`)
        return { tailwind, inline }
      }

      const firstHex = rgbaToHex(stops[0].color)
      const lastHex = rgbaToHex(stops[1].color)
      const fromVar = `from-[${firstHex}]`
      const toVar = `to-[${lastHex}]`
      tailwind.push(fromVar, toVar)

      if (stops[0].color.a != null && stops[0].color.a < 1) {
        inline.push(`--tw-gradient-from: ${rgbaToCss(stops[0].color)}`)
      }
      if (stops[1].color.a != null && stops[1].color.a < 1) {
        inline.push(`--tw-gradient-to: ${rgbaToCss(stops[1].color)}`)
      }
      return { tailwind, inline }
    }
  }

  const gradType = paint.type === 'GRADIENT_LINEAR' ? 'linear' : paint.type === 'GRADIENT_RADIAL' ? 'radial' : 'linear'
  inline.push(`background: ${gradType}-gradient(${stops.map(s => `${rgbaToCss(s.color)} ${Math.round(s.position * 100)}%`).join(', ')})`)
  return { tailwind, inline }
}

export function convertFillsToTextColor(fills: Paint[] | undefined | null): StyleResult | null {
  if (!fills || fills.length === 0) return null
  const visible = fills.filter(f => f.visible !== false)
  if (visible.length === 0) return null
  const first = visible[0]
  if (first.type === 'SOLID') {
    return {
      tailwind: [`text-[${rgbaToHex(first.color)}]`],
      inline: first.opacity != null && first.opacity < 1 ? [`color: ${rgbaToCss(first.color, first.opacity)}`] : [],
    }
  }
  return null
}

export function convertStrokeStyle(strokes: Paint[] | undefined | null, weight?: number): StyleResult | null {
  if (!strokes || strokes.length === 0) return null
  const visible = strokes.filter(s => s.visible !== false)
  if (visible.length === 0) return null
  const first = visible[0]
  const tailwind: string[] = []
  const inline: string[] = []

  if (first.type === 'SOLID') {
    tailwind.push(`border-[${rgbaToHex(first.color)}]`)
  }

  if (weight && weight > 0) {
    tailwind.push(`border-[${weight}px]`)
  }

  if (tailwind.length > 0 || inline.length > 0) {
    return { tailwind, inline }
  }
  return null
}

export function convertCornerRadius(corner: CornerMixin | undefined | null): StyleResult | null {
  if (!corner) return null
  const { cornerRadius, rectangleCornerRadii } = corner
  const tailwind: string[] = []
  const inline: string[] = []

  if (cornerRadius === 9999) {
    tailwind.push('rounded-full')
  } else if (cornerRadius > 0) {
    const allEqual = rectangleCornerRadii &&
      rectangleCornerRadii.every((r: number) => r === cornerRadius)
    if (allEqual) {
      tailwind.push(`rounded-[${cornerRadius}px]`)
    } else if (rectangleCornerRadii) {
      const [tl, tr, br, bl] = rectangleCornerRadii
      inline.push(`border-radius: ${tl}px ${tr}px ${br}px ${bl}px`)
    } else {
      tailwind.push(`rounded-[${cornerRadius}px]`)
    }
  }

  if (corner.cornerSmoothing > 0) {
    tailwind.push(`rounded-[calc(var(--tw-${cornerRadius}px) * ${1 - corner.cornerSmoothing * 0.3})]`)
  }

  if (tailwind.length > 0 || inline.length > 0) return { tailwind, inline }
  return null
}

export function convertEffects(effects: Effect[] | undefined | null): StyleResult | null {
  if (!effects || effects.length === 0) return null
  const visible = effects.filter(e => e.visible !== false)
  if (visible.length === 0) return null
  const tailwind: string[] = []
  const inline: string[] = []

  for (const effect of visible) {
    if (effect.type === 'DROP_SHADOW' && effect.color && effect.offset) {
      const { color, offset, radius, spread } = effect
      const shadowColor = rgbaToCss(color as { r: number; g: number; b: number; a: number })
      const spreadVal = spread || 0
      tailwind.push(`shadow-[${offset.x}px_${offset.y}px_${radius || 0}px_${spreadVal}px_${shadowColor}]`)
    } else if (effect.type === 'INNER_SHADOW' && effect.color && effect.offset) {
      const { color, offset, radius } = effect
      const shadowColor = rgbaToCss(color as { r: number; g: number; b: number; a: number })
      inline.push(`box-shadow: inset ${offset.x}px ${offset.y}px ${radius || 0}px 0 ${shadowColor}`)
    } else if (effect.type === 'LAYER_BLUR' && effect.radius) {
      tailwind.push(`blur-[${effect.radius}px]`)
    }
  }

  if (tailwind.length > 0 || inline.length > 0) return { tailwind, inline }
  return null
}

export function convertOpacity(opacity: number | undefined | null): string | null {
  if (opacity == null || opacity >= 1) return null
  const roundMap = [5, 10, 25, 50, 75, 90, 95, 100]
  const pct = opacity * 100
  const nearest = roundMap.reduce((a, b) => Math.abs(b - pct) < Math.abs(a - pct) ? b : a)
  const diff = Math.abs(nearest - pct)
  return diff <= 5 ? `opacity-${nearest}` : `opacity-[${opacity}]`
}
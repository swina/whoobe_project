import { describe, it, expect } from 'vitest'
import { convertFillsToBg, convertFillsToTextColor, convertCornerRadius, convertEffects, convertOpacity, convertStrokeStyle } from '../style.js'
import type { StyleResult } from '../types.js'

describe('convertFillsToBg', () => {
  it('converts solid fill to bg class', () => {
    const result: StyleResult | null = convertFillsToBg([
      { type: 'SOLID', visible: true, opacity: 1, color: { r: 1, g: 0, b: 0 } }
    ])
    expect(result?.tailwind).toContain('bg-[#ff0000]')
  })

  it('returns null for empty fills', () => {
    expect(convertFillsToBg([])).toBeNull()
    expect(convertFillsToBg(undefined)).toBeNull()
  })

  it('returns inline rgba for transparent color', () => {
    const result: StyleResult | null = convertFillsToBg([
      { type: 'SOLID', visible: true, opacity: 0.5, color: { r: 0, g: 0, b: 1 } }
    ])
    expect(result?.inline.some(s => s.includes('rgba'))).toBe(true)
  })
})

describe('convertCornerRadius', () => {
  it('handles uniform corner radius', () => {
    const result: StyleResult | null = convertCornerRadius({
      cornerRadius: 8,
      cornerSmoothing: 0,
      rectangleCornerRadii: [8, 8, 8, 8]
    })
    expect(result?.tailwind?.[0]).toBe('rounded-[8px]')
  })

  it('returns rounded-full for radius 9999', () => {
    const result: StyleResult | null = convertCornerRadius({
      cornerRadius: 9999,
      cornerSmoothing: 0,
      rectangleCornerRadii: [9999, 9999, 9999, 9999]
    })
    expect(result?.tailwind).toContain('rounded-full')
  })

  it('returns inline style for uneven corners', () => {
    const result: StyleResult | null = convertCornerRadius({
      cornerRadius: 8,
      cornerSmoothing: 0,
      rectangleCornerRadii: [8, 0, 8, 0]
    })
    expect(result?.inline.some(s => s.includes('border-radius'))).toBe(true)
  })

  it('returns null for zero radius', () => {
    const result: StyleResult | null = convertCornerRadius({
      cornerRadius: 0,
      cornerSmoothing: 0,
      rectangleCornerRadii: [0, 0, 0, 0]
    })
    expect(result).toBeNull()
  })
})

describe('convertOpacity', () => {
  it('converts opacity to class', () => {
    expect(convertOpacity(0.5)).toBe('opacity-50')
    expect(convertOpacity(0.25)).toBe('opacity-25')
    expect(convertOpacity(1)).toBeNull()
    expect(convertOpacity(null)).toBeNull()
  })
})

describe('convertEffects', () => {
  it('converts drop shadow to tailwind shadow class', () => {
    const result: StyleResult | null = convertEffects([
      { type: 'DROP_SHADOW', visible: true, color: { r: 0, g: 0, b: 0, a: 0.1 }, offset: { x: 0, y: 4 }, radius: 8, spread: 0, blendMode: 'NORMAL' }
    ])
    expect(result?.tailwind.some(c => c.startsWith('shadow-['))).toBe(true)
  })

  it('returns null for empty effects', () => {
    expect(convertEffects([])).toBeNull()
  })
})

describe('convertStrokeStyle', () => {
  it('converts stroke to border class', () => {
    const result: StyleResult | null = convertStrokeStyle([
      { type: 'SOLID', visible: true, opacity: 1, color: { r: 0.9, g: 0.9, b: 0.9 } }
    ], 1)
    expect(result?.tailwind.some(c => c.includes('border-'))).toBe(true)
  })
})
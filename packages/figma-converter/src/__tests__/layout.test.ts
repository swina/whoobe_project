import { describe, it, expect } from 'vitest'
import { convertLayout } from '../layout.js'
import type { LayoutResult } from '../types.js'

describe('convertLayout', () => {
  it('returns flex-row for HORIZONTAL layout', () => {
    const result: LayoutResult = convertLayout({
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'MIN',
      counterAxisAlignItems: 'MIN',
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      paddingBottom: 0,
      itemSpacing: 0,
      clipsContent: false,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    })
    expect(result.tailwind).toContain('flex')
    expect(result.tailwind).toContain('flex-row')
    expect(result.isFlex).toBe(true)
  })

  it('returns flex-col for VERTICAL layout', () => {
    const result: LayoutResult = convertLayout({
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'MIN',
      counterAxisAlignItems: 'MIN',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    } as any)
    expect(result.tailwind).toContain('flex-col')
  })

  it('adds gap for itemSpacing', () => {
    const result: LayoutResult = convertLayout({
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'MIN',
      counterAxisAlignItems: 'MIN',
      itemSpacing: 16,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    } as any)
    expect(result.tailwind.some(c => c.includes('gap-'))).toBe(true)
  })

  it('adds padding classes', () => {
    const result: LayoutResult = convertLayout({
      layoutMode: 'NONE',
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: 24,
      paddingBottom: 24,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    } as any)
    expect(result.tailwind.some(c => c.startsWith('px-'))).toBe(true)
    expect(result.tailwind.some(c => c.startsWith('py-'))).toBe(true)
  })

  it('adds justify-center for CENTER primary alignment', () => {
    const result: LayoutResult = convertLayout({
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'CENTER',
      counterAxisAlignItems: 'MIN',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    } as any)
    expect(result.tailwind).toContain('justify-center')
  })

it('adds absolute positioning for ABSOLUTE layoutPositioning', () => {
    const result: LayoutResult = convertLayout({
      layoutMode: 'NONE',
      layoutPositioning: 'ABSOLUTE',
      absoluteBoundingBox: { x: 50, y: 30, width: 200, height: 100 },
    } as any, { x: 0, y: 0 })
    expect(result.inline.some(s => s.includes('position: absolute'))).toBe(true)
    expect(result.inline.some(s => s.includes('left: 50px'))).toBe(true)
    expect(result.inline.some(s => s.includes('top: 30px'))).toBe(true)
  })

  it('handles zero-padding gracefully', () => {
    const result: LayoutResult = convertLayout({
      layoutMode: 'NONE',
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      paddingBottom: 0,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    } as any)
    expect(result.tailwind.filter(c => c.startsWith('p')).length).toBe(0)
  })
})
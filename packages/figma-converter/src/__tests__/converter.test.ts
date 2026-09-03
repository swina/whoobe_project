import { describe, it, expect } from 'vitest'
import { convertFigmaNode } from '../figma-node-converter.js'
import type { ConversionResult } from '../types.js'
import simpleTextFixture from './fixtures/simple-text.json' with { type: 'json' }
import cardFixture from './fixtures/auto-layout-card.json' with { type: 'json' }

describe('convertFigmaNode', () => {
  it('converts a simple text frame', () => {
    const result: ConversionResult = convertFigmaNode(simpleTextFixture as any)
    expect(result.warnings).toHaveLength(0)
    expect(result.element.id).toBeTruthy()
    expect(result.element.type).toBe('container')
    expect(result.element.css?.container).toBe('gap-4')
    expect(result.element.blocks).toHaveLength(1)
  })

  it('creates proper text element', () => {
    const result: ConversionResult = convertFigmaNode(simpleTextFixture as any)
    const textEl = result.element.blocks?.[0]
    expect(textEl).toBeTruthy()
    expect(textEl?.element).toBe('h2')
    expect(textEl?.content).toBe('Welcome to Whoobe CMS')
    expect(textEl?.editable).toBe(true)
    expect(textEl?.font).toBe('Inter')
    expect(String(textEl?.style)).toContain('position: absolute')
  })

  it('sets correct heading level based on fontsize 24', () => {
    const result: ConversionResult = convertFigmaNode(simpleTextFixture as any)
    expect(result.element.blocks?.[0]?.level).toBe(2)
  })

  it('converts auto-layout card with nested frames', () => {
    const result: ConversionResult = convertFigmaNode(cardFixture as any)
    expect(result.element.type).toBe('container')
    expect(result.element.blocks).toHaveLength(2) // image + content frame
    expect(result.warnings).toHaveLength(0)
  })

  it('applies inline style for absolute bounding box', () => {
    const result: ConversionResult = convertFigmaNode(cardFixture as any)
    const imageBlock = result.element.blocks?.[0]
    expect(imageBlock?.style).toContain('width:')
    expect(imageBlock?.style).toContain('height:')
  })

  it('extracts shadow effect from card', () => {
    const result: ConversionResult = convertFigmaNode(cardFixture as any)
    const rootCss = result.element.css?.css || ''
    expect(rootCss).toContain('shadow-')
  })

  it('assigns name as label', () => {
    const result: ConversionResult = convertFigmaNode(cardFixture as any)
    expect(result.name).toBe('Product Card')
    expect(result.element.label).toBe('Product Card')
  })

  it('sets flex layout for vertical auto-layout frames', () => {
    const result: ConversionResult = convertFigmaNode(simpleTextFixture as any)
    expect(result.element.css?.css).toContain('flex')
    expect(result.element.css?.css).toContain('flex-col')
  })

  it('keeps gap-4 container css on root', () => {
    const result: ConversionResult = convertFigmaNode(simpleTextFixture as any)
    expect(result.element.css?.container).toBe('gap-4')
  })

  it('returns empty root on null node', () => {
    const result: ConversionResult = convertFigmaNode({ type: 'DOCUMENT', id: '0', name: 'Empty', visible: true, locked: false, rotation: 0, children: [] } as any)
    expect(result.element.type).toBe('container')
    expect(result.element.tag).toBe('document')
  })
})
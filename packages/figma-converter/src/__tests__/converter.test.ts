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
    // Root frame is an auto-layout (flex) frame and this text node doesn't
    // opt out via layoutPositioning: 'ABSOLUTE', so it must flow with the
    // flex layout rather than being pulled out with position: absolute.
    expect(String(textEl?.style)).not.toContain('position: absolute')
    expect(String(textEl?.style)).toContain('width:')
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

  it('absolutely positions children of a non-auto-layout (layoutMode NONE) frame', () => {
    const fixture = {
      id: '3:1', name: 'Freeform', type: 'FRAME', visible: true, locked: false, rotation: 0,
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 200 },
      layoutMode: 'NONE',
      children: [
        {
          id: '3:2', name: 'Label', type: 'TEXT', visible: true, locked: false, rotation: 0,
          absoluteBoundingBox: { x: 40, y: 60, width: 100, height: 20 },
          characters: 'Free', style: { fontSize: 14 },
        },
      ],
    }
    const result: ConversionResult = convertFigmaNode(fixture as any)
    const textEl = result.element.blocks?.[0]
    expect(String(textEl?.style)).toContain('position: absolute')
  })

  it('absolutely positions a child that opts out of its parent auto-layout via layoutPositioning ABSOLUTE', () => {
    const fixture = {
      id: '4:1', name: 'Auto Layout Parent', type: 'FRAME', visible: true, locked: false, rotation: 0,
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 200 },
      layoutMode: 'VERTICAL',
      children: [
        {
          id: '4:2', name: 'Badge', type: 'TEXT', visible: true, locked: false, rotation: 0,
          absoluteBoundingBox: { x: 350, y: 10, width: 40, height: 20 },
          layoutPositioning: 'ABSOLUTE',
          characters: 'New', style: { fontSize: 12 },
        },
      ],
    }
    const result: ConversionResult = convertFigmaNode(fixture as any)
    const textEl = result.element.blocks?.[0]
    expect(String(textEl?.style)).toContain('position: absolute')
  })

  it('anchors a GROUP wrapper so its absolutely-positioned children do not escape to a distant ancestor', () => {
    // Reproduces the real-world pattern found importing a Figma community
    // file: an icon built from several overlapping vector paths, wrapped
    // in a GROUP, sitting inside an auto-layout (flex) section. Before the
    // fix, the GROUP's wrapper <div> got no `position` at all, so its
    // children's `position: absolute; left; top` (computed relative to
    // the group's own bounds) positioned relative to whatever *ancestor*
    // happened to be positioned instead - scattering the icon.
    const fixture = {
      id: '5:1', name: 'Services Section', type: 'FRAME', visible: true, locked: false, rotation: 0,
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
      layoutMode: 'VERTICAL',
      children: [
        {
          id: '5:2', name: 'Icon', type: 'GROUP', visible: true, locked: false, rotation: 0,
          absoluteBoundingBox: { x: 20, y: 20, width: 48, height: 48 },
          children: [
            {
              id: '5:3', name: 'Vector', type: 'VECTOR', visible: true, locked: false, rotation: 0,
              absoluteBoundingBox: { x: 20, y: 20, width: 30, height: 30 },
            },
            {
              id: '5:4', name: 'Vector', type: 'VECTOR', visible: true, locked: false, rotation: 0,
              absoluteBoundingBox: { x: 38, y: 38, width: 30, height: 30 },
            },
          ],
        },
      ],
    }
    const result: ConversionResult = convertFigmaNode(fixture as any)
    const group = result.element.blocks?.[0]
    // GROUP is not marked layoutPositioning: 'ABSOLUTE', so it flows
    // normally within the parent's auto-layout - but still needs to be a
    // positioning context for its own children.
    expect(String(group?.style)).toContain('position: relative')
    expect(String(group?.style)).not.toContain('position: absolute')
    for (const child of group?.blocks ?? []) {
      expect(String(child.style)).toContain('position: absolute')
    }
  })

  it('absolutely positions a GROUP itself when it opts out via layoutPositioning ABSOLUTE', () => {
    const fixture = {
      id: '6:1', name: 'Auto Layout Parent', type: 'FRAME', visible: true, locked: false, rotation: 0,
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 200 },
      layoutMode: 'VERTICAL',
      children: [
        {
          id: '6:2', name: 'Overlay Icon', type: 'GROUP', visible: true, locked: false, rotation: 0,
          absoluteBoundingBox: { x: 350, y: 10, width: 24, height: 24 },
          layoutPositioning: 'ABSOLUTE',
          children: [
            { id: '6:3', name: 'Vector', type: 'VECTOR', visible: true, locked: false, rotation: 0, absoluteBoundingBox: { x: 350, y: 10, width: 24, height: 24 } },
            { id: '6:4', name: 'Vector', type: 'VECTOR', visible: true, locked: false, rotation: 0, absoluteBoundingBox: { x: 355, y: 15, width: 14, height: 14 } },
          ],
        },
      ],
    }
    const result: ConversionResult = convertFigmaNode(fixture as any)
    const group = result.element.blocks?.[0]
    expect(String(group?.style)).toContain('position: absolute')
    expect(String(group?.style)).toContain('left: 350px')
    expect(String(group?.style)).toContain('top: 10px')
  })

  it('returns empty root on null node', () => {
    const result: ConversionResult = convertFigmaNode({ type: 'DOCUMENT', id: '0', name: 'Empty', visible: true, locked: false, rotation: 0, children: [] } as any)
    expect(result.element.type).toBe('container')
    expect(result.element.tag).toBe('document')
  })
})
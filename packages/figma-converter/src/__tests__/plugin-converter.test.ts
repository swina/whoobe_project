import { describe, it, expect } from 'vitest'
import { convertPluginJson, isPluginFormat } from '../plugin-converter.js'

const fixture = [
  {
    name: 'Test Frame',
    type: 'COMPONENT',
    x: 0, y: 0,
    width: 400, height: 300,
    children: [
      {
        name: 'Heading',
        type: 'TEXT',
        x: 20, y: 20,
        width: 360, height: 36,
        characters: 'Welcome',
        fontSize: 28,
        fontName: { family: 'Inter', style: 'Bold' },
        textAlignHorizontal: 'LEFT',
        fills: [{ type: 'SOLID', hex: '#1a1a1a' }],
      },
      {
        name: 'Card',
        type: 'RECTANGLE',
        x: 20, y: 72,
        width: 360, height: 200,
        cornerRadius: 12,
        fills: [{ type: 'SOLID', hex: '#ffffff' }],
        strokes: [{ type: 'SOLID', hex: '#e5e5e5' }],
      },
    ],
  },
]

describe('isPluginFormat', () => {
  it('detects plugin format', () => {
    expect(isPluginFormat(fixture)).toBe(true)
  })

  it('rejects empty array', () => {
    expect(isPluginFormat([])).toBe(false)
  })

  it('rejects null', () => {
    expect(isPluginFormat(null)).toBe(false)
  })

  it('rejects plain object', () => {
    expect(isPluginFormat({})).toBe(false)
  })
})

describe('convertPluginJson', () => {
  it('converts a COMPONENT with text and rectangle', () => {
    const result = convertPluginJson(fixture)
    expect(result.element.type).toBe('container')
    expect(result.element.blocks).toHaveLength(2)
    expect(result.warnings).toHaveLength(0)
    expect(result.name).toBe('Test Frame')
  })

  it('produces text element with correct content', () => {
    const result = convertPluginJson(fixture)
    const text = result.element.blocks?.[0] as any
    expect(text.content).toBe('Welcome')
    expect(text.element).toBe('h1')
    expect(text.editable).toBe(true)
  })

  it('applies defaults to all nodes', () => {
    const result = convertPluginJson(fixture)
    expect(result.element.css).toBeTruthy()
    expect(result.element.blocks?.[0]?.css).toBeTruthy()
    expect(result.element.blocks?.[1]?.css).toBeTruthy()
  })
})
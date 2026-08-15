import { describe, it, expect } from 'vitest'
import { whoobeElementSchema, validatePageContent, parsePageContent } from './validators.js'

// A realistic tree in the shape stored by whoobe-one-spike (taken from a
// real whoobe_pages.content row).
const realisticTree = {
  id: 'whoobe-a3jfk',
  css: { css: 'p-8', container: 'flex flex-col gap-4 min-h-[600px] bg-white' },
  tag: 'document',
  data: {},
  font: 'Roboto+Condensed',
  icon: 'dashboard',
  type: 'container',
  image: { url: null },
  style: '',
  blocks: [
    {
      id: 'whoobe-ujibg',
      css: { css: 'w-[620px]', container: '' },
      tag: 'element',
      content: 'Lorem <b>{form.firstname}</b>',
      element: 'p',
      editable: true,
      dataBinding: null,
      type: 'element',
    },
    {
      id: 'whoobe-pkoxl',
      css: { css: 'w-[300px] h-auto', container: '' },
      tag: 'element',
      image: { url: '/uploads/marketing/hero.jpg' },
      element: 'img',
      type: 'element',
    },
    {
      id: 'whoobe-czuzd',
      css: { css: '', container: '' },
      tag: 'element',
      content: '{form.message}',
      element: 'p',
      dataBinding: {
        className: 'Newsletter',
        target: 'text',
        resolveMode: 'first',
        field: 'message',
        transform: { type: 'truncate', options: { maxLength: 120, ellipsis: '…' } },
      },
      type: 'element',
    },
  ],
  helper: null,
  element: 'div',
}

describe('whoobeElementSchema', () => {
  it('validates a realistic tree and fills the blocks default', () => {
    const parsed = validatePageContent(realisticTree)
    expect(parsed.id).toBe('whoobe-a3jfk')
    expect(parsed.blocks).toHaveLength(3)
    expect(parsed.blocks![1].element).toBe('img')
    expect(parsed.blocks![2].dataBinding?.transform?.type).toBe('truncate')
  })

  it('preserves unknown editor fields via passthrough', () => {
    const withUnknown = { ...realisticTree, someNewEditorField: { nested: true } }
    const parsed = validatePageContent(withUnknown)
    expect((parsed as any).someNewEditorField).toEqual({ nested: true })
  })

  it('rejects a node without an id', () => {
    const bad = { ...realisticTree, id: undefined }
    expect(parsePageContent(bad)).toBeNull()
  })

  it('rejects a malformed nested node with a clear path', () => {
    const bad = structuredClone(realisticTree)
    ;(bad.blocks![0] as any).id = 123 // wrong type inside the first child
    try {
      validatePageContent(bad)
      expect.unreachable('should have thrown')
    } catch (e: any) {
      const path = e.issues?.[0]?.path?.join('.') ?? ''
      expect(path).toMatch(/blocks\.0\.id/)
    }
  })

  it('rejects an invalid transform type', () => {
    const bad = structuredClone(realisticTree)
    ;(bad.blocks![2].dataBinding as any).transform = { type: 'bogus' }
    expect(parsePageContent(bad)).toBeNull()
  })

  it('accepts a leaf with just the invariants', () => {
    const leaf = { id: 'x1', type: 'element', tag: 'element', element: 'p', content: 'hi' }
    expect(validatePageContent(leaf).blocks).toEqual([])
  })

  it('normalizes a missing blocks to [] on the root', () => {
    const { blocks: _omit, ...noBlocks } = realisticTree
    const parsed = whoobeElementSchema.parse(noBlocks)
    expect(parsed.blocks).toEqual([])
  })
})

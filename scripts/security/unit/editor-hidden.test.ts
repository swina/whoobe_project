// Which classes keep an element out of the published view but must not do so on the editor canvas (a hidden element
// could never be selected again): the utility counts, not the variant in front of it.
import { describe, it, expect } from 'vitest'
import { stripEditorHidden, utilityOf, isEditorHiddenClass } from '../../../apps/whoobe-one-spike/src/editor-hidden'

describe('utilityOf', () => {
  it('takes what follows the last variant', () => {
    expect(utilityOf('hidden')).toBe('hidden')
    expect(utilityOf('lg:hidden')).toBe('hidden')
    expect(utilityOf('sm:max-md:hidden')).toBe('hidden')
    expect(utilityOf('dark:group-hover:invisible')).toBe('invisible')
  })
  it('ignores the important marker, in front (v3) or behind (v4)', () => {
    expect(utilityOf('!hidden')).toBe('hidden')
    expect(utilityOf('lg:!hidden')).toBe('hidden')
    expect(utilityOf('lg:hidden!')).toBe('hidden')
  })
  it('does not split inside an arbitrary variant', () => {
    expect(utilityOf('[&:hover]:hidden')).toBe('hidden')
    expect(utilityOf('has-[:checked]:sr-only')).toBe('sr-only')
    expect(utilityOf('[&:not(:first-child)]:flex')).toBe('flex')
  })
})

describe('stripEditorHidden', () => {
  it('removes hidden, invisible and sr-only in every variant and reports what it removed', () => {
    const r = stripEditorHidden('flex lg:hidden p-2 md:invisible max-sm:sr-only hidden')
    expect(r.cleaned).toBe('flex p-2')
    expect(r.hasHidden).toBe(true)
    expect(r.hidden).toEqual(['lg:hidden', 'md:invisible', 'max-sm:sr-only', 'hidden'])
  })
  it('keeps what only looks similar', () => {
    const cls = 'overflow-hidden lg:overflow-hidden hidden-scroll text-hidden md:block block hover:bg-hidden-x'
    const r = stripEditorHidden(cls)
    expect(r.cleaned).toBe(cls)
    expect(r.hasHidden).toBe(false)
    expect(isEditorHiddenClass('overflow-hidden')).toBe(false)
  })
  it('copes with empty input and extra white space', () => {
    expect(stripEditorHidden('')).toEqual({ cleaned: '', hasHidden: false, hidden: [] })
    expect(stripEditorHidden('  a   lg:hidden  b ').cleaned).toBe('a b')
  })
})

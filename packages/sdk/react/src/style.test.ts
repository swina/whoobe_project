import { describe, it, expect } from 'vitest'
import { baseProps } from './style.js'
import type { RenderDescriptor } from '@whoobe-cms/renderer'

const d = (attributes: Record<string, unknown>, extra: Partial<RenderDescriptor> = {}) => ({ attributes, className: '', style: '', ...extra }) as unknown as RenderDescriptor

describe('baseProps', () => {
  it('spells HTML attributes the way React wants them', () => {
    expect(baseProps(d({ for: 'a', playsinline: '', tabindex: '0', colspan: '2', 'x-data': '{}', 'x-on:click': 'go()', 'data-x': '1' }))).toEqual({
      htmlFor: 'a', playsInline: true, tabIndex: '0', colSpan: '2', 'x-data': '{}', 'x-on:click': 'go()', 'data-x': '1',
    })
  })
  it('boolean attributes: empty or named is true, "false" is false', () => {
    const p = baseProps(d({ disabled: '', required: 'required', hidden: 'false' }))
    expect(p).toMatchObject({ disabled: true, required: true, hidden: false })
  })
  it('merges a class attribute and a style string with the descriptor ones', () => {
    const p = baseProps(d({ class: 'a', style: 'color:red' }, { className: 'b', style: 'margin-top: 1px' }))
    expect(p.className).toBe('a b')
    expect(p.style).toEqual({ color: 'red', marginTop: '1px' })
  })
})

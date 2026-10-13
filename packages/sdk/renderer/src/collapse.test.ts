import { describe, it, expect } from 'vitest'
import { alpineCollapse } from './collapse.js'

function setup() {
  const registered: Record<string, any> = {}
  alpineCollapse({ directive: (name: string, fn: any) => { registered[name] = fn } })
  return registered.collapse
}
const fakeEl = (shown?: boolean) => ({ _x_isShown: shown, style: {} as Record<string, string>, hidden: false, getBoundingClientRect: () => ({ height: 0 }) }) as any

describe('alpineCollapse', () => {
  it('registers the collapse directive', () => {
    expect(typeof setup()).toBe('function')
  })
  it('starts closed: height 0, hidden, overflow hidden, and supplies the transition object x-show uses', () => {
    const el = fakeEl()
    setup()(el, { modifiers: [] })
    expect(el.style.height).toBe('0px')
    expect(el.hidden).toBe(true)
    expect(el.style.overflow).toBe('hidden')
    expect(typeof el._x_transition.in).toBe('function')
    expect(typeof el._x_transition.out).toBe('function')
  })
  it('.min keeps the element visible at the minimum height', () => {
    const el = fakeEl()
    setup()(el, { modifiers: ['min', '40px'] })
    expect(el.style.height).toBe('40px')
    expect(el.hidden).toBe(false)
  })
  it('an element that starts open is left alone', () => {
    const el = fakeEl(true)
    setup()(el, { modifiers: ['duration', '500ms'] })
    expect(el.style.height).toBeUndefined()
    expect(el.hidden).toBe(false)
  })
  it('.min makes x-show leave display alone (inline)', () => {
    const el: any = fakeEl()
    setup().inline(el, { modifiers: ['min', '10px'] })
    expect(typeof el._x_doShow).toBe('function')
    const plain: any = fakeEl()
    setup().inline(plain, { modifiers: [] })
    expect(plain._x_doShow).toBeUndefined()
  })
  it('without Web Animations it still ends in the right state (no animation to wait for)', () => {
    const el = fakeEl()
    setup()(el, { modifiers: [] })
    el._x_transition.in()
    expect(el._x_isShown).toBe(true)
    expect(el.hidden).toBe(false)
    el._x_transition.out()
    expect(el._x_isShown).toBe(false)
    expect(el.hidden).toBe(true)
    expect(el.style.display).toBe('none')
  })
})

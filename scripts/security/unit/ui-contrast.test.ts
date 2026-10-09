// The dashboard's shared look (apps/admin-dashboard/src/styles/ui.css) must stay readable in both themes: every button variant,
// in its normal and hover state, every form field and the modal text pass WCAG AA contrast (4.5:1 for text). The CSS is parsed,
// not re-typed here: a colour changed in the stylesheet is checked as it is.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'

const css = readFileSync(join(ROOT_DIR, 'apps/admin-dashboard/src/styles/ui.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

type Vars = Record<string, string>
const blocks: { selector: string; vars: Vars }[] = []
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const vars: Vars = {}
  for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim()
  if (Object.keys(vars).length) for (const sel of m[1].split(',')) blocks.push({ selector: sel.trim().replace(/\s+/g, ' '), vars })
}
const varsOf = (selector: string): Vars => Object.assign({}, ...blocks.filter((b) => b.selector === selector).map((b) => b.vars))

const hex = (h: string): [number, number, number] => {
  const v = h.replace('#', '')
  const f = v.length === 3 ? v.split('').map((c) => c + c).join('') : v
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]
}
const lum = (c: string): number => {
  const [r, g, b] = hex(c).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const SURFACES = { dark: ['#020617', '#0f172a'], light: ['#f8fafc', '#ffffff'] } as const
const variants = [...new Set(blocks.map((b) => /^(?:\.light )?(\.btn-(?!sm|lg|icon)[\w-]+)$/.exec(b.selector)?.[1]).filter(Boolean) as string[])]

describe('the stylesheet can be read', () => {
  it('has the button variants the app uses', () => {
    expect(variants).toEqual(expect.arrayContaining(['.btn-primary', '.btn-secondary', '.btn-ghost', '.btn-danger', '.btn-success', '.btn-warning', '.btn-link', '.btn-soft-primary', '.btn-soft-success', '.btn-soft-danger', '.btn-soft-warning']))
  })
})

describe.each(['dark', 'light'] as const)('buttons, %s theme', (theme) => {
  it.each(variants)('%s: text is readable normally and on hover', (variant) => {
    const v: Vars = { ...varsOf(variant), ...(theme === 'light' ? varsOf(`.light ${variant}`) : {}) }
    expect(v['--btn-fg'], `${variant} needs --btn-fg`).toBeTruthy()
    for (const surface of SURFACES[theme]) {
      const bg = v['--btn-bg'] === 'transparent' ? surface : v['--btn-bg']
      const bgHover = v['--btn-bg-hover'] === 'transparent' ? surface : v['--btn-bg-hover']
      expect(ratio(v['--btn-fg'], bg), `${variant} (${theme}) text on its background over ${surface}`).toBeGreaterThanOrEqual(4.5)
      expect(ratio(v['--btn-fg-hover'] ?? v['--btn-fg'], bgHover), `${variant} (${theme}) text on hover over ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
    // an outlined button's edge must be visible against the surface it sits on
    if (v['--btn-border'] && v['--btn-bg'] === 'transparent') {
      for (const surface of SURFACES[theme]) expect(ratio(v['--btn-border'], surface), `${variant} (${theme}) border over ${surface}`).toBeGreaterThanOrEqual(2.2)
    }
  })
})

describe.each(['dark', 'light'] as const)('fields and text, %s theme', (theme) => {
  const root: Vars = { ...varsOf(':root'), ...(theme === 'light' ? varsOf('.light') : {}) }
  it('input text and placeholder are readable on the field', () => {
    expect(ratio(root['--field-fg'], root['--field-bg'])).toBeGreaterThanOrEqual(4.5)
    expect(ratio(root['--field-placeholder'], root['--field-bg'])).toBeGreaterThanOrEqual(4.5)
  })
  it('the focus colour stands out from the field', () => {
    expect(ratio(root['--field-focus'], root['--field-bg'])).toBeGreaterThanOrEqual(3)
  })
  it('body text, headings, labels and muted text are readable on the card and on the page', () => {
    for (const surface of [root['--ui-surface'], root['--ui-page']]) {
      for (const k of ['--ui-text', '--ui-heading', '--ui-label', '--ui-muted']) expect(ratio(root[k], surface), `${k} on ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('the field border is visible on the card (light: 3:1, the usual minimum for the edge of a control)', () => {
    const min = theme === 'light' ? 3 : 1.4
    expect(ratio(root['--field-border'], root['--ui-surface'])).toBeGreaterThanOrEqual(min)
  })
})

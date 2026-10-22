// Custom fonts (docs/plans/system/release-0.3-plan.md, A7): what a person may register and the CSS written for it.
import { describe, it, expect } from 'vitest'
import { readCustomFontBody, fontFaceCss } from '../../../packages/core/src/fonts/custom-fonts'

describe('readCustomFontBody', () => {
  it('takes a family, a weight, a style and the asset; weight and style default', () => {
    expect(readCustomFontBody({ family: '  Acme   Sans ', assetPath: '/public/fonts/acme.woff2' })).toEqual({ ok: true, font: { family: 'Acme Sans', weight: 400, style: 'normal', assetPath: '/public/fonts/acme.woff2' } })
    const r = readCustomFontBody({ family: 'Acme', weight: 700, style: 'italic', assetPath: 'a.woff2' })
    expect(r.ok && r.font).toMatchObject({ weight: 700, style: 'italic' })
  })
  it('refuses a family that could leave a CSS string or a rule', () => {
    for (const family of ['', 'a"b', 'a\\b', 'a;b', 'a}b{', 'a<b', '-lead', 'x'.repeat(65), 5 as unknown as string]) {
      expect(readCustomFontBody({ family, assetPath: 'a.woff2' }).ok, String(family)).toBe(false)
    }
  })
  it('refuses a weight that is not 100..900 in hundreds, a style that is not normal or italic, a missing asset', () => {
    expect(readCustomFontBody({ family: 'A', weight: 450, assetPath: 'a' }).ok).toBe(false)
    expect(readCustomFontBody({ family: 'A', weight: '400', assetPath: 'a' }).ok).toBe(false)
    expect(readCustomFontBody({ family: 'A', style: 'oblique', assetPath: 'a' }).ok).toBe(false)
    expect(readCustomFontBody({ family: 'A' }).ok).toBe(false)
    expect(readCustomFontBody(null).ok).toBe(false)
  })
})

describe('fontFaceCss', () => {
  it('writes one @font-face per face with swap', () => {
    const css = fontFaceCss([{ family: 'Acme', weight: 400, style: 'normal', url: '/dam-asset/x.woff2' }, { family: 'Acme', weight: 700, style: 'italic', url: 'https://h/y.woff2' }])
    expect(css.split('\n')).toHaveLength(2)
    expect(css).toContain('font-family:"Acme";font-weight:400;font-style:normal;font-display:swap;src:url("/dam-asset/x.woff2") format("woff2")')
    expect(css).toContain('font-weight:700;font-style:italic')
  })
  it('cannot be broken out of by a quote in the family or the url', () => {
    const css = fontFaceCss([{ family: 'A"};body{x:y', weight: 400, style: 'normal', url: 'u")};a{b:c' }])
    expect(css).not.toContain('"};body')
    expect(css.match(/"/g)!.length % 2).toBe(0)
  })
})

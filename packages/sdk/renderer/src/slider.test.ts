import { describe, it, expect } from 'vitest'
import { sliderView } from './slider.js'

const slides = (labels: Array<string | null>) => labels.map((l) => ({ node: { tabLabel: l } }) as never)

describe('sliderView', () => {
  it('tabs mode: labelled tabs, no arrows, no home (the editor shows only the tabs)', () => {
    const v = sliderView({ slider: { mode: 'tabs', showNav: true, showHome: true, showDots: false, tabsPosition: 'above', tabContainerClass: '', navClass: 'row' } as never }, slides(['One', null, '  ']))
    expect(v.tabs).toBe('above')
    expect(v.labels).toEqual(['One', 'Slide 2', 'Slide 3'])
    expect(v.arrows).toBe(false)
    expect(v.home).toBe(false)
    expect(v.dots).toBe(false)
    expect(v.tabsClass).toBe('row')
  })
  it('standard mode: arrows and home follow the settings; dots default on', () => {
    expect(sliderView({ slider: null }, slides([null, null]))).toMatchObject({ tabs: null, arrows: true, home: true, dots: true })
    expect(sliderView({ slider: { showNav: false, showHome: false } as never }, slides([null, null]))).toMatchObject({ arrows: false, home: false })
  })
  it('a single slide has no navigation at all', () => {
    expect(sliderView({ slider: { mode: 'tabs' } as never }, slides([null]))).toMatchObject({ tabs: null, arrows: false, dots: false })
  })
  it('null settings fall back to the defaults; arrow icon picks the glyphs', () => {
    const v = sliderView({ slider: { showDots: null, arrowIcon: 'arrow' } as never }, slides([null, null]))
    expect(v.dots).toBe(true)
    expect(v.glyphs.prev).toBe('←')
  })
})

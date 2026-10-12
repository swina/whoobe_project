// What a slider shows, decided once for every adapter (mirrors the editor's preview, apps/whoobe-one-spike BlockSliderPreview.vue):
// the settings with the editor's defaults, the tab labels, and which of tabs / arrows / home / dots appear.
import type { RenderDescriptor } from './descriptor.js'

export const SLIDER_DEFAULTS = {
  autoplay: false,
  interval: 5000,
  loop: true,
  showNav: true,
  showHome: true,
  showDots: true,
  mode: 'standard' as 'standard' | 'tabs',
  tabsPosition: 'below' as 'above' | 'below',
  navClass: 'flex items-center justify-center gap-1.5 flex-wrap px-2 py-2',
  arrowClass: 'w-8 h-8 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white',
  homeClass: 'w-7 h-7 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white',
  tabClass: 'px-2.5 py-1 rounded-full text-xs font-medium truncate max-w-[9rem] transition-colors border bg-white text-gray-600 border-gray-300 hover:border-indigo-400',
  activeTabClass: 'px-2.5 py-1 rounded-full text-xs font-medium truncate max-w-[9rem] transition-colors border bg-indigo-600 text-white border-indigo-600',
  dotClass: 'w-2.5 h-2.5 rounded-full bg-gray-300 hover:bg-gray-400 transition-colors',
  activeDotClass: 'w-2.5 h-2.5 rounded-full bg-indigo-600 transition-colors',
  dotContainerClass: 'flex items-center justify-center gap-2 pt-3',
  tabContainerClass: '',
  arrowIcon: 'chevron',
  homeIcon: 'home',
}

export type SliderSettings = typeof SLIDER_DEFAULTS

export interface SliderView {
  settings: SliderSettings
  total: number
  /** One label per slide: its `tabLabel`, else "Slide N". */
  labels: string[]
  /** Where the tab row goes, or null (not in tabs mode, or a single slide). */
  tabs: 'above' | 'below' | null
  /** Class list of the tab row: `tabContainerClass`, else `navClass` (as the editor does). */
  tabsClass: string
  arrows: boolean
  home: boolean
  dots: boolean
  glyphs: { prev: string; next: string; home: string }
}

const ARROWS: Record<string, [string, string]> = { chevron: ['‹', '›'], arrow: ['←', '→'], triangle: ['◀', '▶'] }
const HOMES: Record<string, string> = { home: '⌂', dot: '•', circle: '○' }

/** The settings of a slider node merged over the defaults (a missing or null value falls back, `showDots` included). */
export function sliderSettings(slider: unknown): SliderSettings {
  const given = (slider && typeof slider === 'object' ? slider : {}) as Record<string, unknown>
  const out: Record<string, unknown> = { ...SLIDER_DEFAULTS }
  for (const [k, v] of Object.entries(given)) if (v !== null && v !== undefined && k in SLIDER_DEFAULTS) out[k] = v
  return out as SliderSettings
}

export function sliderView(descriptor: Pick<RenderDescriptor, 'slider'>, slides: Pick<RenderDescriptor, 'node'>[]): SliderView {
  const settings = sliderSettings(descriptor.slider)
  const total = slides.length
  const tabsMode = settings.mode === 'tabs'
  const many = total > 1
  const [prev, next] = ARROWS[settings.arrowIcon] ?? ARROWS.chevron
  return {
    settings,
    total,
    labels: slides.map((s, i) => {
      const label = (s.node as { tabLabel?: string | null } | undefined)?.tabLabel
      return label && label.trim() ? label : `Slide ${i + 1}`
    }),
    tabs: tabsMode && many ? (settings.tabsPosition === 'above' ? 'above' : 'below') : null,
    tabsClass: settings.tabContainerClass || settings.navClass,
    arrows: !tabsMode && settings.showNav && many,
    home: !tabsMode && settings.showHome && many,
    dots: settings.showDots && many,
    glyphs: { prev, next, home: HOMES[settings.homeIcon] ?? HOMES.home },
  }
}

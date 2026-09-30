<template>
  <component :is="semantic" :id="doc.id" ref="rootEl" :class="classe" :style="stile" v-bind="extraAttrs">
    <!-- 'tabs' + 'above': the named row sits in normal document flow
         before the slide viewport, not overlaid on top of it (see
         SliderTabsNav.vue's own comment on why tabs can't just be an
         absolute overlay the way arrows/home are). -->
    <SliderTabsNav
      v-if="settings.mode === 'tabs' && settings.tabsPosition === 'above' && doc.blocks.length > 1"
      :slides="doc.blocks"
      :current="current"
      :nav-class="settings.navClass"
      :tab-class="settings.tabClass"
      :active-tab-class="settings.activeTabClass"
      :tab-container-class="settings.tabContainerClass"
      @select="selectTab"
    />

    <div class="relative">
      <div class="overflow-hidden">
        <div class="flex transition-transform duration-500 ease-out" :style="{ transform: `translateX(-${current * 100}%)` }">
          <div v-for="slide in doc.blocks" :key="slide.id" class="w-full shrink-0">
            <a v-if="(slide as any).link" :href="(slide as any).link" :target="(slide as any).linkTarget || undefined">
              <component :is="childComponent(slide)" v-bind="childProps(slide)" />
            </a>
            <component v-else :is="childComponent(slide)" v-bind="childProps(slide)" />
          </div>
        </div>
      </div>

      <!-- 'standard' mode only - arrows/home stay an absolute overlay on
           the slide viewport itself, the original design (a full tab row
           would obscure too much sitting on top of content the same way;
           these are small enough at the very edges/bottom not to). -->
      <template v-if="settings.mode !== 'tabs'">
        <template v-if="settings.showNav && doc.blocks.length > 1">
          <button
            type="button"
            aria-label="Previous slide"
            class="absolute left-2 top-1/2 -translate-y-1/2"
            :class="settings.arrowClass"
            @click="onNavClick(prev)"
          >
            <SliderNavIcon :name="arrowIconName('left')" class="w-full h-full" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            class="absolute right-2 top-1/2 -translate-y-1/2"
            :class="settings.arrowClass"
            @click="onNavClick(next)"
          >
            <SliderNavIcon :name="arrowIconName('right')" class="w-full h-full" />
          </button>
        </template>
        <button
          v-if="settings.showHome && doc.blocks.length > 1"
          type="button"
          aria-label="First slide"
          class="absolute bottom-2 left-1/2 -translate-x-1/2"
          :class="settings.homeClass"
          @click="onNavClick(goHome)"
        >
          <SliderNavIcon :name="settings.homeIcon || 'home'" class="w-full h-full" />
        </button>
      </template>

      <!-- Dot navigation: small clickable dots under the slide viewport,
           one per slide, highlighting the current one — the standard
           "dots" slider indicator. Uses `dotClass` for inactive dots,
           `activeDotClass` for the current slide's dot, and `dotContainerClass`
           for the wrapper row; all three are free-text Tailwind class lists
           (the wrapper defaults to a centered row). Clicking a dot jumps to
           that slide. Shown regardless of mode ('standard' or 'tabs') when
           `showDots` is on and there's more than one slide. -->
      <div
        v-if="settings.showDots && doc.blocks.length > 1"
        :class="settings.dotContainerClass || 'flex items-center justify-center gap-2 pt-3'"
      >
        <button
          v-for="(slide, idx) in doc.blocks"
          :key="slide.id"
          type="button"
          :aria-label="`Go to slide ${idx + 1}`"
          :class="idx === current ? settings.activeDotClass : settings.dotClass"
          @click="onNavClick(() => onDotClick(idx))"
        ></button>
      </div>
    </div>

    <SliderTabsNav
      v-if="settings.mode === 'tabs' && settings.tabsPosition !== 'above' && doc.blocks.length > 1"
      :slides="doc.blocks"
      :current="current"
      :nav-class="settings.navClass"
      :tab-class="settings.tabClass"
      :active-tab-class="settings.activeTabClass"
      :tab-container-class="settings.tabContainerClass"
      @select="selectTab"
    />
  </component>
</template>

<script setup lang="ts">
// Not a port - a full, deliberate redesign of the slider element (see
// ElementsClass.js's Slider() builder comment for why the source's own
// version never actually worked in this port at all). A slider's slides
// are just its `.blocks`, exactly like any other container - built from
// saved snippets or palette elements dragged in on the editing canvas
// (BlockContainer.vue's own dispatch already handles it as a plain
// container there, showing every slide stacked and selectable at once;
// this component is what actually turns them into a real one-at-a-time,
// cycling carousel, and only matters at preview time - the same "real
// behavior lives in preview, not simulated on the editing canvas" split
// this app already uses for GSAP animations and video playback).
//
// Settings (autoplay/interval/loop/showNav/showHome/mode/tabsPosition/
// navClass/arrowClass/homeClass/tabClass/activeTabClass/arrowIcon/
// homeIcon) come from `doc.slider`, set via FloatingToolbar.vue's slider
// settings popover - defaulted here too (mirroring ElementsClass.js's own
// Slider() defaults), so a Slider node saved before some setting existed
// (or one missing `slider` entirely, in principle) still renders sensibly
// instead of crashing on a missing property.
//
// `mode: 'tabs'` (alongside the original 'standard') swaps the arrows+home
// nav for a row of buttons named from each slide's own `tabLabel` (falling
// back to "Slide N" for any slide that hasn't been renamed - see
// BlockSlider.vue's `renameTab()`, the editing-time UI for setting it),
// rendered by the extracted SliderTabsNav.vue rather than inlined here
// twice - `tabsPosition` ('above'/'below') places that same component
// either before or after the slide viewport in normal document flow, not
// as an overlay (see SliderTabsNav.vue's own comment on why). `showNav`/
// `showHome` only apply to 'standard' - the tabs themselves are the only
// nav 'tabs' mode ever shows, so there's nothing for those two flags to
// toggle in that mode. Autoplay/loop still apply to either mode
// identically - a tabs slider can still auto-advance, its tabs just
// highlight whichever slide autoplay lands on.
//
// `navClass`/`arrowClass`/`homeClass`/`tabClass`/`activeTabClass` are
// free-text Tailwind classes for restyling the nav to match a real design -
// each is applied as the ONLY class list for that part (plus a small,
// disjoint set of positioning classes below that never change - `absolute`/
// `top`/`left`/`right`/`bottom`/`-translate-*`, none of which share a CSS
// property with anything a custom class would set, so there's nothing for
// them to conflict with). This is NOT the "hardcoded defaults + appended
// custom classes" shape it started as - see ElementsClass.js's Slider()
// comment for the real bug that caused (some custom overrides silently
// winning, others silently losing, depending on Tailwind's own internal
// same-property utility ordering, not on anything the user did wrong).
// `arrowIcon`/`homeIcon` pick a real SVG shape (SliderNavIcon.vue, backed
// by @lucide/vue) for 'standard' mode's buttons, replacing the original
// fixed ‹ › ⌂ unicode glyphs (which were only ever restyleable by text-
// color/size, not shape).
//
// Child dispatch (childComponent()/childProps(), including the <a> link-
// wrapping) mirrors BlockContainerPreview.vue's own logic exactly, rather
// than importing/reusing it directly - the two need almost the same
// dispatch but wrap it completely differently (one slide visible at a
// time inside a sliding track vs. every child always visible), so sharing
// it would mean threading the sliding-vs-stacked difference through a
// shared helper for little real benefit at this size.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import type Element from '../../scripts/ElementsClass.js'
import { resolveDisplayUrl } from '../../resolve-display-url'
import { customAttrs, safeAlpineValue } from '../../helpers'
import { mountAnimation } from '../../scripts/gsap-actions'
import BlockElementPreview from './BlockElementPreview.vue'
import BlockIFramePreview from './BlockIFramePreview.vue'
import BlockContainerPreview from './BlockContainerPreview.vue'
import BlockIsometricPreview from './BlockIsometricPreview.vue'
import SliderNavIcon from './SliderNavIcon.vue'
import type { SliderNavIconName } from './SliderNavIcon.vue'
import SliderTabsNav from './SliderTabsNav.vue'
// Self-import (see BlockContainerPreview.vue's own comment on why this is
// safe) - covers the edge case of a slide that's itself another slider.
import BlockSliderPreview from './BlockSliderPreview.vue'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  doc: WhoobeElement
}>()

// Mirrors ElementsClass.js's Slider() builder defaults exactly - kept in
// sync by hand (no shared constant module exists between a plain .js
// builder and this .vue component), so a Slider node missing `slider`
// entirely (or missing just the newer fields) still renders with the same
// look a freshly-built one gets, not blank/unstyled buttons.
const DEFAULT_SLIDER_SETTINGS = {
  autoplay: false,
  interval: 5000,
  loop: true,
  showNav: true,
  showHome: true,
  showDots: true,
  mode: 'standard' as const,
  tabsPosition: 'below' as const,
  navClass: 'flex items-center justify-center gap-1.5 flex-wrap px-2 py-2',
  arrowClass: 'w-8 h-8 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white',
  homeClass: 'w-7 h-7 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white',
  tabClass:
    'px-2.5 py-1 rounded-full text-xs font-medium truncate max-w-[9rem] transition-colors border bg-white text-gray-600 border-gray-300 hover:border-indigo-400',
  activeTabClass:
    'px-2.5 py-1 rounded-full text-xs font-medium truncate max-w-[9rem] transition-colors border bg-indigo-600 text-white border-indigo-600',
  dotClass: 'w-2.5 h-2.5 rounded-full bg-gray-300 hover:bg-gray-400 transition-colors',
  activeDotClass: 'w-2.5 h-2.5 rounded-full bg-indigo-600 transition-colors',
  dotContainerClass: 'flex items-center justify-center gap-2 pt-3',
  arrowIcon: 'chevron' as const,
  homeIcon: 'home' as const,
}
const settings = computed(() => {
  const s = { ...DEFAULT_SLIDER_SETTINGS, ...(props.doc as any).slider }
  if (s.showDots == null) s.showDots = true
  return s
})

function arrowIconName(direction: 'left' | 'right'): SliderNavIconName {
  return `${settings.value.arrowIcon || 'chevron'}-${direction}` as SliderNavIconName
}

const current = ref(0)

// Clamp if the slide count shrinks out from under the current index
// (e.g. a slide was removed while this preview happened to already be
// open) - defensive, not expected to matter in normal use.
watch(
  () => props.doc.blocks.length,
  (length) => {
    if (current.value >= length) current.value = Math.max(0, length - 1)
  }
)

function childComponent(child: WhoobeElement): Component {
  const c = child as any
  if (c.tag === 'isometric') return BlockIsometricPreview as unknown as Component
  if (c.tag === 'slider') return BlockSliderPreview as unknown as Component
  if (c.type === 'container') return BlockContainerPreview as unknown as Component
  if (c.tag === 'youtube' || c.tag === 'vimeo') return BlockIFramePreview as unknown as Component
  return BlockElementPreview as unknown as Component
}

function childProps(child: WhoobeElement): Record<string, unknown> {
  const c = child as any
  if (c.tag === 'isometric' || c.tag === 'slider' || c.type === 'container') return { doc: child }
  return { element: child }
}

function next() {
  if (props.doc.blocks.length < 2) return
  if (current.value < props.doc.blocks.length - 1) current.value++
  else if (settings.value.loop) current.value = 0
}

function prev() {
  if (props.doc.blocks.length < 2) return
  if (current.value > 0) current.value--
  else if (settings.value.loop) current.value = props.doc.blocks.length - 1
}

function goHome() {
  current.value = 0
}

// Tabs-mode nav: clicking a tab jumps straight to it (unlike prev/next,
// there's no cycling logic to apply - the target slide is already known).
function selectTab(index: number) {
  onNavClick(() => {
    current.value = index
  })
}

// Dots-mode nav: same direct jump as tabs.
function onDotClick(index: number) {
  current.value = index
}

let timer: ReturnType<typeof window.setInterval> | null = null

function stopAutoplay() {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}

function startAutoplay() {
  stopAutoplay()
  if (settings.value.autoplay && props.doc.blocks.length > 1) {
    timer = window.setInterval(next, Math.max(500, settings.value.interval || 5000))
  }
}

// Manual navigation restarts the countdown - without this, clicking next/
// prev/home could be followed a moment later by an autoplay tick that
// feels like it's fighting the click instead of resuming a steady rhythm.
function onNavClick(action: () => void) {
  action()
  startAutoplay()
}

onMounted(startAutoplay)
onUnmounted(stopAutoplay)
watch(() => [settings.value.autoplay, settings.value.interval], startAutoplay)

// Deep-link support: a URL like `/features#slide2` (or `#slide-2`/`#slide_2`,
// 1-based) jumps this slider straight to that slide - mirrors
// packages/sdk/vue's DefaultSlider/packages/sdk/react's DefaultSlider (the
// renderer real published Nuxt/Next sites use), added here too since this
// component - not those SDK packages - is what actually renders a slider in
// this app's own "Preview" button and its internal `/:pathMatch(.*)*`
// public-page route (PublicPage.vue uses BlockContainerPreview.vue, which
// dispatches to this file for `tag: 'slider'`, entirely separately from the
// SDK packages). Re-applied on `hashchange` too, so an in-page link to
// `#slide3` clicked while already on this page also works, not just a fresh
// load. If a page has more than one slider, every one of them reacts to the
// same hash - there's no per-slider id in the hash to disambiguate.
function applyHashSlide() {
  const match = /^#?slide[-_]?(\d+)$/i.exec(window.location.hash)
  if (!match) return
  const total = props.doc.blocks.length
  if (total === 0) return
  const requested = parseInt(match[1], 10) - 1
  current.value = Math.max(0, Math.min(requested, total - 1))
}
onMounted(() => {
  applyHashSlide()
  window.addEventListener('hashchange', applyHashSlide)
})
onUnmounted(() => window.removeEventListener('hashchange', applyHashSlide))

const semantic = computed(() => (props.doc as any).semantic || 'div')

const classe = computed(() => {
  const doc = props.doc as any
  return `${doc.css?.css ?? ''} ${doc.css?.container ?? ''}`.trim()
})

const stile = computed(() => {
  const doc = props.doc as any
  let st = ''
  const bgUrl = resolveDisplayUrl(doc.image?.url)
  if (bgUrl) st += `background-image:url(${bgUrl});`
  if (doc.font) st += `font-family:"${doc.font.replaceAll('+', ' ')}";`
  return st + (doc.style ?? '')
})

// Custom attributes/AlpineJS directives/GSAP scroll-triggered animation on
// the slider's own root - same wiring as BlockContainerPreview.vue (a
// slider is a container, see ElementsClass.js's Slider() builder). Each
// individual slide gets its own copy of this same wiring recursively, via
// childComponent()'s dispatch to BlockElementPreview/BlockContainerPreview
// above - nothing extra needed here for the slides themselves.
const alpineAttrs = computed(() => {
  const alpine = (props.doc as any).alpine as Record<string, string> | undefined
  if (!alpine) return {}
  const result: Record<string, string> = {}
  for (const key of Object.keys(alpine)) {
    result[key] = alpine[key] ? safeAlpineValue(alpine[key]) : ''
  }
  return result
})

const extraAttrs = computed(() => ({
  ...customAttrs((props.doc as any).data?.attributes),
  ...alpineAttrs.value,
}))

// Template ref, not document.getElementById(doc.id) - see
// BlockElementPreview.vue's comment for the real bug that was (duplicate
// ids: the editing canvas keeps its own :id="doc.id" node mounted
// underneath DocumentPreview.vue's modal, and a data-bound repeater can
// render this same doc N times, each with the identical id).
const rootEl = ref<HTMLElement | null>(null)

let stopAnimation: (() => void) | null = null

onMounted(() => {
  if (rootEl.value) stopAnimation = mountAnimation(props.doc, rootEl.value)
})

onUnmounted(() => {
  stopAnimation?.()
})

watch(
  () => (props.doc as any).alpine,
  () => {
    nextTick(() => {
      if (rootEl.value && (window as any).Alpine) (window as any).Alpine.initTree(rootEl.value)
    })
  },
  { deep: true }
)
</script>

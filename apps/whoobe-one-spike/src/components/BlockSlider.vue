<template>
  <component
    :is="semantic"
    :id="doc.id"
    :class="[classe, 'dragula-container', groupClass]"
    :style="stile"
    data-type="container"
    :data-id="doc.id"
    @click.self="onSelect"
  >
    <button
      type="button"
      class="absolute -top-2.5 -left-2.5 z-50 px-1.5 py-0.5 rounded text-[10px] leading-none font-semibold text-white transition-opacity"
      :class="[tagOpacityClass, tagBgClass]"
      @click.stop="onSelect"
    >
      {{ doc.tag || 'container' }}
    </button>

    <!-- Only the active slide is actually rendered below - not a stacked
         pile of every slide at once, which used to make it easy to forget
         a slider is ever going to show one at a time for real (see
         preview/BlockSliderPreview.vue). This strip is how you switch
         which one that is, and how you add more.

         mb-4 (not the tighter mb-2 this used to be) is load-bearing, not
         cosmetic spacing: the active slide is itself a BlockContainer, and
         selecting it pops its own corner tag button up via `-top-2.5`
         (10px) *above* its own top edge (see BlockContainer.vue's own
         corner-tag comment) - relative to whatever sits immediately above
         it in normal flow, which is this strip. `mb-2` (8px) left only 8px
         of clearance for a tag that needs 10px, so selecting a slide made
         its corner tag overlap the last couple pixels of these nav
         buttons - "partially hidden", not a rendering bug, just not
         enough room. mb-4 (16px) clears it with margin to spare. -->
    <div class="flex flex-wrap items-center gap-1 mb-4" @click.stop>
      <span class="text-[10px] text-gray-400 mr-1">{{ mode === 'tabs' ? 'Tabs' : 'Slide' }}</span>
      <button
        v-for="(slide, index) in doc.blocks"
        :key="slide.id"
        type="button"
        :title="mode === 'tabs' ? 'Double-click to rename this tab' : `Go to slide ${index + 1}`"
        class="h-6 rounded text-[10px] font-semibold border"
        :class="[
          activeIndex === index
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white text-gray-500 border-gray-300 hover:border-indigo-400',
          mode === 'tabs' ? 'px-2 truncate max-w-[7rem]' : 'w-6 shrink-0',
        ]"
        @click="goToSlide(index)"
        @dblclick.stop="mode === 'tabs' && renameTab(slide)"
      >
        {{ mode === 'tabs' ? tabLabel(slide, index) : index + 1 }}
      </button>
      <button
        type="button"
        title="Add slide"
        class="w-6 h-6 shrink-0 flex items-center justify-center rounded border border-dashed border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-600"
        @click="addSlide"
      >
        <Plus class="w-3.5 h-3.5" />
      </button>
      <button
        v-if="activeSlide"
        type="button"
        title="Duplicate current slide"
        class="w-6 h-6 shrink-0 flex items-center justify-center rounded border border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-600"
        @click="duplicateSlide"
      >
        <Copy class="w-3.5 h-3.5" />
      </button>
    </div>

    <template v-if="activeSlide">
      <BlockSlider v-if="activeSlide.tag === 'slider'" :doc="activeSlide" :level="level + 1" />
      <BlockContainer v-else-if="(activeSlide as any).type === 'container'" :doc="activeSlide" :level="level + 1" />
      <BlockIFrame v-else-if="activeSlide.tag === 'youtube' || activeSlide.tag === 'vimeo'" :element="activeSlide" :level="level + 1" />
      <BlockElement v-else :element="activeSlide" :level="level + 1" />
    </template>
    <div v-else class="text-xs text-gray-400 italic py-6 text-center">No slides yet - click "+" to add one.</div>
  </component>
</template>

<script setup lang="ts">
// Not a port - editing-time counterpart to preview/BlockSliderPreview.vue,
// for a container whose `tag === 'slider'` (see ElementsClass.js's
// Slider() builder comment for the full redesign this belongs to).
//
// Shows one slide at a time (switched via the numbered strip above),
// matching what the slider actually looks like once it's really rendered
// (preview/BlockSliderPreview.vue) - a real correction, not a stylistic
// choice: an earlier version of this file rendered every slide stacked at
// once "so nothing while editing was hidden", but that made it easy to
// lose track of the fact a slider only ever shows one slide for real, and
// buried whichever slide wasn't first under however many others came
// before it. `addSlide()` appends a brand new, empty Flexbox as the next
// slide and switches straight to it - the direct, explicit way to grow a
// slider, rather than requiring a drag from the palette every time (still
// works too - the active slide's own container, and the slider's own root
// div here, are both still real dragula containers, so dragging a saved
// snippet or a palette element in still works exactly like dragging into
// any other container). `duplicateSlide()` is the same "start from a
// working slide instead of an empty one" idea - inserts a fresh-ids copy
// of the currently active slide right after it and switches to that copy.
//
// `slider.mode` ('standard'/'tabs', added later) only changes what this
// strip's buttons show and do while editing - numbered jump targets for
// 'standard', user-renameable named tabs (double-click) for 'tabs' - not
// which slide is "active": both modes still edit exactly one slide at a
// time, the same as before this option existed.
//
// Otherwise identical to BlockContainer.vue (corner tag, selection,
// dragula attributes, the same per-node named-group hover fix - see that
// file's own comment on why a shared, unqualified `group` class made every
// container's tag effectively always-visible) - kept as its own file
// rather than a conditional branch inside BlockContainer.vue, since the
// slide navigation/add-slide behavior is a real enough addition to
// deserve not being tangled into that file's own, already-documented
// history.
import { computed, ref, watch } from 'vue'
import { Copy, Plus } from '@lucide/vue'
import Element from '../scripts/ElementsClass.js'
import { useEditorStore } from '../store/editor'
import { resolveDisplayUrl } from '../resolve-display-url'
import { clean } from '../helpers'
import { cloneWithFreshIds } from '../scripts/editor-actions'
import BlockElement from './BlockElement.vue'
import BlockIFrame from './BlockIFrame.vue'
import BlockContainer from './BlockContainer.vue'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  doc: WhoobeElement
  level: number
}>()

const editor = useEditorStore()

const activeIndex = ref(0)
const activeSlide = computed<WhoobeElement | null>(() => props.doc.blocks[activeIndex.value] ?? null)

// 'standard' (plain numbered jump-to-slide, as before) or 'tabs' (each
// slide gets a user-given name, renamed right here via double-click) - see
// ElementsClass.js's Slider() comment and preview/BlockSliderPreview.vue,
// which reads the same `slider.mode` to pick between arrows/home and a row
// of named tabs at preview time.
const mode = computed<'standard' | 'tabs'>(() => (((props.doc as any).slider?.mode as 'standard' | 'tabs' | undefined) ?? 'standard'))

function tabLabel(slide: WhoobeElement, index: number): string {
  return (slide as any).tabLabel || `Slide ${index + 1}`
}

// A plain window.prompt(), consistent with this app's established pattern
// for one-off text input (Image/Link URL) rather than a dedicated dialog -
// `null` means the user cancelled (leaves the name untouched); an empty/
// whitespace-only result clears back to the default "Slide N" fallback
// instead of storing a visibly blank tab.
function renameTab(slide: WhoobeElement) {
  const next = window.prompt('Tab name', (slide as any).tabLabel || '')
  if (next === null) return
  ;(slide as any).tabLabel = next.trim() || undefined
}

// Clamp if the slide count shrinks out from under the active index (e.g.
// the active slide gets deleted) - defensive, not expected in normal use.
watch(
  () => props.doc.blocks.length,
  (length) => {
    if (activeIndex.value >= length) activeIndex.value = Math.max(0, length - 1)
  }
)

const isSelected = computed(() => editor.current?.id === props.doc.id)
const groupClass = computed(() => `group/${props.doc.id}`)
const tagOpacityClass = computed(() => (isSelected.value ? 'opacity-100' : `opacity-0 group-hover/${props.doc.id}:opacity-100`))

// Same signal/reasoning as BlockContainer.vue's own tagBgClass - see that
// file's comment for why `css.css`/inline `style` (not `css.container`,
// which every container already has some of by default) is what "custom
// CSS" actually means here.
const tagBgClass = computed(() => {
  const doc = props.doc as any
  const hasCustomCss = !!(doc.css?.css?.trim() || doc.style?.trim())
  return hasCustomCss ? 'bg-violet-500' : 'bg-red-500'
})

// Same rendering-tag fix as BlockContainer.vue's own `semantic` computed
// (see that file's comment for the fuller reasoning) - a Slider is a
// container too (`type: 'container'`), so it had the exact same "always a
// div, even if `semantic` is set" gap.
const semantic = computed(() => (props.doc as any).semantic || 'div')

const classe = computed(() => {
  const doc = props.doc as any
  let cls = `${doc.css.css ?? ''} ${doc.css.container ?? ''} relative cursor-pointer p-1`
  cls += isSelected.value ? ' border-2 border-red-400' : ' border border-dashed border-transparent hover:border-red-300'
  if (!doc.blocks?.length) cls += ' min-h-12 min-w-12'
  return cls
})

const stile = computed(() => {
  const doc = props.doc as any
  let st = ''
  const bgUrl = resolveDisplayUrl(doc.image?.url)
  if (bgUrl) st += `background-image:url(${bgUrl});`
  if (doc.font) st += `font-family:"${doc.font.replace('+', ' ')}";`
  return st + (doc.style ?? '')
})

function onSelect() {
  editor.setCurrent(isSelected.value ? null : props.doc)
}

function goToSlide(index: number) {
  activeIndex.value = index
  const slide = props.doc.blocks[index]
  if (slide) editor.setCurrent(slide)
}

function addSlide() {
  const created = new Element().Flexbox({ direction: 'col' })
  created.css.css = clean(created.css.css)
  props.doc.blocks.push(created)
  activeIndex.value = props.doc.blocks.length - 1
  editor.setCurrent(created)
}

// Same "fresh ids throughout" clone every other duplicate/paste/drop path
// in this app already relies on (cloneWithFreshIds(), editor-actions.ts) -
// the copy must never share an id with the original, or the two would
// collide the moment both exist in the document at once. Inserted directly
// after the original (not appended at the end) and switched to immediately,
// matching addSlide()'s own "land on whatever you just created" behavior -
// a duplicate is a starting point for a variation on *this* slide, so
// sitting right next to it, already selected, is the useful place to land.
function duplicateSlide() {
  if (!activeSlide.value) return
  const clone = cloneWithFreshIds(activeSlide.value)
  const insertAt = activeIndex.value + 1
  props.doc.blocks.splice(insertAt, 0, clone)
  activeIndex.value = insertAt
  editor.setCurrent(clone)
}
</script>

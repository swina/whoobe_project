<template>
  <div class="relative">
    <component
      :is="component"
      :id="element.id"
      :ref="element.id"
      :class="classe"
      :style="stile"
      :contenteditable="!resolvedDataValue && element.editable"
      :src="displaySrc"
      :alt="displayAlt"
      :placeholder="element.placeholder"
      :data-id="element.id"
      data-type="element"
      v-html="displayContent"
      @click="onClick"
      @blur="onBlur"
    ></component>
    <div
      v-if="showOverlay"
      class="absolute inset-0 z-10 flex items-center justify-center bg-indigo-50/80 text-indigo-500 text-[10px] font-mono pointer-events-none select-none rounded"
    >
      {{ bindingPlaceholder }}
    </div>
  </div>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's src/components/blocks/BlockElement.vue - the
// actual inline-WYSIWYG mechanism (see port plan §1.2): contenteditable is
// set directly on the rendered tag when the node is selected and editable,
// and onBlur reads the live DOM innerHTML back into reactive state. No
// editor library, no textarea-based editing - this IS the element.
//
// Deviations from the original (deliberate, see port plan §2/§5 Phase 0):
// - `element`/`level` are real declared props, not read off `this.$attrs`
//   (the original's pervasive $attrs-instead-of-props pattern, item 3).
// - No z-index/overlay hit-testing trick for click selection - see
//   BlockContainer.vue's @click.self approach instead, which makes the
//   whole "which element did the click actually land on" question a
//   native DOM concern rather than a manually-maintained z-index ladder.
import { computed } from 'vue'
import type Element from '../scripts/ElementsClass.js'
import { useEditorStore } from '../store/editor'
import { imageURL } from '../helpers'
import { resolveDisplayUrl } from '../resolve-display-url'
import { resolveFieldValue } from '../scripts/data-resolver'
import { editorBus } from '../bus'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  element: WhoobeElement
  level: number
}>()

const editor = useEditorStore()

const isSelected = computed(() => editor.current?.id === props.element.id)

const db = computed(() => (props.element as any).dataBinding)

// Resolved data value from the store, populated by data-resolver.ts which
// runs whenever the document's binding structure changes (BlockEditor.vue).
const resolvedDataValue = computed(() => {
  const binding = db.value
  if (!binding) return null
  const resolved = editor.resolvedData[props.element.id]
  if (!resolved) return null
  return resolveFieldValue(resolved, binding)
})

const hasResolvedData = computed(() => db.value && resolvedDataValue.value !== null)

// Show the abstract {Class.field} overlay only when binding exists but data
// hasn't resolved yet (loading / not yet fetched). Once resolved, the real
// value is shown inline below.
const showOverlay = computed(() => db.value && !hasResolvedData.value)

const bindingPlaceholder = computed(() => {
  const binding = db.value
  if (!binding) return ''
  return binding.field ? `{${binding.className}.${binding.field}}` : `{${binding.className}}`
})

function isAssetUuid(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

const displayContent = computed(() => {
  if (hasResolvedData.value) {
    const v = resolvedDataValue.value
    if (typeof v === 'string' || typeof v === 'number') return String(v)
    return ''
  }
  return (props.element as any).content
})

const displaySrc = computed(() => {
  if (hasResolvedData.value && (props.element as any).element === 'img') {
    const v = resolvedDataValue.value
    if (typeof v === 'string' && !isAssetUuid(v)) return resolveDisplayUrl(v)
    if (v && typeof v === 'object' && typeof (v as any).url === 'string') return (v as any).url
  }
  return resolveDisplayUrl(imageURL((props.element as any).image))
})

const displayAlt = computed(() => {
  if (hasResolvedData.value && (props.element as any).element === 'img') {
    const v = resolvedDataValue.value
    if (typeof v === 'string') return v
    return undefined
  }
  return (props.element as any).image?.alt || undefined
})

const component = computed(() => {
  const el = props.element as any
  if ('level' in el && el.level) {
    const level = Number(el.level)
    return 'h' + (Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1)
  }
  return el.element === 'grid' ? 'div' : el.element
})

const classe = computed(() => {
  const el = props.element as any
  let cls = `${el.css.css} ${el.css.container}`
  if (isSelected.value) cls += ' shadow-lg ring-2 ring-indigo-500'
  return cls
})

const stile = computed(() => {
  const el = props.element as any
  let st = ''
  const showBg = !(db.value && db.value.target === 'src' && hasResolvedData.value)
  if (showBg) {
    const bgUrl = resolveDisplayUrl(el.image?.url)
    if (bgUrl) st += `background-image:url(${bgUrl});`
  }
  if (el.font) st += `font-family:"${el.font.replace('+', ' ')}";`
  return st + (el.style ?? '')
})

function onClick(e: MouseEvent) {
  e.stopPropagation()
  editor.setCurrent(isSelected.value ? null : props.element)
  if (!isSelected.value) editorBus.emit('floatingElement', props.element.id)
}

function onBlur(e: FocusEvent) {
  if (!isSelected.value) return
  const target = e.target as HTMLElement
  const text = target.innerHTML.replace(/style="[^"]*"/gm, '')
  props.element.content = text
}
</script>
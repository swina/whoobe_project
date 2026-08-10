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
import type { DataObjectRecord } from '../data-objects-api'
import { editorBus } from '../bus'
import { applyTransform, escapeHtml } from '../scripts/field-transforms'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  element: WhoobeElement
  level: number
  dataContext?: DataObjectRecord | null
}>()

const editor = useEditorStore()

const isSelected = computed(() => editor.current?.id === props.element.id)

const db = computed(() => (props.element as any).dataBinding)

// Resolved data value: explicit bindings (with objectId) use the store's
// resolved data. Relative bindings (no objectId, e.g. generated template
// fields) resolve against the nearest container's dataContext.
const resolvedDataValue = computed(() => {
  const binding = db.value
  if (!binding) return null
  if (binding.objectId) {
    const resolved = editor.resolvedData[props.element.id]
    if (!resolved) return null
    return resolveFieldValue(resolved, binding)
  }
  // Relative binding: inherit from container's dataContext.
  if (props.dataContext && binding.field) {
    return (props.dataContext.attributes as any)?.[binding.field]
  }
  if (props.dataContext && !binding.field) {
    return props.dataContext
  }
  return null
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

const displayContent = computed(() => {
  if (hasResolvedData.value) {
    const result = applyTransform(resolvedDataValue.value, db.value?.transform)
    if (result.kind === 'link') {
      const targetAttr = result.target ? ` target="${result.target}" rel="noopener noreferrer"` : ''
      return `<a href="${escapeHtml(result.href)}"${targetAttr}>${escapeHtml(result.text)}</a>`
    }
    return result.text
  }
  return (props.element as any).content
})

const displaySrc = computed(() => {
  if (hasResolvedData.value && (props.element as any).element === 'img') {
    const v = resolvedDataValue.value
    if (typeof v === 'string') return resolveDisplayUrl(v)
    if (v && typeof v === 'object' && typeof (v as any).url === 'string') return (v as any).url
    if (v && typeof v === 'object' && typeof (v as any).assetId === 'string') return resolveDisplayUrl((v as any).assetId)
  }
  return resolveDisplayUrl(imageURL((props.element as any).image))
})

const displayAlt = computed(() => {
  if (hasResolvedData.value && (props.element as any).element === 'img') {
    const v = resolvedDataValue.value
    if (db.value?.transform && db.value.transform.type !== 'none') {
      const text = applyTransform(v, db.value.transform).text
      return text || undefined
    }
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
  // Keep a bound element with no content visible/selectable in the editor
  // canvas (data not yet resolved, or resolves to empty/null).
  if (db.value && !el.content && el.element !== 'img') cls += ' min-h-8'
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
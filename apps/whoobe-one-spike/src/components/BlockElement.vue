<template>
  <component
    :is="component"
    :id="element.id"
    :ref="element.id"
    :class="classe"
    :style="stile"
    :contenteditable="element.editable"
    :src="element.element === 'img' ? resolveDisplayUrl(imageURL(element.image)) : undefined"
    :placeholder="element.placeholder"
    :data-id="element.id"
    data-type="element"
    v-html="element.content"
    @click="onClick"
    @blur="onBlur"
  ></component>
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
import { editorBus } from '../bus'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  element: WhoobeElement
  level: number
}>()

const editor = useEditorStore()

const isSelected = computed(() => editor.current?.id === props.element.id)

const component = computed(() => {
  const el = props.element as any
  if ('level' in el && el.level) return 'h' + el.level
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
  const bgUrl = resolveDisplayUrl(el.image?.url)
  if (bgUrl) st += `background-image:url(${bgUrl});`
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

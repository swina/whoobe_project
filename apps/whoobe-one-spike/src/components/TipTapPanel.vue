<template>
  <div class="flex flex-col h-full">
    <div v-if="editor" class="flex items-center gap-1 p-1.5 border-b flex-wrap shrink-0">
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('bold') }" title="Bold" @click="editor.chain().focus().toggleBold().run()"><Bold class="w-3.5 h-3.5" /></button>
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('italic') }" title="Italic" @click="editor.chain().focus().toggleItalic().run()"><Italic class="w-3.5 h-3.5" /></button>
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('strike') }" title="Strikethrough" @click="editor.chain().focus().toggleStrike().run()"><Strikethrough class="w-3.5 h-3.5" /></button>
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('code') }" title="Code" @click="editor.chain().focus().toggleCode().run()"><Code class="w-3.5 h-3.5" /></button>
      <span class="w-px h-4 bg-gray-200 mx-0.5"></span>
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('paragraph') }" title="Paragraph" @click="editor.chain().focus().setParagraph().run()"><Pilcrow class="w-3.5 h-3.5" /></button>
      <button
        v-for="level in [1, 2, 3, 4] as const"
        :key="level"
        type="button"
        class="tt-btn"
        :class="{ 'tt-active': editor.isActive('heading', { level }) }"
        :title="`Heading ${level}`"
        @click="editor.chain().focus().toggleHeading({ level }).run()"
      >
        <component :is="headingIcon(level)" class="w-3.5 h-3.5" />
      </button>
      <span class="w-px h-4 bg-gray-200 mx-0.5"></span>
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('bulletList') }" title="Bullet list" @click="editor.chain().focus().toggleBulletList().run()"><List class="w-3.5 h-3.5" /></button>
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('orderedList') }" title="Numbered list" @click="editor.chain().focus().toggleOrderedList().run()"><ListOrdered class="w-3.5 h-3.5" /></button>
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('blockquote') }" title="Blockquote" @click="editor.chain().focus().toggleBlockquote().run()"><Quote class="w-3.5 h-3.5" /></button>
      <button type="button" class="tt-btn" title="Horizontal rule" @click="editor.chain().focus().setHorizontalRule().run()"><SeparatorHorizontal class="w-3.5 h-3.5" /></button>
      <button type="button" class="tt-btn" title="Insert image" @click="setImage"><Image class="w-3.5 h-3.5" /></button>
    </div>
    <editor-content :editor="editor" class="flex-1 min-h-0 overflow-y-auto p-3 text-sm prose-sm" />
  </div>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's src/components/blocks/components/BlockTipTap.
// vue - a richer text-formatting mode for paragraphs (bold/italic/strike/
// code/headings/lists/blockquote/hr/inline images), on top of the plain
// contenteditable every text element already gets from BlockElement.vue.
// The source reaches this via `$dialogBus('TipTapEditor')` from
// BlockEditContent.vue's mounted() hook, opening it as a *separate dialog*
// (dialog/Dialog.vue's bus-routed system - Phase 3 scope, not built here).
// FloatingToolbar.vue instead shows this directly as an inline modal it
// owns itself when "Edit content" is clicked on a paragraph specifically -
// simpler, given no dialog system exists yet, and the source itself only
// ever routes here for `element === 'p'`, never other text types.
//
// @tiptap/vue-2 -> @tiptap/vue-3 (official equivalent, same Editor/
// EditorContent API - port plan §2 item 8); v-model replaces the source's
// dual-mode $attrs.value-or-store-mutation content binding (Vue 2 idiom,
// not needed here - the caller always binds v-model to editor.current.
// content, see FloatingToolbar.vue).
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import type { Component } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import TipTapImage from '@tiptap/extension-image'
import { Bold, Code, Heading1, Heading2, Heading3, Heading4, Image, Italic, List, ListOrdered, Pilcrow, Quote, SeparatorHorizontal, Strikethrough } from '@lucide/vue'

const HEADING_ICONS: Record<1 | 2 | 3 | 4, Component> = {
  1: Heading1,
  2: Heading2,
  3: Heading3,
  4: Heading4,
}
function headingIcon(level: 1 | 2 | 3 | 4): Component {
  return HEADING_ICONS[level]
}

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

// shallowRef, not ref - Tiptap's own Vue 3 docs use shallowRef for the
// editor instance specifically: Editor already manages its own internal
// (ProseMirror) reactivity, so wrapping it in Vue's deep-reactive ref()
// both does needless work and (per a known vue-tsc friction point) can
// confuse strict-mode type-checking of EditorContent's `editor` prop,
// which references Editor's own private fields.
const editor = shallowRef<InstanceType<typeof Editor> | undefined>(undefined)

onMounted(() => {
  editor.value = new Editor({
    content: props.modelValue,
    extensions: [StarterKit, TipTapImage],
    onUpdate: () => {
      emit('update:modelValue', editor.value!.getHTML())
    },
  })
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

// Keeps the editor in sync if modelValue changes from outside (e.g. the
// plain contenteditable path in BlockElement.vue editing the same node
// while this panel happens to be open) - mirrors the source's own
// `modelValue(value)` watcher.
watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value || editor.value.getHTML() === value) return
    editor.value.commands.setContent(value, false)
  }
)

function setImage() {
  const url = window.prompt('Image URL')
  if (url) editor.value?.chain().focus().setImage({ src: url }).run()
}
</script>

<style scoped>
.tt-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  height: 1.75rem;
  padding: 0 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  color: #4b5563;
}
.tt-btn:hover {
  background: #f3f4f6;
}
.tt-active {
  background: #eef2ff;
  color: #4f46e5;
}
</style>

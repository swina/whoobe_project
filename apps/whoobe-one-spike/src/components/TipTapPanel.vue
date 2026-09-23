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
      <span class="w-px h-4 bg-gray-200 mx-0.5"></span>
      <button type="button" class="tt-btn" :class="{ 'tt-active': showHtmlSource }" title="Edit HTML source" @click="toggleHtmlSource"><Braces class="w-3.5 h-3.5" /></button>
    </div>
    <editor-content v-if="!showHtmlSource" :editor="editor" class="flex-1 min-h-0 overflow-y-auto p-3 text-sm prose-sm" />
    <textarea
      v-else
      v-model="htmlSource"
      class="flex-1 min-h-0 overflow-y-auto p-3 text-xs font-mono resize-none outline-none border-0"
      spellcheck="false"
    ></textarea>
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
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { Component } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import TipTapImage from '@tiptap/extension-image'
import { Bold, Braces, Code, Heading1, Heading2, Heading3, Heading4, Image, Italic, List, ListOrdered, Pilcrow, Quote, SeparatorHorizontal, Strikethrough } from '@lucide/vue'

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

// HTML source mode: swaps <editor-content> for a plain <textarea> bound to
// the current document's serialized HTML. Toggling back re-parses whatever
// was typed via setContent(html, true) - the `true` (unlike the sync
// watcher above, which deliberately passes false) means this DOES emit
// onUpdate, so v-model picks up the edit the same way a WYSIWYG change
// would. TipTap/ProseMirror's own HTML parser handles the actual
// sanitizing - unknown tags/attributes are dropped, not executed.
const showHtmlSource = ref(false)
const htmlSource = ref('')

function toggleHtmlSource() {
  if (!editor.value) return
  if (showHtmlSource.value) {
    editor.value.commands.setContent(htmlSource.value, true)
  } else {
    htmlSource.value = editor.value.getHTML()
  }
  showHtmlSource.value = !showHtmlSource.value
}

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
/* Without these, toggleBulletList()/toggleOrderedList() etc. still create
   real <ul>/<ol>/<h1-4>/<blockquote> nodes (TipTap's StarterKit includes
   them by default) - they're just visually indistinguishable from plain
   paragraphs, because @tailwindcss/browser's runtime preflight (loaded in
   main.ts) resets list-style/margin on every <ul>/<ol> site-wide,
   including inside this editor's own content. admin-dashboard's sibling
   port of this component (WysiwygEditor.vue) already has the equivalent
   of these rules for the same reason. */
:deep(.ProseMirror) {
  outline: none;
}
:deep(.ProseMirror p) {
  margin: 0.5em 0;
}
:deep(.ProseMirror h1) { font-size: 1.5em; font-weight: 700; margin: 0.6em 0 0.3em; }
:deep(.ProseMirror h2) { font-size: 1.3em; font-weight: 700; margin: 0.6em 0 0.3em; }
:deep(.ProseMirror h3) { font-size: 1.15em; font-weight: 600; margin: 0.6em 0 0.3em; }
:deep(.ProseMirror h4) { font-size: 1em; font-weight: 600; margin: 0.6em 0 0.3em; }
:deep(.ProseMirror ul) { list-style: disc; padding-left: 1.25em; }
:deep(.ProseMirror ol) { list-style: decimal; padding-left: 1.25em; }
:deep(.ProseMirror blockquote) { border-left: 2px solid #94a3b8; padding-left: 0.75em; opacity: 0.85; }
:deep(.ProseMirror code) { background: #f1f5f9; padding: 0.1em 0.35em; border-radius: 0.25em; font-size: 0.9em; }
:deep(.ProseMirror img) { max-width: 100%; border-radius: 0.375em; }
</style>

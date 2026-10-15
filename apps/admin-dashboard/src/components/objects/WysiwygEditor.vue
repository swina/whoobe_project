<template>
  <div class="rounded-lg border border-slate-800 light:border-slate-200 overflow-hidden" :class="{ 'flex flex-col': fill }">
    <div v-if="editor" class="flex items-center gap-1 p-1.5 border-b border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-slate-50 flex-wrap">
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('bold') }" title="Bold" @click="editor.chain().focus().toggleBold().run()"><Bold class="w-3.5 h-3.5" /></button>
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('italic') }" title="Italic" @click="editor.chain().focus().toggleItalic().run()"><Italic class="w-3.5 h-3.5" /></button>
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('strike') }" title="Strikethrough" @click="editor.chain().focus().toggleStrike().run()"><Strikethrough class="w-3.5 h-3.5" /></button>
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('code') }" title="Code" @click="editor.chain().focus().toggleCode().run()"><Code class="w-3.5 h-3.5" /></button>
      <span class="w-px h-4 bg-slate-800 light:bg-slate-200 mx-0.5"></span>
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
      <span class="w-px h-4 bg-slate-800 light:bg-slate-200 mx-0.5"></span>
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('bulletList') }" title="Bullet list" @click="editor.chain().focus().toggleBulletList().run()"><List class="w-3.5 h-3.5" /></button>
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('orderedList') }" title="Numbered list" @click="editor.chain().focus().toggleOrderedList().run()"><ListOrdered class="w-3.5 h-3.5" /></button>
      <button type="button" class="tt-btn" :class="{ 'tt-active': editor.isActive('blockquote') }" title="Blockquote" @click="editor.chain().focus().toggleBlockquote().run()"><Quote class="w-3.5 h-3.5" /></button>
      <button type="button" class="tt-btn" title="Horizontal rule" @click="editor.chain().focus().setHorizontalRule().run()"><SeparatorHorizontal class="w-3.5 h-3.5" /></button>
      <button type="button" class="tt-btn" title="Insert image" @click="setImage"><ImageIcon class="w-3.5 h-3.5" /></button>
      <span class="w-px h-4 bg-slate-800 light:bg-slate-200 mx-0.5"></span>
      <button type="button" class="tt-btn" :class="{ 'tt-active': showHtmlSource }" title="Edit HTML source" @click="toggleHtmlSource"><Braces class="w-3.5 h-3.5" /></button>
    </div>
    <editor-content v-if="!showHtmlSource" :editor="editor" class="tt-content px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 text-slate-200 light:text-slate-800 overflow-y-auto"
      :class="fill ? 'tt-fill flex-1 min-h-0' : 'max-h-96'" />
    <textarea
      v-else
      v-model="htmlSource"
      class="w-full px-3 py-2 text-xs font-mono bg-slate-950 light:bg-slate-50 text-slate-200 light:text-slate-800 overflow-y-auto resize-y outline-none border-0"
      :class="fill ? 'flex-1 min-h-0' : 'max-h-96 min-h-24'"
      spellcheck="false"
    ></textarea>
  </div>
</template>

<script setup lang="ts">
// Rich-text editing for `wysiwyg`-type Data Object fields - docs/plans/
// datamodel/wysiwyg-field-editor-plan.md, Phase 1. A direct port of
// apps/whoobe-one-spike/src/components/TipTapPanel.vue (itself a port of
// whoobe-one-studio's own BlockTipTap.vue - this is the same component's
// third port in this monorepo, not a fresh editor-library evaluation),
// restyled to this app's own slate/indigo dark+light theme instead of
// that component's plain gray/indigo one.
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { Component } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import TipTapImage from '@tiptap/extension-image'
import { Bold, Braces, Code, Heading1, Heading2, Heading3, Heading4, Image as ImageIcon, Italic, List, ListOrdered, Pilcrow, Quote, SeparatorHorizontal, Strikethrough } from '@lucide/vue'

const HEADING_ICONS: Record<1 | 2 | 3 | 4, Component> = {
  1: Heading1,
  2: Heading2,
  3: Heading3,
  4: Heading4,
}
function headingIcon(level: 1 | 2 | 3 | 4): Component {
  return HEADING_ICONS[level]
}

// fill: the field has a height of its own (custom classes, h-[600px] ...): the editing area takes all of it instead of max-h-96
const props = defineProps<{ modelValue: string; fill?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

// shallowRef, not ref - Tiptap already manages its own (ProseMirror)
// reactivity internally, so wrapping the Editor instance in Vue's deep-
// reactive ref() both does needless work and (a known vue-tsc friction
// point, confirmed in the source component this was ported from) can
// confuse strict-mode type-checking of EditorContent's `editor` prop.
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

// Keeps the editor in sync if modelValue changes from outside (e.g. this
// same field re-rendering after a locale switch in MasterObjectTab.vue).
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

// Bare URL prompt, same as the source component - a real DAM asset-picker
// wiring (admin-dashboard has one, whoobe-one-spike doesn't) is Phase 2
// of the plan, not built here.
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
  border-radius: 0.375rem;
  font-size: 0.75rem;
  color: rgb(148 163 184); /* text-slate-400 */
}
.tt-btn:hover {
  color: rgb(226 232 240); /* text-slate-200 */
  background: rgb(30 41 59 / 0.6); /* bg-slate-800/60 */
}
.tt-active {
  background: rgb(79 70 229 / 0.2); /* bg-indigo-600/20 */
  color: rgb(165 180 252); /* text-indigo-300 */
}
/* .light lives on <html> (themeStore.ts), an ancestor outside this
   component - Vue's scoped-CSS transform only appends the scope
   attribute to the rightmost selector, so this still matches normally. */
.light .tt-btn {
  color: rgb(71 85 105); /* text-slate-600 */
}
.light .tt-btn:hover {
  color: rgb(30 41 59); /* text-slate-800 */
  background: rgb(241 245 249); /* bg-slate-100 */
}
.light .tt-active {
  background: rgb(224 231 255); /* bg-indigo-100 */
  color: rgb(67 56 202); /* text-indigo-700 */
}
.tt-fill :deep(.ProseMirror) { min-height: 100%; }
.tt-content :deep(.ProseMirror) {
  outline: none;
  min-height: 6rem;
}
.tt-content :deep(.ProseMirror p) {
  margin: 0.5em 0;
}
.tt-content :deep(.ProseMirror h1) { font-size: 1.5em; font-weight: 700; margin: 0.6em 0 0.3em; }
.tt-content :deep(.ProseMirror h2) { font-size: 1.3em; font-weight: 700; margin: 0.6em 0 0.3em; }
.tt-content :deep(.ProseMirror h3) { font-size: 1.15em; font-weight: 600; margin: 0.6em 0 0.3em; }
.tt-content :deep(.ProseMirror h4) { font-size: 1em; font-weight: 600; margin: 0.6em 0 0.3em; }
.tt-content :deep(.ProseMirror ul) { list-style: disc; padding-left: 1.25em; }
.tt-content :deep(.ProseMirror ol) { list-style: decimal; padding-left: 1.25em; }
.tt-content :deep(.ProseMirror blockquote) { border-left: 2px solid rgb(71 85 105); padding-left: 0.75em; opacity: 0.85; }
.tt-content :deep(.ProseMirror code) { background: rgb(30 41 59 / 0.6); padding: 0.1em 0.35em; border-radius: 0.25em; font-size: 0.9em; }
.tt-content :deep(.ProseMirror img) { max-width: 100%; border-radius: 0.375em; }
</style>

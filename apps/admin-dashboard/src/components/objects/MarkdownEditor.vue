<template>
  <div class="rounded-lg border border-slate-800 light:border-slate-200 overflow-hidden" :class="{ 'flex flex-col': fill }">
    <div class="flex items-center gap-1 p-1.5 border-b border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-slate-50">
      <button
        type="button"
        class="md-tab"
        :class="{ 'md-tab-active': !showPreview }"
        @click="showPreview = false"
      >
        <Pencil class="w-3.5 h-3.5" /> Write
      </button>
      <button
        type="button"
        class="md-tab"
        :class="{ 'md-tab-active': showPreview }"
        @click="showPreview = true"
      >
        <Eye class="w-3.5 h-3.5" /> Preview
      </button>
    </div>
    <textarea
      v-if="!showPreview"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      rows="8"
      placeholder="Markdown source…"
      class="w-full px-3 py-2 text-sm font-mono bg-slate-950 light:bg-slate-50 text-slate-200 light:text-slate-800 overflow-y-auto resize-y outline-none border-0"
      :class="fill ? 'flex-1 min-h-0' : 'max-h-96 min-h-24'"
      spellcheck="false"
    ></textarea>
    <!-- Preview: the markdown source converted to HTML, same trust level as
         WysiwygEditor's own unsanitized HTML - admin-authored content, not
         user-generated. -->
    <div
      v-else
      class="md-preview px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 text-slate-200 light:text-slate-800 overflow-y-auto"
      :class="fill ? 'flex-1 min-h-0' : 'max-h-96 min-h-24'"
      v-html="previewHtml"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { sanitizeRichText as safeHtml } from '@whoobe-cms/schema'
// Markdown editing for `markdown`-type Data Object fields - a plain-text
// source editor (unlike `wysiwyg`'s WysiwygEditor.vue, which stores real
// HTML) with a Write/Preview toggle; Preview converts the stored Markdown
// to HTML via `marked`, mirroring how `wysiwyg` content is already real
// HTML by the time it reaches any render path.
import { computed, ref } from 'vue'
import { marked } from 'marked'
import { Eye, Pencil } from '@lucide/vue'

// fill: the field has a height of its own (Class > Fields > custom classes, h-[600px] ...): the writing area takes all of it instead of
// the default 8 rows capped at max-h-96
const props = defineProps<{ modelValue: string; fill?: boolean }>()
defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const showPreview = ref(false)

// marked passes raw HTML through: the preview must be sanitised like any other rich text
const previewHtml = computed(() => safeHtml(marked.parse(props.modelValue ?? '', { async: false }) as string))
</script>

<style scoped>
.md-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgb(148 163 184); /* text-slate-400 */
}
.md-tab:hover {
  color: rgb(226 232 240); /* text-slate-200 */
  background: rgb(30 41 59 / 0.6); /* bg-slate-800/60 */
}
.md-tab-active {
  background: rgb(79 70 229 / 0.2); /* bg-indigo-600/20 */
  color: rgb(165 180 252); /* text-indigo-300 */
}
.light .md-tab {
  color: rgb(71 85 105); /* text-slate-600 */
}
.light .md-tab:hover {
  color: rgb(30 41 59); /* text-slate-800 */
  background: rgb(241 245 249); /* bg-slate-100 */
}
.light .md-tab-active {
  background: rgb(224 231 255); /* bg-indigo-100 */
  color: rgb(67 56 202); /* text-indigo-700 */
}
.md-preview :deep(p) { margin: 0.5em 0; }
.md-preview :deep(h1) { font-size: 1.5em; font-weight: 700; margin: 0.6em 0 0.3em; }
.md-preview :deep(h2) { font-size: 1.3em; font-weight: 700; margin: 0.6em 0 0.3em; }
.md-preview :deep(h3) { font-size: 1.15em; font-weight: 600; margin: 0.6em 0 0.3em; }
.md-preview :deep(h4) { font-size: 1em; font-weight: 600; margin: 0.6em 0 0.3em; }
.md-preview :deep(ul) { list-style: disc; padding-left: 1.25em; }
.md-preview :deep(ol) { list-style: decimal; padding-left: 1.25em; }
.md-preview :deep(blockquote) { border-left: 2px solid rgb(71 85 105); padding-left: 0.75em; opacity: 0.85; }
.md-preview :deep(code) { background: rgb(30 41 59 / 0.6); padding: 0.1em 0.35em; border-radius: 0.25em; font-size: 0.9em; }
.md-preview :deep(pre) { background: rgb(30 41 59 / 0.6); padding: 0.6em; border-radius: 0.375em; overflow-x: auto; }
.md-preview :deep(pre code) { background: none; padding: 0; }
.md-preview :deep(img) { max-width: 100%; border-radius: 0.375em; }
.md-preview :deep(a) { color: rgb(129 140 248); text-decoration: underline; }
</style>

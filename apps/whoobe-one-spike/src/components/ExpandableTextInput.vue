<template>
  <div class="flex items-stretch gap-1">
    <input
      type="text"
      :value="modelValue"
      :placeholder="placeholder"
      class="flex-1 min-w-0 px-2.5 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-500"
      :class="monospace ? 'font-mono' : ''"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      type="button"
      title="Expand to edit in a larger box"
      class="shrink-0 px-2 flex items-center justify-center rounded border border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600"
      @click="open"
    >
      <Maximize2 class="w-3.5 h-3.5" />
    </button>
  </div>

  <Teleport to="body">
    <div
      v-if="showPopup"
      class="fixed inset-0 z-[20000] bg-black/40 flex items-center justify-center p-6"
      @click.self="cancel"
    >
      <div class="bg-white text-gray-900 rounded-lg shadow-xl w-full max-w-lg flex flex-col" @keydown.stop>
        <div class="flex items-center justify-between px-4 py-2 border-b">
          <span class="text-sm font-semibold text-gray-700">{{ popupLabel || 'Edit text' }}</span>
          <span class="text-xs text-gray-400">Esc to cancel</span>
        </div>
        <div class="p-4">
          <textarea
            ref="textareaEl"
            v-model="draft"
            :rows="rows"
            :placeholder="placeholder"
            class="w-full px-3 py-2 text-sm rounded border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-500 resize-y"
            :class="monospace ? 'font-mono' : ''"
          />
        </div>
        <div class="flex justify-end gap-2 px-4 py-2 border-t">
          <button type="button" class="px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-600" @click="cancel">
            Cancel
          </button>
          <button
            type="button"
            class="px-3 py-1.5 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
            @click="apply"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// Not a port - no source equivalent (single-line inputs there are just
// plain `<input>`s). Built as a genuinely generic, reusable component
// rather than something baked into whichever field first needed it
// (FloatingToolbar.vue's Slider settings popover - Tailwind class lists
// can get long enough that a single-line input makes them hard to read or
// position a cursor inside), so it's a plain, self-contained v-model
// wrapper around `<input type="text">`: any text field in this app (or,
// since it depends on nothing app-specific - no store, no Slider/Element
// types, just `@lucide/vue` for the expand icon, already this monorepo's
// own established icon library - copyable wholesale into any other Vue 3
// app in this monorepo) can swap a bare `<input>` for this component with
// no other changes, and gets an "expand to a bigger box" escape hatch for
// free.
//
// The input and the popup's textarea set their own text and background colours (`text-gray-900` on `bg-white`): the popup is
// teleported to <body>, where the page's light text colour is inherited, and a light grey on white was unreadable.
//
// Deliberately NOT wired directly to `modelValue` while the popup is open -
// `draft` is a local copy, only ever written back via `apply()` (or
// discarded via `cancel()`/Escape/clicking the backdrop). Editing in place
// against `modelValue` directly would work too, but would mean there's no
// way to "back out" of a long edit once the popup is open - closing it
// with Escape wouldn't feel like a real cancel if it had already been
// live-applying every keystroke the whole time.
//
// `<Teleport to="body">`: this can end up used inside a small, `overflow-
// y-auto`, non-`position:fixed` popover (exactly FloatingToolbar.vue's
// Slider settings panel) - teleporting means the actual modal overlay
// never depends on being unclipped by whatever ancestor happens to contain
// this component, which a genuinely reusable component shouldn't assume.
import { nextTick, ref, watch } from 'vue'
import { Maximize2 } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    // `string | undefined`, not just `string` - several real call sites
    // bind this to an optional field (e.g. ElementSlider's class fields,
    // each `?: string` since a Slider saved before they existed has none
    // at all) rather than one guaranteed to already hold a string.
    modelValue?: string
    /** Shown as the popup's own title - the popup is a decontextualized
     * overlay, so it needs its own label even if the inline input already
     * sits next to one. */
    popupLabel?: string
    placeholder?: string
    /** Textarea row count inside the popup. */
    rows?: number
    /** Applies `font-mono` to both the inline input and the popup's
     * textarea - for fields like Tailwind class lists where a monospaced,
     * evenly-spaced view of the text genuinely helps. */
    monospace?: boolean
  }>(),
  { rows: 8 }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const showPopup = ref(false)
const draft = ref('')
const textareaEl = ref<HTMLTextAreaElement | null>(null)

function open() {
  draft.value = props.modelValue ?? ''
  showPopup.value = true
  nextTick(() => textareaEl.value?.focus())
}

function apply() {
  emit('update:modelValue', draft.value)
  showPopup.value = false
}

function cancel() {
  showPopup.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (showPopup.value && e.key === 'Escape') cancel()
}

watch(showPopup, (open) => {
  if (open) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
})
</script>

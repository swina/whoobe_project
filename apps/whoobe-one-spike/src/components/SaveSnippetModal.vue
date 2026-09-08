<template>
  <div class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span class="text-xs font-semibold text-gray-600">{{ mode === 'update' ? 'Update snippet' : 'Save as snippet' }}</span>
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')"><X class="w-3.5 h-3.5" /> Close</button>
      </div>

      <form class="p-4 space-y-4 text-xs" @submit.prevent="submit">
        <div v-if="snippetsStore.items.length" class="flex gap-4 text-gray-600">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="new" v-model="mode" />
            New snippet
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="update" v-model="mode" />
            Update existing
          </label>
        </div>

        <div v-if="mode === 'update'">
          <label class="block font-semibold text-gray-600 mb-1">Snippet to update</label>
          <select
            v-model="targetSnippetId"
            required
            class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="" disabled>Choose a snippet…</option>
            <option v-for="s in snippetsStore.items" :key="s.id" :value="s.id">{{ s.icon || '📦' }} {{ s.category }} / {{ s.name }}</option>
          </select>
        </div>

        <div>
          <label class="block font-semibold text-gray-600 mb-1">Name</label>
          <input
            v-model="name"
            type="text"
            required
            placeholder="e.g. Hero with image"
            class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500 capitalize"
          />
        </div>

        <div>
          <label class="block font-semibold text-gray-600 mb-1">Category</label>
          <select v-model="categoryChoice" class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500">
            <option v-for="c in categoryOptions.sort()" :key="c" :value="c" class="capitalize">{{ c }}</option>
            <option value="__new__">+ New category…</option>
          </select>
          <input
            v-if="categoryChoice === '__new__'"
            v-model="newCategory"
            type="text"
            required
            placeholder="Category name"
            class="w-full mt-2 px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block font-semibold text-gray-600 mb-1">Icon</label>
          <div class="grid grid-cols-10 gap-1 mb-2">
            <button
              v-for="emoji in ICON_CHOICES"
              :key="emoji"
              type="button"
              class="w-7 h-7 flex items-center justify-center rounded-md border text-sm"
              :class="icon === emoji ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'"
              @click="icon = emoji"
            >
              {{ emoji }}
            </button>
          </div>
          <input
            v-model="icon"
            type="text"
            maxlength="4"
            placeholder="or type/paste any emoji"
            class="w-24 px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500 text-center"
          />
        </div>

        <div v-if="error" class="px-2 py-1.5 rounded-md bg-rose-50 border border-rose-200 text-rose-600">{{ error }}</div>

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold" @click="$emit('close')">
            Cancel
          </button>
          <button
            type="submit"
            :disabled="submitting"
            class="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50"
          >
            {{ submitting ? (mode === 'update' ? 'Updating…' : 'Saving…') : mode === 'update' ? 'Update snippet' : 'Save snippet' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
// Not a port - no equivalent exists in the source app for saving an
// arbitrary selected node (with its full subtree) as a reusable, named,
// categorized, drag-to-add snippet. Mirrors apps/whoobe-studio's own
// SaveSnippetModal.vue in spirit (same feature, different editor/node
// format - see snippets-api.ts's header for why they're separate backend
// tables).
//
// The category picker seeds its option list from the built-in element
// groups (editor.elements's own labels - "containers"/"text"/"media"/
// "form") plus whatever categories already exist among saved snippets, so
// a new snippet naturally slots into the same accordion sections
// BlockElementsPalette.vue already renders, without forcing every snippet
// into a brand new group. "+ New category…" reveals a free-text input for
// anything else.
//
// Icon is a plain emoji, not a Material Icons name (what the built-in
// element groups' own `icon` field holds - never rendered as a real icon
// anywhere in this app, unlike LucideIcon element instances, which do
// render a real icon via BlockElementPreview.vue's iconComponent - see
// BlockElementsPalette.vue's own comment) - an emoji renders correctly
// as-is with zero icon-font/icon-library dependency of its own.
//
// "Update existing" mode: without this, tweaking something minor about an
// already-saved snippet (e.g. spacing, a color) had no way back onto the
// same snippet - only "save a brand new one" existed, which meant near-
// duplicate snippets piling up for what's really the same thing with tiny
// variations. Picking a snippet to update pre-fills Name/Category/Icon
// from it (still editable - updating can also rename/recategorize) while
// the node always comes from whatever's currently selected in the canvas.
import { computed, onMounted, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { useEditorStore } from '../store/editor'
import { useSnippetsStore } from '../store/snippets'

const props = defineProps<{
  element: any
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const editor = useEditorStore()
const snippetsStore = useSnippetsStore()

// Deliberately still plain emoji, not converted to @lucide/vue like every
// fixed action icon elsewhere in this app was - these aren't this app's
// own UI chrome, they're user-authored *content* (the snippet's own stored
// icon, picked once and then rendered back verbatim wherever that snippet
// shows up - BlockElementsPalette.vue's chip, the `<option>` label above).
// Swapping this out would mean picking a fixed Lucide subset on the user's
// behalf instead of "any emoji you like," a real feature regression, not
// a visual refresh.
const ICON_CHOICES = ['📦', '🖼️', '📝', '🔘', '📋', '🎬', '🧩', '⭐', '🏷️', '📐', '🎨', '🔗', '📊', '🗂️', '✨', '🧱', '📄', '🖱️', '🎯', '🚀']

const mode = ref<'new' | 'update'>('new')
const targetSnippetId = ref('')
const name = ref('')
const categoryChoice = ref('containers')
const newCategory = ref('')
const icon = ref('📦')
const error = ref('')
const submitting = ref(false)

const categoryOptions = computed(() => {
  const builtIn = (editor.elements ?? []).map((g) => g.label)
  const fromSnippets = snippetsStore.items.map((s) => s.category)
  return Array.from(new Set([...builtIn, ...fromSnippets]))
})

watch(targetSnippetId, (id) => {
  const snippet = snippetsStore.items.find((s) => s.id === id)
  if (!snippet) return
  name.value = snippet.name
  categoryChoice.value = snippet.category
  icon.value = snippet.icon || '📦'
})

// Editing an existing snippet from admin-dashboard's Snippets list: the
// whole point of that workflow is tweaking *that* snippet, so the modal
// defaults to pre-selecting it in "Update existing" mode (name/category/
// icon pre-filled by the targetSnippetId watcher above) instead of
// starting as a blind "New snippet". "New snippet" stays fully available
// by toggling the radio, which clears the pre-filled name so a fresh one
// can be typed.
onMounted(() => {
  if (!editor.snippetMode || !editor.snippetId) return
  if (!snippetsStore.items.some((s) => s.id === editor.snippetId)) return
  mode.value = 'update'
  targetSnippetId.value = editor.snippetId
})

watch(
  () => mode.value,
  (m) => {
    if (m === 'new') name.value = ''
  }
)

async function submit() {
  error.value = ''
  const category = categoryChoice.value === '__new__' ? newCategory.value.trim() : categoryChoice.value
  if (!name.value.trim() || !category) return
  if (mode.value === 'update' && !targetSnippetId.value) {
    error.value = 'Choose a snippet to update'
    return
  }

  submitting.value = true
  try {
    // Deep-snapshot to plain JSON - strips Vue's reactivity proxy so what
    // gets stored (and later re-cloned on every drop, see BlockEditor.vue)
    // is an ordinary object graph, not a Proxy tied to this component's
    // lifetime.
    const node = JSON.parse(JSON.stringify(props.element))
    const input = { name: name.value.trim(), category, icon: icon.value || null, node }
    if (mode.value === 'update') {
      await snippetsStore.update(targetSnippetId.value, input)
    } else {
      await snippetsStore.save(input)
    }
    emit('close')
  } catch (e: any) {
    error.value = e?.message || 'Failed to save snippet'
  } finally {
    submitting.value = false
  }
}
</script>

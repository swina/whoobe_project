<template>
  <div class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span class="text-xs font-semibold text-gray-600">{{ modalTitle }}</span>
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')"><X class="w-3.5 h-3.5" /> Close</button>
      </div>

      <form class="p-4 space-y-4 text-xs" @submit.prevent="submit">
        <div v-if="props.element && snippetsStore.items.length" class="flex gap-4 text-gray-600">
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

        <div>
          <label class="block font-semibold text-gray-600 mb-1">Usage notes</label>
          <textarea
            v-model="notes"
            rows="3"
            placeholder="Optional — how/when to use this snippet, what it expects (e.g. a hero image, a CTA link)…"
            class="w-full px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-indigo-500"
          ></textarea>
          <p class="text-[10px] text-gray-400 mt-1">Shown from the snippets list and, once inserted, in the element's Advanced &gt; Info panel.</p>
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
import { nodeFromDocument, notifyParentSnippetSaved } from '../scripts/database-actions'

const props = defineProps<{
  // Omitted when there's nothing specific selected to save - the brand-new-
  // snippet flow (BlockEditor.vue auto-opens this modal for a freshly
  // created, never-saved snippet document, see its own comment) falls back
  // to the whole current document via nodeFromDocument() below rather than
  // erroring on an undefined element.
  element?: any
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
const notes = ref('')
const error = ref('')
const submitting = ref(false)

const categoryOptions = computed(() => {
  const builtIn = (editor.elements ?? []).map((g) => g.label)
  const fromSnippets = snippetsStore.items.map((s) => s.category)
  return Array.from(new Set([...builtIn, ...fromSnippets]))
})

// No element given at all means this is the brand-new-snippet flow
// (BlockEditor.vue auto-opens this modal for a freshly created, never-
// saved snippet document) rather than "save this selected block as a
// snippet" - "New snippet" reads correctly for that case regardless of
// `mode`, since the "Update existing" toggle is hidden in the template
// when there's no element to offer as an alternative to it.
const modalTitle = computed(() => (mode.value === 'update' ? 'Update snippet' : props.element ? 'Save as snippet' : 'New snippet'))

watch(targetSnippetId, (id) => {
  const snippet = snippetsStore.items.find((s) => s.id === id)
  if (!snippet) return
  name.value = snippet.name
  categoryChoice.value = snippet.category
  icon.value = snippet.icon || '📦'
  notes.value = snippet.notes || ''
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
    if (m === 'new') {
      name.value = ''
      notes.value = ''
    }
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
    // No element selected - the brand-new-snippet flow - falls back to
    // the whole current document, unwrapped the same way saveSnippet()
    // (BlockEditor.vue's own top-bar Save, in snippet mode) unwraps it, so
    // both paths store the identical shape for a snippet with no explicit
    // sub-selection.
    const rawNode = props.element ?? nodeFromDocument(editor.document)
    // Deep-snapshot to plain JSON - strips Vue's reactivity proxy so what
    // gets stored (and later re-cloned on every drop, see BlockEditor.vue)
    // is an ordinary object graph, not a Proxy tied to this component's
    // lifetime.
    const node = JSON.parse(JSON.stringify(rawNode))
    const input = { name: name.value.trim(), category, icon: icon.value || null, node, notes: notes.value.trim() || null }
    // Whether this save is naming/updating the editor's own open document
    // (no specific element given) rather than carving an unrelated
    // sub-block out as a separate saved snippet - see
    // notifyParentSnippetSaved()'s own comment for why this matters (only
    // an own-document *create* should ever rekey a dashboard tab).
    const isOwnDocument = !props.element
    if (mode.value === 'update') {
      // Only reachable with an element given - the "Update existing" radio
      // is hidden in the template otherwise (see the `v-if` above it).
      const updated = await snippetsStore.update(targetSnippetId.value, input)
      notifyParentSnippetSaved({ id: updated.id, name: updated.name, category: updated.category, created: false, ownDocument: isOwnDocument })
    } else {
      const created = await snippetsStore.save(input)
      // No element given means this modal *is* the current snippet
      // document being named for the first time (not a separate reusable
      // block carved out of a bigger page) - point editor.page/snippetId
      // at the row we just created so the top-bar Save button updates it
      // in place afterward instead of creating a second, duplicate
      // snippet the next time it's clicked.
      if (isOwnDocument && editor.page && !editor.page.id) {
        editor.page.id = created.id
        editor.page.name = created.name
        editor.page.category = created.category
        editor.setSnippetId(created.id)
      }
      // Notify the embedding admin-dashboard the same way saveSnippet()
      // (the top-bar Save button, in snippet mode) already does - without
      // this, the Snippets list stays stale and, for the brand-new-snippet
      // flow, the tab never rekeys off its `new:<uuid>` placeholder id
      // (SnippetEditorEmbed.vue's own listener).
      notifyParentSnippetSaved({ id: created.id, name: created.name, category: created.category, created: true, ownDocument: isOwnDocument })
    }
    emit('close')
  } catch (e: any) {
    error.value = e?.message || 'Failed to save snippet'
  } finally {
    submitting.value = false
  }
}
</script>

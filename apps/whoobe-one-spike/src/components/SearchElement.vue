<template>
  <!-- Outer div = the element's container - the element's own custom
       classes land here via fallthrough (a plain block div fills its
       parent by default, so no baked-in width fights a custom w-*/max-w-*),
       and the <form> inside stays w-full by default. The look of the
       input/button/dropdown comes entirely from searchConfig's
       inputClass/buttonClass/dropdownClass (pre-filled defaults, editable
       and removable from SearchConfigControl) - no hardcoded styling that
       the editor can't remove. Only structural layout classes are hardcoded
       here (flex row sizing, dropdown positioning). -->
  <div class="relative">
    <form class="w-full" @submit.prevent="onSubmit">
      <div class="relative flex w-full">
        <input
          v-model="q"
          type="search"
          :placeholder="placeholder"
          aria-label="Search"
          autocomplete="off"
          :class="inputClass"
          class="flex-1 min-w-0"
          @input="onInput"
          @focus="onFocus"
          @blur="onBlur"
          @keydown.esc="closeDropdown"
        />
        <button
          type="submit"
          :class="buttonClass"
          :aria-label="buttonLabel"
          class="inline-flex shrink-0 items-center justify-center"
        >
          <svg v-if="buttonIcon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path
              fill-rule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
              clip-rule="evenodd"
            />
          </svg>
          <span v-else>{{ buttonLabel }}</span>
        </button>

        <!-- Live results dropdown - search-element-plan.md. Sits below the
             box, scoped by the same searchConfig (types/classes), and is
             styled by searchConfig.dropdownClass (blank = no styling).
             @mousedown.prevent keeps the input focused so the dropdown
             doesn't close before a result's click registers. -->
        <div
          v-if="showDropdown"
          :class="dropdownClass"
          class="absolute left-0 right-0 top-full mt-1 overflow-hidden text-left z-10000"
          @mousedown.prevent
        >
          <p v-if="loading" class="px-3 py-2 text-xs text-gray-400">Searching…</p>
          <p v-else-if="error" class="px-3 py-2 text-xs text-rose-500">{{ error }}</p>
          <p v-else-if="results.length === 0" class="px-3 py-2 text-xs text-gray-400">No results</p>
          <ul v-else>
            <li v-for="result in results" :key="`${result.type}-${result.id}`">
              <a
                :href="result.url ?? result.path"
                class="flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-100"
                @click="onResultClick"
              >
                <span class="min-w-0 truncate text-sm text-gray-800" v-html="highlight(result.title)"></span>
                <span
                  class="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                  :class="typeBadgeClass(result.type)"
                >
                  {{ result.type }}
                </span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { highlightSearchSnippet } from '@whoobe-cms/core'
// Live website search box for the spike editor (docs/plans/search-engine/
// search-element-plan.md) - the render target for the palette's "Search"
// element (tag === 'search'). Two behaviours, both scoped by `searchConfig`
// (authored in the Advanced tab's SearchConfigControl): a debounced live
// dropdown of results as you type, and (on submit) navigation to the spike's
// /search route. The dropdown is styled by searchConfig.dropdownClass over a
// built-in default. Rendered on the canvas, the preview and the public page
// alike via the global registration in main.ts; while on the editing canvas
// (:editing) it never fetches/submits.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { searchContent, type SearchDocumentType, type SearchResult } from '../search-api'
import { Search } from '@lucide/vue'

const props = defineProps<{
  config?: {
    types?: { page?: boolean; object?: boolean; asset?: boolean; class?: boolean }
    classIds?: string[]
    dropdownClass?: string
    inputClass?: string
    buttonClass?: string
    buttonLabel?: string
    buttonIcon?: boolean
  }
  placeholder?: string | null
  /** True while shown on the editing canvas (BlockElement.vue) - the
   *  editor is select-and-customize only, so searching there must not
   *  fetch or navigate. */
  editing?: boolean
}>()

const router = useRouter()
const q = ref('')
const results = ref<SearchResult[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const showDropdown = ref(false)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let blurTimer: ReturnType<typeof setTimeout> | null = null

const placeholder = computed(() => props.placeholder || 'Search…')

// The scope params derived from searchConfig, shared by the dropdown fetch
// and the /search navigation. type is null when nothing is enabled (the
// endpoint then searches everything), a single value when one, or the
// comma-separated list when several. classId only when exactly one class is
// selected (the public endpoint filters a single class).
const scopeParams = computed(() => {
  const types = props.config?.types ?? { page: true, object: true, asset: false }
  const enabled = (['page', 'object', 'class', 'asset'] as const).filter((t) => types[t])
  const classIds = props.config?.classIds ?? []
  return {
    type:
      enabled.length === 1 ? (enabled[0] as SearchDocumentType) : enabled.length > 1 ? ([...enabled] as SearchDocumentType[]) : null,
    classId: classIds.length === 1 ? classIds[0] : null,
  }
})

// The /search route query value - comma-separated when several types are
// enabled (single value when one, omitted when none).
const routeTypes = computed(() => {
  const type = scopeParams.value.type
  if (!type) return undefined
  return Array.isArray(type) ? type.join(',') : type
})

const dropdownClass = computed(() => props.config?.dropdownClass?.trim() ?? '')

// The searchConfig classes are the input/button/dropdown's styling - the
// Search() builder pre-fills sensible defaults, and SearchConfigControl lets
// the admin change or clear them (blank = no styling). The element's own
// custom classes land on the <form> root via fallthrough.
const inputClass = computed(() => props.config?.inputClass?.trim() ?? '')
const buttonClass = computed(() => props.config?.buttonClass?.trim() ?? '')
const buttonLabel = computed(() => props.config?.buttonLabel?.trim() || 'Search')
const buttonIcon = computed(() => !!props.config?.buttonIcon)

async function runSearch() {
  const query = q.value.trim()
  // The dropdown fetches even while :editing (it's a read-only public
  // search - the admin needs to see it live to manage dropdownClass) -
  // only submit/navigation are gated on editing.
  if (query.length < 2) {
    results.value = []
    showDropdown.value = false
    return
  }
  loading.value = true
  error.value = null
  showDropdown.value = true
  try {
    const res = await searchContent({
      q: query,
      page: 1,
      pageSize: 8,
      type: scopeParams.value.type,
      classId: scopeParams.value.classId,
    })
    results.value = res.results
  } catch (e: any) {
    error.value = e.message || 'Search failed'
    results.value = []
  } finally {
    loading.value = false
  }
}

function onResultClick(e: MouseEvent) {
  // Editing canvas is select-and-customize only - never navigate away.
  if (props.editing) e.preventDefault()
}

function onInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runSearch, 300)
}

function onFocus() {
  if (q.value.trim().length >= 2) showDropdown.value = true
}

function onBlur() {
  // Close shortly after so a click inside the dropdown (mousedown.prevent
  // keeps focus, but a result anchor still fires its click) lands first.
  if (blurTimer) clearTimeout(blurTimer)
  blurTimer = setTimeout(() => {
    showDropdown.value = false
  }, 150)
}

function closeDropdown() {
  showDropdown.value = false
}

function onSubmit() {
  if (props.editing) return
  const query = q.value.trim()
  if (query.length < 2) return
  router.push({ name: 'Search', query: { q: query, type: routeTypes.value, classId: scopeParams.value.classId ?? undefined } })
}

// The server renders highlight markup (<em>) via ts_headline; strip any
// stray markup and convert to <mark> (same as SearchResultsView.vue).
function highlight(text: string): string {
  return highlightSearchSnippet(text, '<mark class="bg-amber-100 text-inherit">')
}

function typeBadgeClass(type: string): string {
  if (type === 'page') return 'bg-violet-100 text-violet-700'
  if (type === 'class') return 'bg-emerald-100 text-emerald-700'
  if (type === 'asset') return 'bg-amber-100 text-amber-700'
  return 'bg-blue-100 text-blue-700'
}
</script>

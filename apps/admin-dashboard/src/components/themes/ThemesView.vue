<template>
  <div class="h-full flex flex-col p-6">
    <!-- List view -->
    <template v-if="!editing">
      <div class="flex items-center justify-between mb-4 shrink-0">
        <h2 class="text-lg font-bold text-slate-100 light:text-slate-900">Themes</h2>
        <button type="button" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold" @click="addTheme">+ New Theme</button>
      </div>

      <div v-if="loading" class="flex-1 flex items-center justify-center text-xs text-slate-500">Loading themes…</div>
      <div v-else-if="error" class="flex-1 flex items-center justify-center text-xs text-rose-500">{{ error }}</div>
      <div v-else-if="themes.length === 0" class="flex-1 flex items-center justify-center text-xs text-slate-500 italic">No themes yet. Create one!</div>

      <div v-else class="flex-1 min-h-0 overflow-y-auto space-y-2">
        <div
          v-for="t in themes"
          :key="t.id"
          class="flex items-center justify-between px-4 py-3 rounded-lg border border-slate-800 light:border-slate-200 bg-slate-900/40 light:bg-white/40"
        >
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold text-slate-200 light:text-slate-800 truncate">{{ t.name }}</div>
            <div class="text-[11px] text-slate-500 mt-0.5 font-mono truncate">
              <span v-if="t.colors.length">{{ t.colors.length }} colors</span>
              <span v-if="t.colors.length && t.fonts.length" class="mx-1">·</span>
              <span v-if="t.fonts.length">{{ t.fonts.length }} fonts</span>
              <span v-if="!t.colors.length && !t.fonts.length" class="italic">no colors or fonts defined</span>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0 ml-3">
            <button type="button" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white" @click="editTheme(t)">Edit</button>
            <button type="button" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 border border-rose-500/30 hover:border-rose-500/60" @click="removeTheme(t.id)">Delete</button>
          </div>
        </div>
      </div>
    </template>

    <!-- Edit view -->
    <template v-else-if="draft">
      <div class="flex items-center gap-2 mb-4 shrink-0">
        <button type="button" class="text-xs text-slate-400 hover:text-slate-200 light:hover:text-slate-800 flex items-center gap-1" @click="editing = false">
          ← Back
        </button>
        <h2 class="text-lg font-bold text-slate-100 light:text-slate-900">{{ draft.name }}</h2>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto space-y-4">
        <div class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-900/40 light:bg-white/40 p-4">
          <label class="block mb-1">
            <span class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Name</span>
          </label>
          <input v-model="draft.name" type="text" class="w-full text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded px-2 py-1.5 text-slate-200 light:text-slate-800" />
        </div>

        <div class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-900/40 light:bg-white/40 p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Colors</span>
            <button type="button" class="text-[10px] text-indigo-400 hover:text-indigo-300" @click="addColor(draft)">+ Add</button>
          </div>
          <div v-for="(c, i) in draft.colors" :key="i" class="flex items-center gap-2 mb-1">
            <input v-model="c.name" type="text" placeholder="name" class="flex-1 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded px-2 py-1 text-slate-200 light:text-slate-800" />
            <input v-model="c.hex" type="color" class="w-7 h-7 rounded border border-slate-700 cursor-pointer" />
            <span class="text-[10px] text-slate-500 font-mono w-14">{{ c.hex }}</span>
            <button type="button" class="text-rose-400 hover:text-rose-300 text-xs" @click="removeColor(draft, i)">✕</button>
          </div>
        </div>

        <div class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-900/40 light:bg-white/40 p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Fonts</span>
            <div class="flex items-center gap-1">
              <input v-model="newFont" type="text" placeholder="Font name" class="text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded px-2 py-1 text-slate-200 light:text-slate-800 w-32" @keydown.enter="addFont(draft)" />
              <button type="button" class="text-[10px] text-indigo-400 hover:text-indigo-300" @click="addFont(draft)">+ Add</button>
            </div>
          </div>
          <div v-for="(f, i) in draft.fonts" :key="i" class="flex items-center gap-2 mb-0.5">
            <span class="text-xs text-slate-300 flex-1">{{ f.replace('+', ' ') }}</span>
            <button type="button" class="text-rose-400 hover:text-rose-300 text-xs" @click="draft.fonts.splice(i, 1)">✕</button>
          </div>
        </div>

        <div class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-900/40 light:bg-white/40 p-4">
          <span class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Custom Styles</span>
          <textarea
            v-model="draft.styles"
            class="mt-2 w-full text-xs font-mono bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded px-2 py-1.5 text-slate-200 light:text-slate-800 min-h-[250px] resize-y"
            placeholder="/* CSS rules */ .my-class { color: red; }"
            @blur="validateStyles"
          ></textarea>
          <div v-if="styleError" class="text-[10px] text-rose-400 mt-0.5">{{ styleError }}</div>
        </div>

        <div class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-900/40 light:bg-white/40 p-4">
          <span class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Tailwind Custom Classes</span>
          <textarea
            v-model="draft.tailwindClasses"
            class="mt-2 w-full text-xs font-mono bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded px-2 py-1.5 text-slate-200 light:text-slate-800 min-h-[120px] resize-y"
            placeholder="space-separated Tailwind utility classes, e.g.&#10;shadow-lg rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600"
          ></textarea>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-4 shrink-0">
        <button type="button" class="text-xs px-4 py-2 rounded border border-slate-700 light:border-slate-300 text-slate-300 light:text-slate-700 hover:bg-slate-800 light:hover:bg-slate-100" :disabled="saving" @click="editing = false">Cancel</button>
        <button type="button" class="text-xs px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50" :disabled="saving" @click="saveTheme">{{ saving ? 'Saving…' : 'Save' }}</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import { fetchThemes, createTheme, updateTheme, deleteTheme, type ThemeRecord } from '../../utils/themes-api'

const loading = ref(true)
const error = ref('')
const themes = ref<ThemeRecord[]>([])
const editing = ref(false)
const draft = ref<ThemeRecord | null>(null)
const newFont = ref('')
const saving = ref(false)
const styleError = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    themes.value = await fetchThemes(getDefaultCoreApiUrl())
  } catch (e: any) {
    error.value = e?.message || 'Failed to load themes'
  } finally {
    loading.value = false
  }
}

async function addTheme() {
  const name = prompt('Theme name:', '')
  if (!name?.trim()) return
  try {
    const created = await createTheme(getDefaultCoreApiUrl(), { name: name.trim() })
    themes.value.push(created)
  } catch (e: any) {
    alert(e?.message || 'Failed to create theme')
  }
}

function editTheme(t: ThemeRecord) {
  // Deep copy so an in-progress edit can be cancelled without touching the list.
  draft.value = JSON.parse(JSON.stringify(t))
  newFont.value = ''
  styleError.value = ''
  editing.value = true
}

async function removeTheme(themeId: string) {
  if (!confirm('Delete this theme?')) return
  try {
    await deleteTheme(getDefaultCoreApiUrl(), themeId)
    themes.value = themes.value.filter((t) => t.id !== themeId)
  } catch (e: any) {
    alert(e?.message || 'Failed to delete theme')
  }
}

function addColor(t: ThemeRecord) {
  t.colors.push({ name: `color-${t.colors.length + 1}`, hex: '#6366f1' })
}

function removeColor(t: ThemeRecord, i: number) {
  t.colors.splice(i, 1)
}

function addFont(t: ThemeRecord) {
  const input = newFont.value
  if (!input?.trim()) return
  const value = input.trim().replaceAll(' ', '+')
  if (!t.fonts.includes(value)) t.fonts.push(value)
  newFont.value = ''
}

function validateStyles() {
  if (!draft.value) return
  const s = draft.value.styles?.trim()
  if (!s) {
    styleError.value = ''
    return
  }
  const open = (s.match(/\{/g) || []).length
  const close = (s.match(/\}/g) || []).length
  styleError.value = open !== close ? `Unbalanced braces: ${open} opening, ${close} closing` : ''
}

async function saveTheme() {
  if (!draft.value) return
  validateStyles()
  if (styleError.value) return
  saving.value = true
  try {
    const updated = await updateTheme(getDefaultCoreApiUrl(), draft.value.id, {
      name: draft.value.name,
      colors: draft.value.colors,
      fonts: draft.value.fonts,
      styles: draft.value.styles,
      tailwindClasses: draft.value.tailwindClasses,
    })
    const idx = themes.value.findIndex((t) => t.id === updated.id)
    if (idx !== -1) themes.value[idx] = updated
    editing.value = false
  } catch (e: any) {
    alert(e?.message || 'Failed to save theme')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
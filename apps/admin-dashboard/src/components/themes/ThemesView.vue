<template>
  <div class="h-full flex flex-col p-6">
    <div class="flex items-center justify-between mb-4 shrink-0">
      <h2 class="text-lg font-bold text-slate-100 light:text-slate-900">Themes</h2>
      <button type="button" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold" @click="addTheme">+ New Theme</button>
    </div>

    <div v-if="loading" class="flex-1 flex items-center justify-center text-xs text-slate-500">Loading themes…</div>
    <div v-else-if="error" class="flex-1 flex items-center justify-center text-xs text-rose-500">{{ error }}</div>
    <div v-else-if="themes.length === 0" class="flex-1 flex items-center justify-center text-xs text-slate-500 italic">No themes yet. Create one!</div>

    <div v-else class="flex-1 min-h-0 overflow-y-auto space-y-3">
      <div v-for="t in themes" :key="t.id" class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-900/40 light:bg-white/40 p-4">
        <div class="flex items-center justify-between mb-3">
          <input v-model="t.name" type="text" class="text-sm font-semibold bg-transparent border-none text-slate-200 light:text-slate-800 focus:outline-none focus:ring-0 flex-1" @change="saveThemeName(t)" />
          <button type="button" class="text-rose-400 hover:text-rose-300 text-xs" @click="removeTheme(t.id)">Delete</button>
        </div>

        <div class="space-y-2">
          <!-- Colors -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Colors</span>
              <button type="button" class="text-[10px] text-indigo-400 hover:text-indigo-300" @click="addColor(t)">+ Add</button>
            </div>
            <div v-for="(c, i) in t.colors" :key="i" class="flex items-center gap-2 mb-1">
              <input v-model="c.name" type="text" placeholder="name" class="flex-1 text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded px-2 py-1 text-slate-200 light:text-slate-800" />
              <input v-model="c.hex" type="color" class="w-7 h-7 rounded border border-slate-700 cursor-pointer" />
              <span class="text-[10px] text-slate-500 font-mono w-14">{{ c.hex }}</span>
              <button type="button" class="text-rose-400 hover:text-rose-300 text-xs" @click="removeColor(t, i)">✕</button>
            </div>
          </div>

          <!-- Fonts -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Fonts</span>
              <div class="flex items-center gap-1">
                <input v-model="newFontInputs[t.id]" type="text" placeholder="Font name" class="text-xs bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded px-2 py-1 text-slate-200 light:text-slate-800 w-32" @keydown.enter="addFont(t)" />
                <button type="button" class="text-[10px] text-indigo-400 hover:text-indigo-300" @click="addFont(t)">+ Add</button>
              </div>
            </div>
            <div v-for="(f, i) in t.fonts" :key="i" class="flex items-center gap-2 mb-0.5">
              <span class="text-xs text-slate-300 flex-1">{{ f.replace('+', ' ') }}</span>
              <button type="button" class="text-rose-400 hover:text-rose-300 text-xs" @click="removeFont(t, i)">✕</button>
            </div>
          </div>

          <!-- Custom Styles -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Custom Styles</span>
            </div>
            <textarea
              v-model="t.styles"
              class="w-full text-xs font-mono bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded px-2 py-1.5 text-slate-200 light:text-slate-800 min-h-[450px] resize-y"
              placeholder="/* CSS rules */ .my-class { color: red; }"
              @blur="validateStyles(t)"
            ></textarea>
            <div v-if="styleErrors[t.id]" class="text-[10px] text-rose-400 mt-0.5">{{ styleErrors[t.id] }}</div>
          </div>

          <!-- Tailwind Custom Classes -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Tailwind Custom Classes</span>
            </div>
            <textarea
              v-model="t.tailwindClasses"
              class="w-full text-xs font-mono bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded px-2 py-1.5 text-slate-200 light:text-slate-800 min-h-[200px] resize-y"
              placeholder="space-separated Tailwind utility classes, e.g.&#10;shadow-lg rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600"
            ></textarea>
          </div>
        </div>

        <div class="flex justify-end pt-2">
          <button type="button" class="text-xs px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50" :disabled="savingIds.has(t.id)" @click="saveTheme(t)">{{ savingIds.has(t.id) ? 'Saving…' : 'Save' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import { fetchThemes, createTheme, updateTheme, deleteTheme, type ThemeRecord } from '../../utils/themes-api'

const loading = ref(true)
const error = ref('')
const themes = ref<ThemeRecord[]>([])
const newFontInputs = ref<Record<string, string>>({})
const savingIds = ref<Set<string>>(new Set())
const styleErrors = ref<Record<string, string>>({})

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

async function removeTheme(themeId: string) {
  if (!confirm('Delete this theme?')) return
  try {
    await deleteTheme(getDefaultCoreApiUrl(), themeId)
    themes.value = themes.value.filter((t) => t.id !== themeId)
  } catch (e: any) {
    alert(e?.message || 'Failed to delete theme')
  }
}

async function saveThemeName(t: ThemeRecord) {
  try {
    await updateTheme(getDefaultCoreApiUrl(), t.id, { name: t.name })
  } catch {
    // Silent
  }
}

function addColor(t: ThemeRecord) {
  t.colors.push({ name: `color-${t.colors.length + 1}`, hex: '#6366f1' })
}

function removeColor(t: ThemeRecord, i: number) {
  t.colors.splice(i, 1)
}

function addFont(t: ThemeRecord) {
  const input = newFontInputs.value[t.id]
  if (!input?.trim()) return
  const value = input.trim().replaceAll(' ', '+')
  if (!t.fonts.includes(value)) t.fonts.push(value)
  newFontInputs.value[t.id] = ''
}

function removeFont(t: ThemeRecord, i: number) {
  t.fonts.splice(i, 1)
}

function validateStyles(t: ThemeRecord) {
  const s = t.styles?.trim()
  if (!s) {
    delete styleErrors.value[t.id]
    return
  }
  // Basic validation: check for balanced braces and reasonable syntax.
  const open = (s.match(/\{/g) || []).length
  const close = (s.match(/\}/g) || []).length
  if (open !== close) {
    styleErrors.value[t.id] = `Unbalanced braces: ${open} opening, ${close} closing`
    return
  }
  delete styleErrors.value[t.id]
}

async function saveTheme(t: ThemeRecord) {
  const ids = savingIds.value
  ids.add(t.id)
  savingIds.value = new Set(ids)
  try {
    validateStyles(t)
    await updateTheme(getDefaultCoreApiUrl(), t.id, {
      colors: t.colors,
      fonts: t.fonts,
      styles: t.styles,
      tailwindClasses: t.tailwindClasses,
    })
  } catch (e: any) {
    alert(e?.message || 'Failed to save theme')
  } finally {
    const ids2 = savingIds.value
    ids2.delete(t.id)
    savingIds.value = new Set(ids2)
  }
}

onMounted(load)
</script>
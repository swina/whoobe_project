<template>
  <div class="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-6" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <span class="font-semibold text-gray-700 text-sm">Theme</span>
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')">
          <X class="w-3.5 h-3.5" /> Close
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        <!-- Website themes selector -->
        <section v-if="themeLoading" class="space-y-2">
          <p class="text-[11px] text-gray-400 text-center py-4">Loading themes…</p>
        </section>
        <section v-else-if="themeList.length" class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Themes</h3>
          <p class="text-[11px] text-gray-400">Choose a theme for this page, or customize per-page below.</p>
          <div class="flex flex-col gap-1">
            <button
              v-for="t in themeList"
              :key="t.id"
              type="button"
              class="flex items-center gap-2 text-xs border rounded px-3 py-2 text-left transition"
              :class="selectedThemeId === t.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'"
              @click="pickTheme(t.id)"
            >
              <span class="w-3 h-3 rounded-full shrink-0" :class="selectedThemeId === t.id ? 'bg-indigo-500' : 'border border-gray-300'"></span>
              <span class="font-medium text-gray-700">{{ t.name }}</span>
              <span class="text-gray-400 ml-auto">{{ t.colors.length }} colors, {{ t.fonts.length }} fonts</span>
            </button>
          </div>
        </section>

        <hr class="border-gray-200" />

        <!-- Per-page overrides: colors -->
        <section class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Page custom colors</h3>
          <p class="text-[11px] text-gray-400">Added as extra swatches on every color picker for this page, overriding the website theme when same name.</p>

          <div v-if="colors.length" class="flex flex-col gap-1.5">
            <div v-for="(color, i) in colors" :key="i" class="flex items-center gap-2">
              <input type="color" class="w-7 h-7 rounded border shrink-0 cursor-pointer" :value="color.hex" @input="setHex(i, ($event.target as HTMLInputElement).value)" />
              <input
                type="text"
                class="flex-1 text-xs border rounded px-1.5 py-1"
                placeholder="name"
                :value="color.name"
                @change="setName(i, ($event.target as HTMLInputElement).value)"
              />
              <button type="button" title="Remove" class="text-gray-400 hover:text-rose-500 shrink-0" @click="removeColor(i)">
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <p v-else class="text-[11px] text-gray-400 italic">No custom colors yet.</p>

          <button type="button" class="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" @click="addColor">+ Add color</button>
        </section>

        <!-- Per-page overrides: fonts -->
        <section class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Page font list</h3>
          <p class="text-[11px] text-gray-400">When set, overrides the website theme's font list for this page.</p>

          <div class="flex flex-col gap-1">
            <div v-for="font in fonts" :key="font" class="flex items-center gap-2">
              <span class="flex-1 text-xs truncate" :style="{ fontFamily: font.replaceAll('+', ' ') }">{{ font.replaceAll('+', ' ') }}</span>
              <button type="button" title="Remove" class="text-gray-400 hover:text-rose-500 shrink-0" @click="removeFont(font)">
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <input
              v-model="newFont"
              type="text"
              placeholder="e.g. Playfair Display"
              class="flex-1 text-xs border rounded px-1.5 py-1"
              @keydown.enter="addFont"
            />
            <button type="button" class="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 shrink-0" @click="addFont">+ Add</button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { X } from '@lucide/vue'
import { useEditorStore } from '../store/editor'

defineEmits<{ close: [] }>()
const editor = useEditorStore()
const newFont = ref('')

// Load themes from the new independent themes API.
const themeList = ref<{ id: string; name: string; colors: { name: string; hex: string }[]; fonts: string[]; styles: string; tailwindClasses: string }[]>([])
const themeLoading = ref(true)

async function loadThemes() {
  try {
    const baseUrl = typeof window !== 'undefined' && window.location?.hostname
      ? `${window.location.protocol}//${window.location.hostname}:3003`
      : 'http://localhost:3003'
    const res = await fetch(`${baseUrl}/whoobe-one/themes`, { credentials: 'include' })
    if (!res.ok) return
    const body = await res.json()
    themeList.value = (body.themes ?? []).map((t: any) => ({ ...t, styles: t.styles ?? '', tailwindClasses: t.tailwindClasses ?? '' }))
  } catch {
    // Silent
  } finally {
    themeLoading.value = false
  }
}

const selectedThemeId = ref<string>('')

function init() {
  if (!themeList.value.length) return
  const active = editor.websiteTheme
  const match = themeList.value.find(
    (t) => JSON.stringify(t.colors) === JSON.stringify(active.colors) && JSON.stringify(t.fonts) === JSON.stringify(active.fonts)
  )
  selectedThemeId.value = match?.id ?? themeList.value[0]?.id ?? ''
}
init()

function pickTheme(id: string) {
  selectedThemeId.value = id
  const t = themeList.value.find((t) => t.id === id)
  if (t) {
    editor.setWebsiteTheme({ colors: t.colors ?? [], fonts: t.fonts ?? [], styles: t.styles ?? '', tailwindClasses: t.tailwindClasses ?? '' })
  }
}

onMounted(loadThemes)

// Per-page overrides (existing document.theme logic, unchanged).
function ensureTheme() {
  const doc = editor.document as any
  if (!doc) return null
  if (!doc.theme) doc.theme = { colors: [], fonts: [] }
  return doc.theme
}

function ensureFonts() {
  const theme = ensureTheme()
  if (!theme) return null
  if (!theme.fonts.length) theme.fonts = [...editor.fonts]
  return theme
}

const colors = computed(() => (editor.document as any)?.theme?.colors ?? [])

function addColor() {
  const theme = ensureTheme()
  if (!theme) return
  theme.colors.push({ name: `color-${theme.colors.length + 1}`, hex: '#6366f1' })
}

function setHex(i: number, hex: string) {
  const theme = ensureTheme()
  if (!theme?.colors[i]) return
  theme.colors[i].hex = hex
}

function setName(i: number, name: string) {
  const theme = ensureTheme()
  if (!theme?.colors[i]) return
  theme.colors[i].name = name.trim() || theme.colors[i].name
}

function removeColor(i: number) {
  const theme = ensureTheme()
  if (!theme) return
  theme.colors.splice(i, 1)
}

const fonts = computed(() => (editor.document as any)?.theme?.fonts?.length ? (editor.document as any).theme.fonts : editor.fonts)

function addFont() {
  const name = newFont.value.trim()
  if (!name) return
  const theme = ensureFonts()
  if (!theme) return
  const value = name.replaceAll(' ', '+')
  if (!theme.fonts.includes(value)) theme.fonts.push(value)
  newFont.value = ''
}

function removeFont(font: string) {
  const theme = ensureFonts()
  if (!theme) return
  theme.fonts = theme.fonts.filter((f: string) => f !== font)
}
</script>
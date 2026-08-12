<template>
  <div class="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-6" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <span class="font-semibold text-gray-700 text-sm">Page Theme</span>
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')">
          <X class="w-3.5 h-3.5" /> Close
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        <section class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Custom colors</h3>
          <p class="text-[11px] text-gray-400">Added as extra swatches on every Text/Background/Border/Gradient color picker for this page.</p>

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

        <section class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Fonts</h3>
          <p class="text-[11px] text-gray-400">The font list offered by the Font picker (Style tab) for this page - starts from the site default list.</p>

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
// Per-page design tokens (this session's "review system colors, add a
// user-defined theme" request) - a modal rather than a per-element
// Advanced-panel tab (TailwindCustomizer.vue/AdvancedPanel.vue's own
// tabs), since a theme is document-scoped, not selection-scoped, matching
// how TemplateGalleryModal.vue is the document-scoped counterpart to the
// per-element FloatingToolbar.vue popovers. Opened from a new "Theme"
// topbar button in BlockEditor.vue, next to Templates/Save Template.
//
// Colors live at editor.document.theme.colors (see ElementsClass.d.ts's
// own comment on `theme` for why it's optional/lazily created) and are
// applied by ColorControl.vue/BgGradientControl.vue as Tailwind v4
// arbitrary-value classes (`bg-[#3366ff]`) - no `@theme` CSS registration
// needed, the live `@tailwindcss/browser` runtime already compiles
// arbitrary bracket values for any class (style.css's own header comment).
import { computed, ref } from 'vue'
import { X } from '@lucide/vue'
import { useEditorStore } from '../store/editor'

defineEmits<{ close: [] }>()
const editor = useEditorStore()
const newFont = ref('')

function ensureTheme() {
  const doc = editor.document as any
  if (!doc) return null
  if (!doc.theme) doc.theme = { colors: [], fonts: [] }
  return doc.theme
}

// Fonts specifically seed from the build-time default list (editor.fonts)
// the first time this page's own list is touched, not from empty - so
// customizing fonts is additive/subtractive from what a page already had,
// never a jarring "everything disappeared" reset. Colors have no
// equivalent default list to seed from (there was never a built-in custom
// color set), hence ensureTheme() alone for those.
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

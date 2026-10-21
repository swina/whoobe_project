<template>
  <div class="space-y-4" data-testid="palettes-manager">
      <p class="text-xs text-slate-400 light:text-slate-600">
        A palette is eight colours, each with one job. The four built-in ones cannot be changed: copy one to make a palette of your own. A palette is used as it is: if some
        colours are hard to read the wizard tells you, it does not change them.
      </p>

      <!-- the list -->
      <div v-if="!draft" class="space-y-4">
        <div class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Yours</h3>
          <div v-if="palettes.length === 0" class="text-xs italic text-slate-500">No palette of your own yet.</div>
          <div v-for="p in palettes" :key="p.id" class="flex items-center gap-3 rounded-lg border border-slate-800 light:border-slate-200 px-3 py-2" :data-testid="`palette-row-${p.id}`">
            <div class="flex shrink-0 overflow-hidden rounded border border-slate-700">
              <span v-for="role in ROLES" :key="role" class="h-6 w-4" :style="{ background: p.palette[role] }" :title="role"></span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-slate-200 light:text-slate-800">{{ p.name }}</div>
              <div v-if="p.warnings.length" class="text-[11px] text-amber-400">{{ p.warnings.length }} colour {{ p.warnings.length === 1 ? 'pair is' : 'pairs are' }} hard to read</div>
            </div>
            <button class="btn btn-link" :data-testid="`palette-edit-${p.id}`" @click="edit(p)">Edit</button>
            <button class="btn btn-link" @click="copy(p.palette, `${p.name} copy`)">Copy</button>
            <button class="btn btn-link-danger" :data-testid="`palette-delete-${p.id}`" @click="remove(p)">Delete</button>
          </div>
          <button class="btn btn-primary" data-testid="palette-new" @click="copy(blank, '')">+ New palette</button>
        </div>

        <!-- the palettes of the system, for reference: they cannot be changed or deleted, only copied -->
        <div class="space-y-2" data-testid="palettes-builtin">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Built-in <span class="normal-case tracking-normal text-slate-500">· cannot be changed, copy one to make your own</span></h3>
          <div v-for="t in options.themes" :key="t.id" class="flex items-center gap-3 rounded-lg border border-slate-800/70 light:border-slate-200 px-3 py-2 opacity-90" :data-testid="`palette-builtin-${t.id}`">
            <div class="flex shrink-0 overflow-hidden rounded border border-slate-700">
              <span v-for="role in ROLES" :key="role" class="h-6 w-4" :style="{ background: t.palette[role] }" :title="`${role} ${t.palette[role]}`"></span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm text-slate-300 light:text-slate-700">{{ t.label }} <span class="ml-1 rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">system</span></div>
              <div class="truncate font-mono text-[10px] text-slate-500">{{ ROLES.map((r) => t.palette[r]).join(' ') }}</div>
            </div>
            <button class="btn btn-link" :data-testid="`palette-copy-${t.id}`" @click="copy(t.palette as PaletteColors, `${t.label} copy`)">Copy</button>
          </div>
        </div>
      </div>

      <!-- the form -->
      <div v-else class="space-y-3" data-testid="palette-form">
        <label class="block text-xs text-slate-300 light:text-slate-700">Name
          <input v-model="draft.name" class="field w-full mt-1" maxlength="60" data-testid="palette-name" placeholder="e.g. Warm sand" />
        </label>
        <div class="grid gap-2 sm:grid-cols-2">
          <label v-for="role in ROLES" :key="role" class="flex items-center gap-2 text-xs text-slate-300 light:text-slate-700">
            <span class="w-20 shrink-0">{{ ROLE_LABEL[role] }}</span>
            <input type="color" :value="validHex(draft.colors[role]) ? draft.colors[role] : '#000000'" class="h-8 w-10 rounded border border-slate-700 bg-transparent" @input="draft.colors[role] = ($event.target as HTMLInputElement).value.toUpperCase()" />
            <input v-model="draft.colors[role]" class="field font-mono w-28" maxlength="7" :data-testid="`palette-color-${role}`" />
          </label>
        </div>
        <div class="rounded-lg p-3 text-xs" :style="{ background: preview.bg, color: preview.text }">
          <div class="font-semibold">Heading</div>
          <div :style="{ color: preview.muted }">A line of muted text</div>
          <div class="mt-2 flex gap-2">
            <span class="rounded px-2 py-0.5" :style="{ background: preview.accent, color: preview.onAccent }">Button</span>
            <span class="rounded border px-2 py-0.5" :style="{ background: preview.card, borderColor: preview.border }">Box</span>
            <span class="rounded px-2 py-0.5" :style="{ background: preview.bgAlt }">Alternate section</span>
          </div>
        </div>
        <ul v-if="weak.length" class="list-disc pl-5 text-xs text-amber-400" data-testid="palette-warnings">
          <li v-for="w in weak" :key="w">{{ w }}</li>
        </ul>
        <p v-else-if="colorsOk" class="text-xs text-emerald-400">Every text reaches the contrast that accessibility guidelines ask for.</p>
        <p v-if="problem" class="text-xs text-rose-300" data-testid="palette-problem">{{ problem }}</p>
      </div>
    
    <div v-if="draft" class="flex justify-end gap-2">
      <button class="btn btn-secondary" @click="draft = null; problem = ''">Cancel</button>
      <button class="btn btn-primary" data-testid="palette-save" :disabled="!canSave || saving" @click="save()">{{ draft.id ? 'Save' : 'Create' }}</button>
    </div>
    </div>
</template>

<script setup lang="ts">
// The management of the palettes of the Generate Website Wizard, used in the section Palettes and in the window of the wizard: the eight colours of a palette, with a sample and a warning for the pairs that are hard to read.
import { computed, ref } from 'vue'
import { useAuthStore } from '../../stores/authStore'
import { PALETTE_ROLES, removePalette, savePalette, type PaletteColors, type WizardOptions, type WizardPalette } from '../../utils/site-wizard-api'

const props = defineProps<{ options: WizardOptions }>()
const emit = defineEmits<{ (e: 'changed', saved?: string): void }>()

const ROLES = PALETTE_ROLES
const ROLE_LABEL: Record<(typeof PALETTE_ROLES)[number], string> = { bg: 'Page', bgAlt: 'Alternate', card: 'Boxes', text: 'Text', muted: 'Muted text', border: 'Borders', accent: 'Buttons', onAccent: 'On buttons' }
const blank: PaletteColors = { bg: '#FFFFFF', bgAlt: '#F1F5F9', card: '#FFFFFF', text: '#0F172A', muted: '#475569', border: '#E2E8F0', accent: '#4F46E5', onAccent: '#FFFFFF' }

const auth = useAuthStore()
const palettes = computed(() => props.options.palettes)
const draft = ref<{ id: string | null; name: string; colors: PaletteColors } | null>(null)
const saving = ref(false)
const problem = ref('')

const HEX = /^#[0-9a-fA-F]{6}$/
const validHex = (v: string) => HEX.test(v)

function copy(colors: PaletteColors, name: string) { draft.value = { id: null, name, colors: { ...colors } }; problem.value = '' }
function edit(p: WizardPalette) { draft.value = { id: p.id, name: p.name, colors: { ...p.palette } }; problem.value = '' }

// ---- contrast (WCAG 2), the same pairs and limits the wizard checks ----
function channel(c: number): number { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
function luminance(hex: string): number { return 0.2126 * channel(parseInt(hex.slice(1, 3), 16)) + 0.7152 * channel(parseInt(hex.slice(3, 5), 16)) + 0.0722 * channel(parseInt(hex.slice(5, 7), 16)) }
function contrast(a: string, b: string): number { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }

const colorsOk = computed(() => !!draft.value && ROLES.every((r) => validHex(draft.value!.colors[r])))
const weak = computed(() => {
  if (!draft.value || !colorsOk.value) return []
  const c = draft.value.colors
  const out: string[] = []
  for (const [surface, bg] of [['page', c.bg], ['alternate sections', c.bgAlt], ['boxes', c.card]] as const) {
    for (const [name, fg, min] of [['text', c.text, 4.5], ['muted text', c.muted, 4.5], ['buttons', c.accent, 3]] as const) {
      const v = contrast(fg, bg)
      if (v < min) out.push(`${name} on ${surface}: contrast ${v.toFixed(1)}, needs ${min}`)
    }
  }
  const v = contrast(c.onAccent, c.accent)
  if (v < 4.5) out.push(`text on buttons: contrast ${v.toFixed(1)}, needs 4.5`)
  return out
})
// the sample uses a valid colour for every role while one is being typed
const preview = computed(() => Object.fromEntries(ROLES.map((r) => [r, draft.value && validHex(draft.value.colors[r]) ? draft.value.colors[r] : blank[r]])) as PaletteColors)
const canSave = computed(() => !!draft.value && !!draft.value.name.trim() && colorsOk.value)

async function save() {
  if (!draft.value) return
  saving.value = true
  problem.value = ''
  try {
    const saved = await savePalette(auth.config.coreApiUrl, draft.value.id, { name: draft.value.name.trim(), colors: draft.value.colors })
    draft.value = null
    emit('changed', saved.palette.id)
  } catch (e: any) {
    problem.value = e?.message || 'The palette could not be saved'
  } finally {
    saving.value = false
  }
}

async function remove(p: WizardPalette) {
  if (!confirm(`Delete the palette "${p.name}"? Websites already made from it are not changed.`)) return
  try {
    await removePalette(auth.config.coreApiUrl, p.id)
    emit('changed')
  } catch (e: any) {
    alert(e?.message || 'The palette could not be deleted')
  }
}
</script>

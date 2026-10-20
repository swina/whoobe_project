<template>
  <div class="p-6 space-y-6" data-testid="site-wizard">
    <div>
      <h1 class="text-xl font-semibold text-slate-100 light:text-slate-900 flex items-center gap-2"><LayoutTemplate class="w-5 h-5 text-indigo-400" />Generate Website Wizard</h1>
      <p class="text-xs text-slate-400 light:text-slate-600 mt-1 max-w-3xl">
        Make a first version of a website from a few choices: what it is for, how it looks, which pages and which blocks each page has. The website is created as a
        <strong>draft</strong> that you read and improve in the editor. The texts are placeholders written for the sector; nothing is sent outside this installation.
      </p>
    </div>

    <div v-if="loadError" class="text-sm text-rose-300">{{ loadError }}</div>
    <div v-else-if="!options" class="text-sm text-slate-500">Loading…</div>

    <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div class="space-y-5 min-w-0">
        <!-- the steps -->
        <ol class="flex flex-wrap gap-2" data-testid="wizard-steps">
          <li v-for="s in steps" :key="s.n">
            <button :data-testid="`wizard-step-${s.n}`" class="px-3 py-1.5 rounded-full text-xs font-medium border"
              :class="step === s.n ? 'bg-indigo-500/20 border-indigo-400 text-indigo-200' : s.n < step ? 'border-emerald-500/40 text-emerald-300' : 'border-slate-700 text-slate-400'"
              :disabled="s.n > furthest" @click="goTo(s.n)">{{ s.n }}. {{ s.label }}</button>
          </li>
        </ol>

        <!-- 1 basics -->
        <section v-if="step === 1" class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-5 space-y-4" data-testid="wizard-basics">
          <h2 class="text-sm font-semibold text-slate-200 light:text-slate-800">What is the site for?</h2>
          <label class="block text-xs text-slate-300 light:text-slate-700">Name of the website
            <input v-model="name" data-testid="wizard-site-name" class="field w-full mt-1" :maxlength="options.limits.maxNameLength" placeholder="e.g. Seaview Hotel" />
          </label>
          <div>
            <div class="text-xs text-slate-300 light:text-slate-700 mb-1">Sector</div>
            <div class="flex flex-wrap gap-2">
              <button v-for="s in options.sectors" :key="s.id" :data-testid="`wizard-sector-${s.id}`" class="px-3 py-2 rounded-lg border text-sm"
                :class="sector === s.id ? 'bg-indigo-500/20 border-indigo-400 text-indigo-100' : 'border-slate-700 text-slate-300 hover:border-slate-500'" @click="chooseSector(s.id)">{{ s.label }}</button>
            </div>
          </div>
          <label class="block text-xs text-slate-300 light:text-slate-700">Market context <span class="text-slate-500">(free text, a few words)</span>
            <input v-model="context" data-testid="wizard-context" class="field w-full mt-1" :maxlength="40" :placeholder="`e.g. ${currentSector?.defaultContext ?? 'hotel'}`" />
          </label>
          <p class="text-xs text-slate-500">The sector chooses the placeholder texts and proposes a structure; the context fills the noun they use ("our {{ context.trim() || currentSector?.defaultContext }}"). Language: English.</p>
        </section>

        <!-- 2 look -->
        <section v-if="step === 2" class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-5 space-y-5" data-testid="wizard-look">
          <div>
            <h2 class="text-sm font-semibold text-slate-200 light:text-slate-800">Colours</h2>
            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 mt-2">
              <button v-for="t in options.themes" :key="t.id" :data-testid="`wizard-theme-${t.id}`" class="text-left rounded-xl border p-3 space-y-2"
                :class="themeKind === 'preset' && preset === t.id ? 'border-indigo-400 ring-1 ring-indigo-400' : 'border-slate-700 hover:border-slate-500'" @click="themeKind = 'preset'; preset = t.id">
                <div class="rounded-lg p-3 text-xs" :style="{ background: t.palette.bg, color: t.palette.text }">
                  <div class="font-semibold">Heading</div>
                  <div :style="{ color: t.palette.muted }">A line of text</div>
                  <div class="mt-2 flex gap-2"><span class="rounded px-2 py-0.5" :style="{ background: t.palette.accent, color: t.palette.onAccent }">Button</span><span class="rounded px-2 py-0.5 border" :style="{ background: t.palette.card, borderColor: t.palette.border }">Box</span></div>
                </div>
                <div class="text-sm text-slate-200 light:text-slate-800">{{ t.label }}</div>
              </button>
              <div class="rounded-xl border p-3 space-y-2" :class="themeKind === 'company' ? 'border-indigo-400 ring-1 ring-indigo-400' : 'border-slate-700'" data-testid="wizard-theme-company">
                <button class="text-sm text-slate-200 light:text-slate-800 text-left w-full" @click="themeKind = 'company'">Company colour</button>
                <div class="flex items-center gap-2">
                  <input type="color" :value="background" class="h-9 w-12 rounded border border-slate-700 bg-transparent" @input="setBackground(($event.target as HTMLInputElement).value)" />
                  <input v-model="background" data-testid="wizard-background" class="field font-mono w-28" maxlength="7" @focus="themeKind = 'company'" />
                </div>
                <p class="text-xs text-slate-500">The background of the site, for example <code>#323932</code>. The other colours follow from it and are kept readable.</p>
              </div>
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block text-xs text-slate-300 light:text-slate-700">Accent colour <span class="text-slate-500">(optional: buttons and highlights)</span>
              <div class="flex items-center gap-2 mt-1">
                <input type="color" :value="accentPicker" class="h-9 w-12 rounded border border-slate-700 bg-transparent" @input="accent = ($event.target as HTMLInputElement).value.toUpperCase()" />
                <input v-model="accent" data-testid="wizard-accent" class="field font-mono w-40" maxlength="7" placeholder="from the theme" />
                <button v-if="accent" class="btn btn-link" @click="accent = ''">Reset</button>
              </div>
            </label>
            <div>
              <div class="text-xs text-slate-300 light:text-slate-700 mb-1">Fonts</div>
              <div class="flex gap-2">
                <button v-for="f in options.fonts" :key="f.id" :data-testid="`wizard-font-${f.id}`" class="px-4 py-2 rounded-lg border text-sm" :class="[font === f.id ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100' : 'border-slate-700 text-slate-300', f.id === 'serif' ? 'font-serif' : 'font-sans']" @click="font = f.id">Aa {{ f.label }}</button>
              </div>
            </div>
          </div>
          <p v-if="badColour" class="text-xs text-rose-300" data-testid="wizard-colour-error">{{ badColour }}</p>
        </section>

        <!-- 3 pages -->
        <section v-if="step === 3" class="space-y-4" data-testid="wizard-pages">
          <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-5 space-y-3">
            <h2 class="text-sm font-semibold text-slate-200 light:text-slate-800">Navigation</h2>
            <p class="text-xs text-slate-400">The header and the footer are made from the pages below, in this order. Nothing to type.</p>
            <label class="flex items-center gap-2 text-xs text-slate-300"><input v-model="headerButton" type="checkbox" data-testid="wizard-header-button" /> Show a contact button in the header</label>
          </div>
          <div v-for="(page, pi) in pages" :key="pi" class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-5 space-y-3" :data-testid="`wizard-page-${pi}`">
            <div class="flex items-center gap-3">
              <span class="text-xs uppercase tracking-wider text-slate-500 w-24 shrink-0">{{ pi === 0 ? 'Landing page' : `Page ${pi + 1}` }}</span>
              <input v-model="page.title" class="field flex-1" :data-testid="`wizard-page-title-${pi}`" maxlength="60" @input="pagesTouched = true" />
              <button v-if="pi > 0" class="btn btn-link-danger" :data-testid="`wizard-page-remove-${pi}`" @click="removePage(pi)">Remove page</button>
            </div>
            <ul class="space-y-2">
              <li v-for="(b, bi) in page.blocks" :key="bi" class="flex items-center gap-2 rounded-lg border border-slate-800 light:border-slate-200 px-3 py-2" :data-testid="`wizard-block-${pi}-${bi}`">
                <span class="text-sm text-slate-200 light:text-slate-800 flex-1">{{ blockTitle(b) }}
                  <span v-if="'snippet' in b" class="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">your snippet</span>
                  <span v-if="blockType(b) === 'form'" class="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300" :title="blockInfo('form')?.description">not connected</span>
                </span>
                <button class="btn btn-link" :disabled="bi === 0" :aria-label="'Move up'" @click="moveBlock(pi, bi, -1)"><ArrowUp class="w-3.5 h-3.5" /></button>
                <button class="btn btn-link" :disabled="bi === page.blocks.length - 1" :aria-label="'Move down'" @click="moveBlock(pi, bi, 1)"><ArrowDown class="w-3.5 h-3.5" /></button>
                <button class="btn btn-link-danger" :aria-label="'Remove block'" @click="removeBlock(pi, bi)"><Trash2 class="w-3.5 h-3.5" /></button>
              </li>
              <li v-if="!page.blocks.length" class="text-xs text-slate-500 italic">No block yet: the page will have only its title.</li>
            </ul>
            <div class="flex items-center gap-2">
              <select class="field" :data-testid="`wizard-add-block-${pi}`" :disabled="page.blocks.length >= options.limits.maxBlocksPerPage" @change="addBlock(pi, $event)">
                <option value="">+ Add a block…</option>
                <optgroup label="Blocks">
                  <option v-for="bk in options.blocks" :key="bk.type" :value="JSON.stringify({ type: bk.type })">{{ bk.label }}</option>
                </optgroup>
                <optgroup v-if="options.snippets.length" label="From your library">
                  <option v-for="sn in options.snippets" :key="sn.name + sn.block" :value="JSON.stringify({ snippet: sn.name, category: sn.block })">{{ sn.name }} ({{ blockLabel(sn.block) }})</option>
                </optgroup>
              </select>
              <span class="text-xs text-slate-500">{{ page.blocks.length }} / {{ options.limits.maxBlocksPerPage }}</span>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <button class="btn btn-secondary" data-testid="wizard-add-page" :disabled="pages.length >= options.limits.maxPages" @click="addPage()">+ Add a page</button>
            <span class="text-xs text-slate-500">{{ pages.length }} / {{ options.limits.maxPages }} pages</span>
            <button class="btn btn-link" data-testid="wizard-suggest" @click="applySuggestion()">Start again from the structure suggested for {{ currentSector?.label }}</button>
          </div>
        </section>

        <!-- 4 texts -->
        <section v-if="step === 4" class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-5 space-y-3" data-testid="wizard-texts">
          <h2 class="text-sm font-semibold text-slate-200 light:text-slate-800">Texts</h2>
          <label class="flex items-start gap-3 rounded-lg border border-indigo-400 bg-indigo-500/10 p-3 text-sm text-slate-200">
            <input type="radio" checked class="mt-1" data-testid="wizard-texts-placeholder" />
            <span><strong>Placeholder texts</strong><br /><span class="text-xs text-slate-400">Written for the sector, plain and generic on purpose: they are there to be replaced in the editor.</span></span>
          </label>
          <label class="flex items-start gap-3 rounded-lg border border-slate-700 p-3 text-sm text-slate-500 opacity-70">
            <input type="radio" disabled class="mt-1" data-testid="wizard-texts-ai" />
            <span><strong>Write the texts with the AI</strong><br /><span class="text-xs">Not available in this version.</span></span>
          </label>
        </section>

        <!-- 5 check and create -->
        <section v-if="step === 5" class="space-y-4" data-testid="wizard-check">
          <div v-if="busy" class="text-xs text-indigo-300">{{ busy }}</div>
          <div v-if="problem" class="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200" data-testid="wizard-problem">{{ problem }}</div>
          <div v-if="issues.length" class="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 space-y-1" data-testid="wizard-issues">
            <p class="text-xs font-semibold text-rose-200">Something in the answers needs a change:</p>
            <ul class="text-xs text-rose-200 list-disc pl-5"><li v-for="(i, n) in issues" :key="n">{{ i.where }}: {{ i.message }}</li></ul>
          </div>
          <div v-if="outcome" class="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3" data-testid="wizard-summary">
            <h2 class="text-sm font-semibold text-emerald-200">This is what will be created</h2>
            <SiteImportCheck v-model:name="websiteName" v-model:root-path="websitePath" :outcome="outcome" :notes="outcome.notes" prefix="wizard" @recheck="recheck()" @choose="choose" />
            <p v-if="hasForm" class="text-xs text-amber-300" data-testid="wizard-form-note">The contact form is created <strong>not connected</strong>: it sends nowhere until a developer connects it in the editor.</p>
          </div>
        </section>

        <div class="flex items-center gap-2">
          <button v-if="step > 1" class="btn btn-secondary" data-testid="wizard-back" @click="goTo(step - 1)">Back</button>
          <button v-if="step < 5" class="btn btn-primary" data-testid="wizard-next" :disabled="!canNext" @click="next()">Next</button>
          <button v-if="step === 5" class="btn btn-success" data-testid="wizard-create" :disabled="!canCreate" @click="create()">Create as a draft website</button>
        </div>
      </div>

      <!-- the structure, as boxes -->
      <aside class="space-y-3" data-testid="wizard-preview">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Structure</h3>
        <div class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40 p-2 text-[10px] text-slate-400 flex justify-between"><span>Header</span><span>{{ pages.map((p) => p.title || '…').join(' · ') }}</span></div>
        <div v-for="(page, pi) in pages" :key="pi" class="rounded-lg border border-slate-800 light:border-slate-200 p-2 space-y-1.5">
          <div class="text-xs font-semibold text-slate-300 light:text-slate-700">{{ page.title || '(untitled)' }}</div>
          <div v-if="!hasHeroFirst(page)" class="h-5 rounded bg-slate-700/60 text-[9px] flex items-center px-2 text-slate-300">Page title</div>
          <template v-for="(b, bi) in page.blocks" :key="bi">
            <div v-if="blockType(b) === 'hero'" class="h-14 rounded bg-indigo-500/30 flex items-center gap-2 px-2 text-[9px] text-indigo-100"><span class="flex-1">Hero</span><span class="w-12 h-9 rounded bg-indigo-400/40"></span></div>
            <div v-else-if="blockType(b) === 'banner'" class="h-4 rounded bg-slate-600/60 text-[9px] text-center text-slate-200">Banner</div>
            <div v-else-if="blockType(b) === 'cta'" class="h-9 rounded bg-slate-700/60 text-[9px] flex items-center justify-center text-slate-200">Call to action</div>
            <div v-else-if="blockType(b) === 'box-grid-3'" class="space-y-1"><div class="text-[9px] text-slate-400">Box grid 3</div><div class="flex gap-1"><span v-for="n in 3" :key="n" class="flex-1 h-8 rounded bg-slate-700/60"></span></div></div>
            <div v-else-if="blockType(b) === 'box-grid-6'" class="space-y-1"><div class="text-[9px] text-slate-400">Box grid 6</div><div class="grid grid-cols-3 gap-1"><span v-for="n in 6" :key="n" class="h-6 rounded bg-slate-700/60"></span></div></div>
            <div v-else-if="blockType(b) === 'form'" class="h-12 rounded border border-dashed border-amber-400/60 text-[9px] text-amber-200 flex items-center justify-center">Contact form (not connected)</div>
            <div v-if="'snippet' in b" class="text-[9px] text-indigo-300 -mt-1 pl-1">your snippet: {{ b.snippet }}</div>
          </template>
        </div>
        <div class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40 p-2 text-[10px] text-slate-400">Footer</div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, LayoutTemplate, Trash2 } from '@lucide/vue'
import SiteImportCheck from '../components/websites/SiteImportCheck.vue'
import { useAuthStore } from '../stores/authStore'
import { useTabsStore } from '../stores/tabsStore'
import { useToastStore } from '../stores/toastStore'
import { useWebsitesStore } from '../stores/websitesStore'
import { SiteSpecInvalid, type SiteSpecChoices, type SiteSpecConflict, type SiteSpecIssue } from '../utils/site-spec-api'
import { fetchWizardOptions, submitWizard, type BlockChoice, type BlockType, type PageAnswer, type PresetName, type WizardAnswers, type WizardOptions, type WizardOutcome } from '../utils/site-wizard-api'

const authStore = useAuthStore()
const tabsStore = useTabsStore()
const toastStore = useToastStore()
const websitesStore = useWebsitesStore()
const api = () => authStore.config.coreApiUrl

const options = ref<WizardOptions | null>(null)
const loadError = ref('')

const steps = [{ n: 1, label: 'Basics' }, { n: 2, label: 'Look' }, { n: 3, label: 'Pages' }, { n: 4, label: 'Texts' }, { n: 5, label: 'Check and create' }]
const step = ref(1)
const furthest = ref(1)

const name = ref('')
const sector = ref('')
const context = ref('')
const themeKind = ref<'preset' | 'company'>('preset')
const preset = ref<PresetName>('dark')
const background = ref('#323932')
const accent = ref('')
const font = ref<'sans' | 'serif'>('sans')
const headerButton = ref(false)
const pages = ref<PageAnswer[]>([])
// once the person has changed the pages, a change of sector no longer replaces them
const pagesTouched = ref(false)

const currentSector = computed(() => options.value?.sectors.find((s) => s.id === sector.value))
const HEX = /^#[0-9a-fA-F]{6}$/
const accentPicker = computed(() => (HEX.test(accent.value) ? accent.value : '#8B5CF6'))
const badColour = computed(() => {
  if (themeKind.value === 'company' && !HEX.test(background.value)) return 'The company colour must be written as #RRGGBB, for example #323932.'
  if (accent.value && !HEX.test(accent.value)) return 'The accent colour must be written as #RRGGBB, or left empty.'
  return ''
})

onMounted(async () => {
  try {
    options.value = await fetchWizardOptions(api())
    sector.value = options.value.sectors[0]?.id ?? ''
    applySuggestion()
  } catch (e: any) {
    loadError.value = e?.message || 'Could not load the wizard'
  }
})

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
function applySuggestion() {
  pages.value = clone(currentSector.value?.suggested ?? [{ title: 'Home', blocks: [] }])
  pagesTouched.value = false
}
function chooseSector(id: string) {
  sector.value = id
  if (!pagesTouched.value) applySuggestion()
}
function setBackground(v: string) { background.value = v.toUpperCase(); themeKind.value = 'company' }

const blockInfo = (t: BlockType) => options.value?.blocks.find((b) => b.type === t)
const blockLabel = (t: BlockType) => blockInfo(t)?.label ?? t
const blockType = (b: BlockChoice): BlockType => ('type' in b ? b.type : b.category)
const blockTitle = (b: BlockChoice) => ('type' in b ? blockLabel(b.type) : b.snippet)
const hasHeroFirst = (p: PageAnswer) => p.blocks.some((b) => blockType(b) === 'hero')
const hasForm = computed(() => pages.value.some((p) => p.blocks.some((b) => 'type' in b && b.type === 'form')))

function addPage() {
  if (!options.value || pages.value.length >= options.value.limits.maxPages) return
  pages.value.push({ title: `Page ${pages.value.length + 1}`, blocks: [{ type: 'hero' }] })
  pagesTouched.value = true
}
function removePage(i: number) { pages.value.splice(i, 1); pagesTouched.value = true }
function moveBlock(pi: number, bi: number, d: -1 | 1) {
  const list = pages.value[pi].blocks
  const [b] = list.splice(bi, 1)
  list.splice(bi + d, 0, b)
  pagesTouched.value = true
}
function removeBlock(pi: number, bi: number) { pages.value[pi].blocks.splice(bi, 1); pagesTouched.value = true }
function addBlock(pi: number, ev: Event) {
  const el = ev.target as HTMLSelectElement
  if (el.value) { pages.value[pi].blocks.push(JSON.parse(el.value) as BlockChoice); pagesTouched.value = true }
  el.value = ''
}

const answers = computed<WizardAnswers>(() => ({
  name: name.value.trim(),
  language: 'en',
  sector: sector.value,
  ...(context.value.trim() ? { context: context.value.trim() } : {}),
  theme: themeKind.value === 'company' ? { background: background.value } : { preset: preset.value },
  ...(HEX.test(accent.value) ? { accent: accent.value } : {}),
  font: font.value,
  pages: pages.value.map((p) => ({ title: p.title.trim(), blocks: p.blocks })),
  headerButton: headerButton.value,
}))

const canNext = computed(() => {
  if (step.value === 1) return !!name.value.trim() && !!sector.value
  if (step.value === 2) return !badColour.value
  if (step.value === 3) return pages.value.length > 0 && pages.value.every((p) => !!p.title.trim())
  return true
})

function goTo(n: number) { step.value = n; if (n === 5) void runCheck() }
function next() { furthest.value = Math.max(furthest.value, step.value + 1); goTo(step.value + 1) }

// ---- the check and the creation (the same dry run and import as a specification) ----
const busy = ref('')
const problem = ref('')
const issues = ref<SiteSpecIssue[]>([])
const outcome = ref<WizardOutcome | null>(null)
const choices = ref<SiteSpecChoices>({ themes: {}, snippets: {} })
const websiteName = ref('')
const websitePath = ref('')
const original = ref({ name: '', rootPath: '' })

const canCreate = computed(() => !!outcome.value && !outcome.value.summary.website.rootPathTaken && !busy.value && !!websiteName.value.trim() && !!websitePath.value.trim())

function websiteOverride(): { name?: string; rootPath?: string } | undefined {
  const o: { name?: string; rootPath?: string } = {}
  if (websiteName.value.trim() && websiteName.value.trim() !== original.value.name) o.name = websiteName.value.trim()
  if (websitePath.value.trim() && websitePath.value.trim() !== original.value.rootPath) o.rootPath = websitePath.value.trim()
  return Object.keys(o).length ? o : undefined
}

// a change of the answers starts the check over
watch([answers], () => { outcome.value = null; issues.value = []; problem.value = ''; original.value = { name: '', rootPath: '' }; websiteName.value = ''; websitePath.value = ''; choices.value = { themes: {}, snippets: {} } })

async function runCheck(): Promise<void> {
  problem.value = ''
  issues.value = []
  busy.value = 'Checking…'
  try {
    const result = await submitWizard(api(), { answers: answers.value, choices: choices.value, website: websiteOverride() }, true)
    outcome.value = result
    if (!original.value.name || !websiteName.value) {
      original.value = { name: result.summary.website.name, rootPath: result.summary.website.rootPath }
      websiteName.value = result.summary.website.name
      websitePath.value = result.summary.website.rootPath
    }
    for (const c of result.conflicts) (c.kind === 'theme' ? choices.value.themes : choices.value.snippets)[c.name] = c.choice
  } catch (e: any) {
    outcome.value = null
    if (e instanceof SiteSpecInvalid) issues.value = e.issues
    else problem.value = e?.message || 'The check failed'
  } finally {
    busy.value = ''
  }
}

async function recheck(): Promise<void> { await runCheck() }
function choose(c: SiteSpecConflict, choice: 'existing' | 'new') {
  ;(c.kind === 'theme' ? choices.value.themes : choices.value.snippets)[c.name] = choice
  void recheck()
}

async function create(): Promise<void> {
  busy.value = 'Creating…'
  problem.value = ''
  try {
    const result = await submitWizard(api(), { answers: answers.value, choices: choices.value, website: websiteOverride() }, false)
    toastStore.show(`Website "${result.website?.name}" created as a draft with ${result.summary.pages.length} pages`)
    await websitesStore.refreshWebsites()
    // start over for the next one, then open the website that was made
    name.value = ''; context.value = ''; step.value = 1; furthest.value = 1; applySuggestion()
    if (result.website) tabsStore.openWebsite(result.website.id)
  } catch (e: any) {
    if (e instanceof SiteSpecInvalid) { issues.value = e.issues; outcome.value = null }
    else problem.value = e?.message || 'The creation failed'
  } finally {
    busy.value = ''
  }
}
</script>

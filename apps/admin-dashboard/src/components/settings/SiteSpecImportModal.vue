<template>
  <BaseModal v-if="isOpen" :open="true" size="lg" @close="emit('close')">
    <template #header>
      <h2 class="ui-modal-title flex items-center gap-2"><FileJson class="w-4 h-4 text-indigo-400" />Import a site from a specification</h2>
    </template>

    <div class="space-y-5" data-testid="site-spec-modal">
      <p class="text-xs text-slate-400 light:text-slate-600">
        A site specification is one JSON file that describes a whole site: pages, header and footer, theme and texts. Take the instructions to the
        language model you prefer, describe the site you want, and bring its answer back here. Nothing leaves this installation, and the website is
        created as a <strong>draft</strong>.
      </p>

      <!-- 1. the material -->
      <section class="rounded-xl border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40 p-4 space-y-3">
        <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800">1. Get the material for the model</h3>
        <div v-if="materialError" class="text-xs text-rose-300">{{ materialError }}</div>
        <div v-else-if="!material" class="text-xs text-slate-500">Loading…</div>
        <div v-else class="space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <button data-testid="site-spec-copy-instructions" class="btn btn-primary" @click="copy('instructions', material.instructions)">Copy the instructions</button>
            <button data-testid="site-spec-download-instructions" class="btn btn-secondary" @click="downloadText('whoobe-site-spec-instructions.md', material.instructions, 'text/markdown')">Download</button>
            <span class="text-xs text-slate-500">Paste them in the model's chat first, then describe your site.</span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button data-testid="site-spec-copy-schema" class="btn btn-secondary" @click="copy('schema', schemaText)">Copy the JSON Schema</button>
            <button class="btn btn-secondary" @click="downloadText('whoobe-site-spec.schema.json', schemaText, 'application/json')">Download</button>
            <span class="text-xs text-slate-500">Only if the model or tool accepts a schema.</span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-slate-400">Or start from an example:</span>
            <button v-for="ex in material.examples" :key="ex.name" :data-testid="`site-spec-example-${ex.name}`" class="btn btn-link" @click="useExample(ex.spec)">{{ ex.name }}</button>
          </div>
          <div v-if="manual" class="space-y-1">
            <p class="text-xs text-amber-300">This browser did not allow copying. Select the text below and copy it (Ctrl+C):</p>
            <textarea ref="manualBox" readonly rows="6" class="field w-full font-mono text-xs" :value="manual" @focus="($event.target as HTMLTextAreaElement).select()"></textarea>
          </div>
          <p v-if="copied" class="text-xs text-emerald-300" data-testid="site-spec-copied">Copied: {{ copied }}.</p>
        </div>
      </section>

      <!-- 2. the answer -->
      <section class="rounded-xl border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40 p-4 space-y-3">
        <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800">2. Bring the answer back</h3>
        <textarea v-model="text" data-testid="site-spec-text" rows="8" spellcheck="false" class="field w-full font-mono text-xs" placeholder='Paste the JSON the model wrote here, or choose a file. {"version": 1, "website": { ... }}'></textarea>
        <div class="flex flex-wrap items-center gap-2">
          <button data-testid="site-spec-check" class="btn btn-primary" :disabled="!!busy || !text.trim()" @click="check()">Check</button>
          <button class="btn btn-secondary" :disabled="!!busy" @click="fileInput?.click()">Choose a file…</button>
          <input ref="fileInput" type="file" accept=".json,application/json,text/plain" class="hidden" @change="onFile" />
          <span v-if="busy" class="text-xs text-indigo-300">{{ busy }}</span>
        </div>

        <!-- problems, each with its place -->
        <div v-if="problem" class="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200" data-testid="site-spec-problem">{{ problem }}</div>
        <div v-if="issues.length" class="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 space-y-2" data-testid="site-spec-issues">
          <p class="text-xs font-semibold text-rose-200">{{ issues.length }} {{ issues.length === 1 ? 'problem' : 'problems' }} to fix. Correct the text, or paste the list to the model and ask it to fix them, then check again.</p>
          <ul class="space-y-1.5 max-h-56 overflow-y-auto">
            <li v-for="(i, n) in issues" :key="n" class="text-xs" data-testid="site-spec-issue">
              <span class="font-semibold text-rose-100">{{ i.where }}</span>: <span class="text-rose-200">{{ i.message }}</span>
              <span class="block font-mono text-[10px] text-rose-300/70">{{ i.path }}</span>
            </li>
          </ul>
          <button class="btn btn-secondary" @click="copy('the list of problems', issuesText)">Copy the list</button>
        </div>
      </section>

      <!-- 3. what will be created -->
      <section v-if="outcome" class="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-4" data-testid="site-spec-summary">
        <h3 class="text-sm font-semibold text-emerald-200">3. The file is valid. This is what will be created</h3>

        <SiteImportCheck v-model:name="websiteName" v-model:root-path="websitePath" :outcome="outcome" prefix="site-spec" @recheck="recheck()" @choose="choose" />
      </section>

      <div v-if="importError" class="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200" data-testid="site-spec-import-error">{{ importError }}</div>
    </div>

    <template #footer>
      <button class="btn btn-secondary light:hover:bg-slate-200" @click="emit('close')">Close</button>
      <button data-testid="site-spec-import" class="btn btn-success" :disabled="!canImport" @click="doImport()">Import as a draft website</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FileJson } from '@lucide/vue'
import BaseModal from '../ui/BaseModal.vue'
import SiteImportCheck from '../websites/SiteImportCheck.vue'
import { useAuthStore } from '../../stores/authStore'
import { useTabsStore } from '../../stores/tabsStore'
import { useToastStore } from '../../stores/toastStore'
import { useWebsitesStore } from '../../stores/websitesStore'
import {
  copyText, downloadText, fetchSiteSpecMaterial, readSiteSpecText, SiteSpecInvalid, submitSiteSpec,
  type SiteSpecChoices, type SiteSpecConflict, type SiteSpecIssue, type SiteSpecMaterial, type SiteSpecOutcome,
} from '../../utils/site-spec-api'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const authStore = useAuthStore()
const tabsStore = useTabsStore()
const toastStore = useToastStore()
const websitesStore = useWebsitesStore()
const api = () => authStore.config.coreApiUrl

const material = ref<SiteSpecMaterial | null>(null)
const materialError = ref('')
const schemaText = computed(() => (material.value ? JSON.stringify(material.value.schema, null, 2) : ''))
const copied = ref('')
const manual = ref('')

const text = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref('')
const problem = ref('')
const issues = ref<SiteSpecIssue[]>([])
const outcome = ref<SiteSpecOutcome | null>(null)
const importError = ref('')
const choices = ref<SiteSpecChoices>({ themes: {}, snippets: {} })
const websiteName = ref('')
const websitePath = ref('')

const issuesText = computed(() => issues.value.map((i) => `- ${i.where}: ${i.message} (${i.path})`).join('\n'))
const canImport = computed(() => !!outcome.value && !outcome.value.summary.website.rootPathTaken && !busy.value && !!websiteName.value.trim() && !!websitePath.value.trim())

watch(() => props.isOpen, async (open) => {
  if (!open || material.value) return
  try { material.value = await fetchSiteSpecMaterial(api()) } catch (e: any) { materialError.value = e?.message || 'Could not load the material' }
}, { immediate: true })

// a change of the text starts the check over
watch(text, () => {
  outcome.value = null; issues.value = []; problem.value = ''; importError.value = ''
  // another file: its own name, root path and choices
  choices.value = { themes: {}, snippets: {} }; websiteName.value = ''; websitePath.value = ''; original.value = { name: '', rootPath: '' }
})

async function copy(what: string, value: string) {
  manual.value = ''
  copied.value = ''
  if (await copyText(value)) copied.value = what
  else manual.value = value
}

function useExample(spec: unknown) {
  text.value = JSON.stringify(spec, null, 2)
}

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  text.value = await file.text()
  input.value = ''
}

/** The website fields are sent only when the person changed them: otherwise the file's own name and root path stand. */
function websiteOverride(): { name?: string; rootPath?: string } | undefined {
  const o: { name?: string; rootPath?: string } = {}
  if (websiteName.value.trim() && websiteName.value.trim() !== original.value.name) o.name = websiteName.value.trim()
  if (websitePath.value.trim() && websitePath.value.trim() !== original.value.rootPath) o.rootPath = websitePath.value.trim()
  return Object.keys(o).length ? o : undefined
}
const original = ref({ name: '', rootPath: '' })

async function check(): Promise<void> {
  problem.value = ''
  issues.value = []
  importError.value = ''
  const read = readSiteSpecText(text.value)
  if ('error' in read) { problem.value = read.error; outcome.value = null; return }
  busy.value = 'Checking…'
  try {
    const result = await submitSiteSpec(api(), { spec: read.spec, choices: choices.value, website: websiteOverride() }, true)
    outcome.value = result
    if (!original.value.name || !websiteName.value) {
      original.value = { name: result.summary.website.name, rootPath: result.summary.website.rootPath }
      websiteName.value = result.summary.website.name
      websitePath.value = result.summary.website.rootPath
    }
    // the choices the server settled on become the state of the radio buttons
    for (const c of result.conflicts) (c.kind === 'theme' ? choices.value.themes : choices.value.snippets)[c.name] = c.choice
  } catch (e: any) {
    outcome.value = null
    if (e instanceof SiteSpecInvalid) issues.value = e.issues
    else problem.value = e?.message || 'The check failed'
  } finally {
    busy.value = ''
  }
}

// the text stays, a choice or a changed name asks again (the links and the names depend on them)
async function recheck(): Promise<void> {
  const keep = text.value
  await check()
  text.value = keep
}

function choose(c: SiteSpecConflict, choice: 'existing' | 'new') {
  ;(c.kind === 'theme' ? choices.value.themes : choices.value.snippets)[c.name] = choice
  void recheck()
}

async function doImport(): Promise<void> {
  const read = readSiteSpecText(text.value)
  if ('error' in read) { problem.value = read.error; return }
  busy.value = 'Importing…'
  importError.value = ''
  try {
    const result = await submitSiteSpec(api(), { spec: read.spec, choices: choices.value, website: websiteOverride() }, false)
    toastStore.show(`Website "${result.website?.name}" created as a draft with ${result.summary.pages.length} pages`)
    await websitesStore.refreshWebsites()
    if (result.website) tabsStore.openWebsite(result.website.id)
    emit('close')
  } catch (e: any) {
    if (e instanceof SiteSpecInvalid) { issues.value = e.issues; outcome.value = null }
    else importError.value = e?.message || 'The import failed'
  } finally {
    busy.value = ''
  }
}
</script>

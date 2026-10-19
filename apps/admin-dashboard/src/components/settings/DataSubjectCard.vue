<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-6" data-testid="dsr-card">
    <div>
      <h3 class="font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Data subject requests</h3>
      <p class="text-xs text-slate-500 mt-1">
        Find, export or erase everything held about one person by one value, normally their e-mail address: form submissions and the files they sent,
        and the mail log. The value is matched whole and in any case. Every request is written to the audit log with a fingerprint of the value, never the value.
      </p>
    </div>

    <form @submit.prevent="search" class="space-y-3">
      <div class="flex flex-col sm:flex-row gap-2">
        <input v-model="identifier" type="text" placeholder="ann@example.org" autocomplete="off" class="field flex-1" data-testid="dsr-identifier" />
        <button type="submit" :disabled="busy || !identifier.trim()" class="btn btn-primary" data-testid="dsr-search">Search</button>
      </div>
      <label class="flex items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" v-model="includeMailBodies" /> Also look for the value inside the text of mails (an enquiry sent to staff quotes the visitor's address)
      </label>
    </form>

    <div v-if="error" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs" data-testid="dsr-error">{{ error }}</div>

    <div v-if="result" class="space-y-4" data-testid="dsr-result">
      <p class="text-sm text-slate-200 light:text-slate-800" data-testid="dsr-counts">
        Found {{ result.counts.objects }} object(s), {{ result.counts.files }} uploaded file(s) and {{ result.counts.mail }} mail(s).
        <span v-if="result.counts.staff">{{ result.counts.staff }} staff account(s) have this address too: they are not erased here, use Users.</span>
      </p>

      <div v-if="result.objects.length">
        <h4 class="text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Objects</h4>
        <ul class="text-xs text-slate-400 space-y-0.5">
          <li v-for="o in result.objects" :key="o.id">{{ o.className }} - <code>{{ o.key }}</code> - {{ formatDate(o.createdAt) }} - in {{ o.fields.join(', ') }}<span v-if="o.published"> - published</span></li>
        </ul>
      </div>
      <div v-if="result.files.length">
        <h4 class="text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Files</h4>
        <ul class="text-xs text-slate-400 space-y-0.5"><li v-for="f in result.files" :key="f.id">{{ f.originalName }} ({{ f.size ?? '?' }} bytes)</li></ul>
      </div>
      <div v-if="result.mail.length">
        <h4 class="text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Mail</h4>
        <ul class="text-xs text-slate-400 space-y-0.5"><li v-for="m in result.mail" :key="m.id">{{ formatDate(m.sentAt) }} - to {{ m.to }} - {{ m.subject }} <span class="text-slate-500">({{ m.matchedIn === 'recipient' ? 'recipient' : 'mentioned in the text' }})</span></li></ul>
      </div>

      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="exportJson" data-testid="dsr-export">Download everything as JSON</button>
        <button type="button" class="btn btn-danger" :disabled="busy || !(result.counts.objects || result.counts.mail)" @click="startErase" data-testid="dsr-erase">Erase...</button>
      </div>

      <div v-if="erasing" class="p-4 rounded-xl border border-rose-800 bg-rose-950/30 space-y-3" data-testid="dsr-erase-panel">
        <p class="text-sm text-rose-200">
          This deletes {{ result.counts.objects }} object(s), their {{ result.counts.files }} uploaded file(s) from the library and {{ result.counts.mail }} mail(s) for good.
          Files are deleted first; an object whose file cannot be deleted stays and is reported, so you can run it again.
        </p>
        <label class="flex items-center gap-2 text-xs text-rose-200"><input type="checkbox" v-model="eraseMail" /> Include the mail log</label>
        <div>
          <label class="block text-xs text-rose-200 mb-1" for="dsr-confirm">Type the value again to confirm</label>
          <input id="dsr-confirm" v-model="confirm" type="text" autocomplete="off" class="field w-full" data-testid="dsr-confirm" />
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn btn-danger" :disabled="busy || confirm.trim().toLowerCase() !== identifier.trim().toLowerCase()" @click="erase" data-testid="dsr-erase-confirm">Erase now</button>
          <button type="button" class="btn btn-secondary" @click="erasing = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="erased" :class="['px-3 py-2 rounded-lg border text-xs', erased.failures.length ? 'bg-amber-950/60 border-amber-800 text-amber-200' : 'bg-emerald-950/60 border-emerald-800 text-emerald-300']" data-testid="dsr-erased">
      Erased {{ erased.objectsDeleted }} object(s), {{ erased.filesDeleted }} file(s) and {{ erased.mailDeleted }} mail(s).
      <span v-if="erased.failures.length"> {{ erased.failures.length }} could not be finished: {{ erased.failures.map((f) => f.reason).join('; ') }}. Run the erasure again.</span>
    </div>

    <hr class="border-slate-800 light:border-slate-200" />

    <div class="space-y-3" data-testid="retention">
      <div>
        <h4 class="text-xs font-medium text-slate-300 light:text-slate-700">Retention</h4>
        <p class="text-xs text-slate-500 mt-1">
          Nothing is deleted by age unless you set a number. Objects older than the days given for their class are deleted every day, <strong>published or not</strong>, with the files visitors sent;
          leave it blank to keep them. The mail log has its own number.
        </p>
      </div>
      <div v-for="c in classes" :key="c.id" class="flex items-center gap-2">
        <span class="w-48 text-sm text-slate-200 light:text-slate-800 truncate">{{ c.label || c.name }}</span>
        <input v-model.number="days[c.id]" type="number" min="1" max="36500" step="1" placeholder="keep" class="field w-28" :data-testid="`retention-${c.name}`" />
        <span class="text-xs text-slate-500">days</span>
        <button type="button" class="btn btn-secondary" :disabled="busy || (days[c.id] ?? null) === (c.retentionDays ?? null) || (days[c.id] === ('' as any) && c.retentionDays == null)" @click="saveClass(c)">Save</button>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-48 text-sm text-slate-200 light:text-slate-800">Mail log</span>
        <input v-model.number="mailDays" type="number" min="1" max="36500" step="1" placeholder="keep" class="field w-28" data-testid="retention-mail" />
        <span class="text-xs text-slate-500">days</span>
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="saveMail">Save</button>
      </div>
      <div class="flex items-center gap-3">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="runNow" data-testid="retention-run">Run the retention job now</button>
        <span v-if="retentionMessage" class="text-xs text-slate-400" data-testid="retention-message">{{ retentionMessage }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../../stores/authStore'
import { searchSubject, exportSubject, eraseSubject, runRetention, type SubjectSearch, type SubjectErasure } from '../../utils/data-subject-api'
import { fetchDataClasses, updateDataClass, type DataClass } from '../../utils/data-classes-api'
import { fetchSecuritySettings, saveSecuritySettings } from '../../utils/security-settings-api'

const authStore = useAuthStore()
const base = () => authStore.config.coreApiUrl

const identifier = ref('')
const includeMailBodies = ref(true)
const busy = ref(false)
const error = ref('')
const result = ref<SubjectSearch | null>(null)
const erasing = ref(false)
const eraseMail = ref(true)
const confirm = ref('')
const erased = ref<SubjectErasure | null>(null)

const classes = ref<DataClass[]>([])
const days = ref<Record<string, number | '' | null>>({})
const mailDays = ref<number | '' | null>(null)
const retentionMessage = ref('')

const formatDate = (iso: string) => new Date(iso).toLocaleString()

async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  busy.value = true
  error.value = ''
  try { return await fn() } catch (e: any) { error.value = e?.message || 'Failed'; return undefined } finally { busy.value = false }
}

async function search() {
  erased.value = null
  erasing.value = false
  const r = await guard(() => searchSubject(base(), identifier.value, { includeMailBodies: includeMailBodies.value }))
  if (r) result.value = r
}

async function exportJson() {
  const r = await guard(() => exportSubject(base(), identifier.value, { includeMailBodies: includeMailBodies.value }))
  if (!r) return
  const url = URL.createObjectURL(r.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = r.filename
  a.click()
  URL.revokeObjectURL(url)
}

function startErase() { confirm.value = ''; erasing.value = true; erased.value = null }

async function erase() {
  const r = await guard(() => eraseSubject(base(), identifier.value, {
    dryRun: false, confirm: confirm.value, includeMailBodies: includeMailBodies.value, include: { objects: true, mail: eraseMail.value },
  }))
  if (!r) return
  erased.value = r
  erasing.value = false
  const again = await guard(() => searchSubject(base(), identifier.value, { includeMailBodies: includeMailBodies.value }))
  if (again) result.value = again
}

async function loadRetention() {
  const list = await guard(() => fetchDataClasses(base()))
  if (list) {
    classes.value = list
    days.value = Object.fromEntries(list.map((c) => [c.id, c.retentionDays ?? null]))
  }
  const s = await guard(() => fetchSecuritySettings(base()))
  if (s) mailDays.value = s.mailLogRetentionDays
}

const asDays = (v: number | '' | null | undefined): number | null => (v === '' || v == null ? null : Number(v))

async function saveClass(c: DataClass) {
  const n = asDays(days.value[c.id])
  const r = await guard(() => updateDataClass(base(), c.id, { retentionDays: n }))
  if (r) { c.retentionDays = r.retentionDays ?? null; days.value[c.id] = r.retentionDays ?? null; retentionMessage.value = `Saved for ${c.label || c.name}.` }
}

async function saveMail() {
  const r = await guard(() => saveSecuritySettings(base(), { mailLogRetentionDays: asDays(mailDays.value) }))
  if (r) { mailDays.value = r.mailLogRetentionDays; retentionMessage.value = 'Saved for the mail log.' }
}

async function runNow() {
  const r = await guard(() => runRetention(base()))
  if (!r) return
  const n = r.classes.reduce((t, c) => t + c.deleted, 0)
  retentionMessage.value = `Removed ${n} object(s) and ${r.mailDeleted} mail(s).` + (r.classes.some((c) => c.failed) ? ' Some could not be finished; run it again.' : '')
}

onMounted(loadRetention)
</script>

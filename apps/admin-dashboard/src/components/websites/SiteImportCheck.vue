<template>
  <div class="space-y-4">
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="block text-xs text-slate-300 light:text-slate-700">Website name
        <input :value="name" :data-testid="`${prefix}-name`" class="field w-full mt-1" @input="emit('update:name', ($event.target as HTMLInputElement).value)" @change="emit('recheck')" />
      </label>
      <label class="block text-xs text-slate-300 light:text-slate-700">Root path (the address of its preview)
        <input :value="rootPath" :data-testid="`${prefix}-rootpath`" class="field w-full mt-1 font-mono" @input="emit('update:rootPath', ($event.target as HTMLInputElement).value)" @change="emit('recheck')" />
      </label>
    </div>
    <p v-if="outcome.summary.website.rootPathTaken" class="text-xs text-amber-300" :data-testid="`${prefix}-taken`">
      The root path {{ outcome.summary.website.rootPath }} is already used by another website. Change the name or the root path above.
    </p>

    <div class="text-xs text-slate-300 light:text-slate-700 space-y-1">
      <div><strong>{{ outcome.summary.pages.length }}</strong> {{ outcome.summary.pages.length === 1 ? 'page' : 'pages' }}
        <span class="text-slate-500">({{ outcome.summary.website.locales.join(', ') }})</span>:
        <span v-for="(p, n) in outcome.summary.pages" :key="n" class="inline-block mr-2 font-mono text-slate-400">{{ p.slug }}<span v-if="outcome.summary.website.locales.length > 1" class="text-slate-500"> [{{ p.locale }}]</span></span>
      </div>
      <div v-if="outcome.summary.snippets.length"><strong>Snippets:</strong>
        &nbsp;<span v-for="(s, n) in outcome.summary.snippets" :key="n" class="inline-block mr-2">{{ s.name }}<span class="text-slate-500"> ({{ s.action === 'create' ? 'new' : 'existing' }})</span></span>
      </div>
      <div v-if="outcome.summary.theme"><strong>Theme:</strong> {{ outcome.summary.theme.name }} <span class="text-slate-500">({{ outcome.summary.theme.action === 'create' ? 'new' : 'existing' }})</span></div>
      <div v-if="outcome.summary.layout.length"><strong>Around every page:</strong> {{ outcome.summary.layout.join(', ') }}</div>
    </div>

    <!-- a name that is already taken here: the person decides, an existing item is never changed -->
    <div v-if="outcome.conflicts.length" class="space-y-2" :data-testid="`${prefix}-conflicts`">
      <p class="text-xs font-semibold text-amber-200">These names already exist here. Nothing existing is changed or replaced.</p>
      <div v-for="c in outcome.conflicts" :key="c.kind + c.name" class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1" :data-testid="`${prefix}-conflict-${c.kind}`">
        <div class="text-slate-200 light:text-slate-800">The {{ c.kind }} <strong>"{{ c.name }}"</strong> exists.</div>
        <label class="flex items-center gap-2"><input type="radio" :name="prefix + c.kind + c.name" value="new" :checked="c.choice === 'new'" @change="emit('choose', c, 'new')" />
          Create a new one{{ c.choice === 'new' && c.createdAs ? `, named "${c.createdAs}"` : '' }}</label>
        <label class="flex items-center gap-2"><input type="radio" :name="prefix + c.kind + c.name" value="existing" :checked="c.choice === 'existing'" @change="emit('choose', c, 'existing')" />
          Use the existing one</label>
      </div>
    </div>

    <ul v-if="notes?.length" class="text-xs text-amber-300 list-disc pl-5" :data-testid="`${prefix}-notes`">
      <li v-for="(w, n) in notes" :key="n">{{ w }}</li>
    </ul>
    <ul v-if="outcome.report?.warnings?.length" class="text-xs text-amber-300 list-disc pl-5">
      <li v-for="(w, n) in outcome.report.warnings" :key="n">{{ w }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { SiteSpecConflict, SiteSpecOutcome } from '../../utils/site-spec-api'

defineProps<{
  outcome: SiteSpecOutcome
  name: string
  rootPath: string
  /** the prefix of the test ids: `site-spec` in the specification window, `wizard` in the wizard */
  prefix: string
  notes?: string[]
}>()
const emit = defineEmits<{
  (e: 'update:name', v: string): void
  (e: 'update:rootPath', v: string): void
  (e: 'recheck'): void
  (e: 'choose', c: SiteSpecConflict, choice: 'existing' | 'new'): void
}>()
</script>

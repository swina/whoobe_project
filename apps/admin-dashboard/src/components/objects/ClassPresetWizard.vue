<template>
  <BaseModal :open="true" size="lg" @close="$emit('close')">
    <template #header>
      <h2 class="ui-modal-title">{{ preset ? `New ${preset.title} class` : 'New class from a template' }}</h2>
    </template>

    <div v-if="!preset" class="grid grid-cols-1 gap-2" data-testid="class-preset-list">
      <button
        v-for="p in CLASS_PRESETS"
        :key="p.key"
        type="button"
        class="text-left rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40 px-3 py-2 hover:border-indigo-500"
        :data-testid="`class-preset-${p.key}`"
        @click="choose(p)"
      >
        <div class="text-sm font-semibold text-slate-200 light:text-slate-800">{{ p.title }}</div>
        <div class="text-xs text-slate-500">{{ p.description }}</div>
      </button>
    </div>

    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Name (identifier)</label>
          <input v-model="name" type="text" class="field w-full" :class="{ 'border-rose-500': nameTaken }" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Label</label>
          <input v-model="label" type="text" class="field w-full" />
        </div>
      </div>
      <p v-if="nameTaken" class="text-xs text-rose-400">A class named "{{ name.trim() }}" already exists.</p>

      <div v-if="preset.key === 'product' && fieldOn('category')" class="space-y-1">
        <label class="block text-xs font-semibold text-slate-400 light:text-slate-600">Category field relates to</label>
        <select v-model="target" class="field w-full">
          <option v-for="c in dataClassesStore.classes" :key="c.id" :value="c.name">{{ c.label }} ({{ c.name }})</option>
          <option value="__new">Create a new Category class too</option>
        </select>
      </div>

      <div class="space-y-3">
        <div v-for="section in sections" :key="section.title">
          <div class="text-[11px] font-semibold text-slate-500 uppercase mb-1">{{ section.title }}</div>
          <label v-for="p in section.fields" :key="p.field.name" class="flex items-center gap-2 py-0.5 text-sm text-slate-300 light:text-slate-700">
            <input type="checkbox" :checked="fieldOn(p.field.name)" :disabled="p.field.mandatory" class="w-3.5 h-3.5 rounded" @change="toggle(p.field.name)" />
            <span>{{ p.field.title }}</span>
            <span class="text-xs text-slate-500 font-mono">{{ p.field.name }} · {{ p.field.fieldType }}<template v-if="p.field.mandatory"> · required</template></span>
          </label>
        </div>
      </div>
      <p class="text-xs text-slate-500">You can change everything afterwards in the class editor (fields, View Layout, List Layout).</p>
    </div>

    <template #footer>
      <button v-if="preset" type="button" class="btn btn-link" @click="preset = null">Back</button>
      <button type="button" class="btn btn-link-muted" @click="$emit('close')">Cancel</button>
      <button v-if="preset" type="button" class="btn btn-primary" :disabled="busy || !canCreate" data-testid="class-preset-create" @click="create">{{ busy ? 'Creating…' : 'Create class' }}</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
// Wizard behind "+ From template" (ClassSettingsCard.vue): pick Contact / Category / Product, rename it, tick the fields wanted, create.
// A Product's category relation points at an existing class or at a Category class created first, in the same step.
import { computed, ref } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import { useDataClassesStore } from '../../stores/dataClassesStore'
import { useToastStore } from '../../stores/toastStore'
import { CLASS_PRESETS, buildPreset, type ClassPreset } from '../../utils/class-presets'

const emit = defineEmits<{ (e: 'close'): void; (e: 'created', id: string): void }>()

const dataClassesStore = useDataClassesStore()
const toastStore = useToastStore()

const preset = ref<ClassPreset | null>(null)
const name = ref('')
const label = ref('')
const picked = ref<Set<string>>(new Set())
const target = ref('')
const busy = ref(false)

const sections = computed(() => {
  const out: { title: string; fields: ClassPreset['fields'] }[] = []
  for (const p of preset.value?.fields ?? []) {
    let s = out.find((x) => x.title === p.section)
    if (!s) out.push((s = { title: p.section, fields: [] }))
    s.fields.push(p)
  }
  return out
})
const fieldOn = (n: string) => picked.value.has(n)
function toggle(n: string) {
  const next = new Set(picked.value)
  if (!next.delete(n)) next.add(n)
  picked.value = next
}

const exists = (n: string) => dataClassesStore.classes.some((c) => c.name.toLowerCase() === n.trim().toLowerCase())
const nameTaken = computed(() => exists(name.value))
const canCreate = computed(() => !!name.value.trim() && !!label.value.trim() && !nameTaken.value && /^[A-Za-z][A-Za-z0-9_]*$/.test(name.value.trim()))

function choose(p: ClassPreset) {
  preset.value = p
  name.value = p.name
  label.value = p.label
  picked.value = new Set(p.fields.filter((x) => !x.optional).map((x) => x.field.name))
  // a Product relates to a class called Category when there is one, else offers to create it
  const category = dataClassesStore.classes.find((c) => c.name.toLowerCase() === 'category')
  target.value = category?.name ?? '__new'
  if (p.key === 'category' && exists(p.name)) name.value = `${p.name}2`
}

async function create() {
  const p = preset.value
  if (!p || !canCreate.value) return
  busy.value = true
  try {
    let relationTarget: string | undefined
    if (p.key === 'product' && fieldOn('category')) {
      if (target.value === '__new') {
        const cat = CLASS_PRESETS.find((c) => c.key === 'category')!
        const catName = exists(cat.name) ? `${cat.name}Group` : cat.name
        await dataClassesStore.createDataClass(buildPreset(cat, { name: catName, label: cat.label, fieldNames: cat.fields.filter((x) => !x.optional).map((x) => x.field.name) }))
        relationTarget = catName
      } else {
        relationTarget = target.value
      }
    }
    const created = await dataClassesStore.createDataClass(buildPreset(p, { name: name.value, label: label.value, fieldNames: [...picked.value], relationTarget }))
    toastStore.show(`Class "${created.label}" created`)
    emit('created', created.id)
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to create class')
  } finally {
    busy.value = false
  }
}
</script>

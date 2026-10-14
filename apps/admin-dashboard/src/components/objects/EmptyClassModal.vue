<template>
  <BaseModal :open="true" size="md" @close="$emit('close')">
    <template #header><h2 class="ui-modal-title">Empty data of "{{ dataClass.label }}"</h2></template>

    <div class="space-y-3 text-sm">
      <p class="text-rose-400 font-semibold" data-testid="empty-class-warning">
        This deletes <span v-if="count !== null">all {{ count }}</span><span v-else>every</span> object of the class "{{ dataClass.name }}", in every language, published or not. It cannot be undone.
      </p>
      <p class="text-xs text-slate-500">The class and its fields stay. Objects of other classes that point to these ones will lose the link.</p>
      <div>
        <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">Type <span class="font-mono text-slate-300 light:text-slate-700">{{ dataClass.name }}</span> to confirm</label>
        <input v-model="typed" type="text" class="field w-full font-mono" data-testid="empty-class-confirm" autocomplete="off" @keydown.enter="canEmpty && run()" />
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn btn-link-muted" @click="$emit('close')">Cancel</button>
      <button type="button" class="btn btn-danger" :disabled="!canEmpty || busy" data-testid="empty-class-run" @click="run">{{ busy ? 'Deleting…' : 'Empty data' }}</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
// Confirmation for "Empty data" (ClassSettingsCard.vue, ObjectsView.vue): shows how many objects will go and asks for the class name.
import { computed, onMounted, ref } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import type { DataClass } from '../../utils/data-classes-api'
import { emptyDataClass, fetchDataClassObjectCount } from '../../utils/data-classes-api'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'

const props = defineProps<{ dataClass: Pick<DataClass, 'id' | 'name' | 'label'> }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'emptied', deleted: number): void }>()

const authStore = useAuthStore()
const toastStore = useToastStore()
const typed = ref('')
const count = ref<number | null>(null)
const busy = ref(false)
const canEmpty = computed(() => typed.value === props.dataClass.name)

onMounted(async () => {
  try { count.value = await fetchDataClassObjectCount(authStore.config.coreApiUrl, props.dataClass.id) } catch { count.value = null }
})

async function run() {
  busy.value = true
  try {
    const deleted = await emptyDataClass(authStore.config.coreApiUrl, props.dataClass.id, typed.value)
    toastStore.show(`${deleted} object(s) deleted from "${props.dataClass.label}"`)
    emit('emptied', deleted)
    emit('close')
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to empty the class')
  } finally {
    busy.value = false
  }
}
</script>

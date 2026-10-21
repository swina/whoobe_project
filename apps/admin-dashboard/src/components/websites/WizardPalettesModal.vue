<template>
  <BaseModal :open="true" size="lg" title="Palettes of the wizard" @close="emit('close')">
    <PalettesManager :options="options" @changed="(id) => emit('changed', id)" />
    <template #footer>
      <button class="btn btn-secondary" data-testid="palettes-close" @click="emit('close')">Close</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
// The window of the wizard for the palettes: the same management as the section Palettes of the main menu.
import BaseModal from '../ui/BaseModal.vue'
import PalettesManager from './PalettesManager.vue'
import type { WizardOptions } from '../../utils/site-wizard-api'

defineProps<{ options: WizardOptions }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed', saved?: string): void }>()
</script>

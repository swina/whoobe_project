<template>
  <BaseModal :open="true" size="lg" @close="$emit('close')">
    <template #header>
      <h2 class="ui-modal-title flex items-center gap-2">Preview Links</h2>
    </template>
    <div class="space-y-4">
        <div class="min-h-0 space-y-2">
        <p v-if="links.length === 0" class="text-xs text-slate-500 italic text-center py-6">No preview links yet.</p>
        <div
          v-for="link in links"
          :key="link.token"
          :class="['rounded-lg border px-3 py-2 flex items-center justify-between gap-3', isInactive(link) ? 'border-slate-800/60 light:border-slate-200/60 opacity-70' : 'border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40']"
        >
          <div class="min-w-0">
            <div class="text-xs font-mono text-slate-300 light:text-slate-700 truncate" :title="urlFor(link.token)">{{ urlFor(link.token) }}</div>
            <div class="text-[10px] text-slate-500">
              <span v-if="link.revokedAt" class="text-rose-400 font-semibold uppercase">Revoked</span>
              <span v-else-if="isExpired(link)" class="text-amber-400 font-semibold uppercase">Expired</span>
              <span v-else>Expires {{ new Date(link.expiresAt).toLocaleString() }}</span>
              · {{ link.viewCount }} view(s)
            </div>
          </div>
          <div class="shrink-0 flex items-center gap-3 text-[11px] font-semibold">
            <template v-if="!isInactive(link)">
              <a :href="urlFor(link.token)" target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:text-indigo-300">Open</a>
              <button type="button" class="btn btn-link" @click="copy(link.token)">Copy</button>
              <button type="button" class="btn btn-link-danger" @click="$emit('revoke', link.token)">Revoke</button>
            </template>
            <button v-else type="button" class="btn btn-link-danger" title="Delete this revoked or expired link permanently" @click="$emit('delete', link.token)">Delete</button>
          </div>
        </div>
      </div>

    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '../ui/BaseModal.vue'
// The preview links of one Data Object (object-publish-workflow-plan.md
// §2.3/§5), shown in a modal opened from MasterObjectTab's header. A revoked
// link or an expired one stays listed (with its view count) and gets a Delete
// action, which removes it for good - the server only allows that once the link
// is no longer usable.
import { onMounted, onUnmounted } from 'vue'
import type { PreviewToken } from '../../utils/data-objects-api'
import { useToastStore } from '../../stores/toastStore'

const props = defineProps<{
  links: PreviewToken[]
  generating: boolean
  urlFor: (token: string) => string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'generate'): void
  (e: 'revoke', token: string): void
  (e: 'delete', token: string): void
}>()

const toastStore = useToastStore()

function isExpired(link: PreviewToken): boolean {
  return new Date(link.expiresAt).getTime() <= Date.now()
}

/** Revoked or expired: no longer usable, so it can only be deleted. */
function isInactive(link: PreviewToken): boolean {
  return !!link.revokedAt || isExpired(link)
}

async function copy(token: string) {
  try {
    await navigator.clipboard.writeText(props.urlFor(token))
    toastStore.show('Link copied')
  } catch {
    // navigator.clipboard is unavailable outside secure contexts.
    toastStore.show('Could not copy - select the link and copy it manually')
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

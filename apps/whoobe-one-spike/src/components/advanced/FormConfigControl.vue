<template>
  <div v-if="formConfig" class="p-2 border-b bg-white">
    <button
      type="button"
      class="text-xs border rounded px-2 py-1.5 w-full bg-gray-50 flex items-center justify-between hover:border-indigo-400"
      @click="showModal = true"
    >
      <span class="font-semibold text-gray-600">Form</span>
      <span class="text-indigo-600 font-semibold shrink-0 ml-2 truncate">{{ summaryLabel }}</span>
    </button>

    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="showModal = false">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden text-sm">
          <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
            <span class="text-xs font-semibold text-gray-600">Form configuration</span>
            <button type="button" class="text-gray-400 hover:text-gray-700" @click="showModal = false"><X class="w-4 h-4" /></button>
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
            <label class="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" v-model="formConfig.enabled" />
              Handle submissions
            </label>

            <template v-if="formConfig.enabled">
              <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
                Target class
                <select v-model="formConfig.targetClassId" class="text-xs border rounded px-1.5 py-1 bg-white">
                  <option value="">select a data class...</option>
                  <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.label }}</option>
                </select>
              </label>
              <p class="text-[10px] text-gray-400">
                Each input's Name attribute (Advanced &gt; Attributes) must match a field name on the target class.
              </p>

              <div class="flex flex-col gap-1 border rounded p-1.5">
                <span class="text-[10px] font-semibold text-emerald-700 uppercase">On success</span>
                <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
                  Message
                  <textarea v-model="formConfig.successMessage" class="w-full text-xs border rounded p-1 h-12 resize-y" placeholder="Thanks, we'll be in touch."></textarea>
                </label>
                <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
                  Redirect URL (optional - overrides the message above)
                  <input v-model="formConfig.successRedirectUrl" type="text" class="text-xs border rounded px-1.5 py-1" placeholder="/thank-you" />
                </label>
              </div>

              <div class="flex flex-col gap-1 border rounded p-1.5">
                <span class="text-[10px] font-semibold text-rose-700 uppercase">On error</span>
                <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
                  Message
                  <textarea v-model="formConfig.errorMessage" class="w-full text-xs border rounded p-1 h-12 resize-y" placeholder="Something went wrong, please try again."></textarea>
                </label>
                <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
                  Redirect URL (optional - overrides the message above)
                  <input v-model="formConfig.errorRedirectUrl" type="text" class="text-xs border rounded px-1.5 py-1" placeholder="/error" />
                </label>
              </div>

              <div v-if="formConfig.notify" class="flex flex-col gap-1 border rounded p-1.5">
                <label class="flex items-center gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" v-model="formConfig.notify.enabled" />
                  Email notification
                </label>
                <template v-if="formConfig.notify.enabled">
                  <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
                    Mail template
                    <select v-model="formConfig.notify.mailTemplateId" class="text-xs border rounded px-1.5 py-1 bg-white">
                      <option value="">select a mail template...</option>
                      <option v-for="t in mailTemplates" :key="t.id" :value="t.id">{{ t.name }}</option>
                    </select>
                  </label>
                  <p v-if="!formConfig.notify.mailTemplateId" class="text-[10px] text-amber-600">
                    If blank, the legacy template page below (whoobe_pages) is used if set.
                  </p>
                  <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
                    Template page (legacy)
                    <select v-model="formConfig.notify.templatePageId" class="text-xs border rounded px-1.5 py-1 bg-white">
                      <option value="">select a page...</option>
                      <option v-for="p in pages" :key="p.id" :value="p.id">{{ p.title }}</option>
                    </select>
                  </label>
                  <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
                    Recipient email
                    <input v-model="formConfig.notify.recipientEmail" type="email" class="text-xs border rounded px-1.5 py-1" placeholder="team@example.com" />
                  </label>
                  <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
                    Subject
                    <input v-model="formConfig.notify.subject" type="text" class="text-xs border rounded px-1.5 py-1" placeholder="New form submission" />
                  </label>
                </template>
              </div>
            </template>
          </div>

          <div class="flex items-center justify-end gap-2 px-3 py-2 border-t shrink-0">
            <button type="button" class="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-500" @click="showModal = false">Done</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
// Standalone control rendered by AdvancedPanel.vue (only for tag === 'form'
// elements), not one of its accordion sections - a Form's config is a
// one-off dialog an admin opens to set up submission handling, not a style
// knob glanced at/tweaked repeatedly like Style/Attributes/Animation, so it
// gets a proper modal (same Teleport-overlay shape as tailwind-controls/
// DataBindingTransformControl.vue) instead of an inline accordion body.
// Unlike that modal, this one still direct-mutates editor.current.
// formConfig live (no draft/Apply staging) - every field here already
// writes straight through the same way AlpineControl.vue's fields do, and
// there's no per-keystroke live-canvas side effect to defer here the way
// DataBindingTransformControl.vue's per-keystroke valueMap rule editing had.
import { computed, onMounted, ref } from 'vue'
import { X } from '@lucide/vue'
import { useEditorStore } from '../../store/editor'
import { listDataClasses, type DataClassRecord } from '../../data-objects-api'
import { listPages, type WhoobeOnePage } from '../../pages-api'
import { listMailTemplates, type MailTemplateSummary } from '../../mail-templates-api'
import type { ElementFormConfig } from '../../scripts/ElementsClass.js'

defineProps<{ attr?: string; title?: string }>()

const editor = useEditorStore()
const classes = ref<DataClassRecord[]>([])
const pages = ref<WhoobeOnePage[]>([])
const mailTemplates = ref<MailTemplateSummary[]>([])
const showModal = ref(false)

onMounted(async () => {
  try {
    classes.value = await listDataClasses()
  } catch (e) {
    console.warn('[FormConfigControl] Failed to load data classes:', e)
  }
  try {
    pages.value = await listPages()
  } catch (e) {
    console.warn('[FormConfigControl] Failed to load pages:', e)
  }
  try {
    mailTemplates.value = await listMailTemplates()
  } catch (e) {
    console.warn('[FormConfigControl] Failed to load mail templates:', e)
  }
})

// Backfills `notify` in place for a Form saved before that field existed -
// same "absent until actually set" treatment other late-added fields on
// this Element model get (see ElementsClass.d.ts), but this one needs a
// real default object (not just an optional read) since v-model writes
// straight into it.
const formConfig = computed(() => {
  const config = (editor.current as any)?.formConfig as ElementFormConfig | undefined
  if (config && !config.notify) {
    config.notify = { enabled: false, mailTemplateId: '', templatePageId: '', recipientEmail: '', subject: '' }
  }
  // Backfill mailTemplateId in place for a Form saved before it existed.
  // Cast: `in` on a now-mandatory field makes the falsy branch `never`.
  if (config?.notify && !('mailTemplateId' in config.notify)) {
    ;(config.notify as any).mailTemplateId = ''
  }
  return config
})

const summaryLabel = computed(() => {
  if (!formConfig.value?.enabled) return 'Not configured'
  const cls = classes.value.find((c) => c.id === formConfig.value?.targetClassId)
  return cls ? `→ ${cls.label}` : 'Enabled'
})
</script>

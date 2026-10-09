<template>
  <Teleport to="body">
    <div v-if="open" class="ui-modal-overlay" :class="{ 'is-top': align === 'top' }" data-testid="modal-overlay" @mousedown.self="onOverlay">
      <div
        ref="panel"
        class="ui-modal"
        :class="`ui-modal-${size}`"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : undefined"
        tabindex="-1"
        :data-testid="testid"
        @keydown.tab="trapTab"
      >
        <header v-if="title || $slots.header || $slots.actions || !hideClose" class="ui-modal-header">
          <div class="min-w-0 flex-1">
            <slot name="header">
              <h2 :id="titleId" class="ui-modal-title">{{ title }}</h2>
              <p v-if="subtitle" class="ui-modal-subtitle">{{ subtitle }}</p>
            </slot>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <slot name="actions" />
            <button v-if="!hideClose" type="button" class="btn btn-ghost btn-icon" aria-label="Close" title="Close (Esc)" data-testid="modal-close" @click="$emit('close')">
              <X class="w-4 h-4" />
            </button>
          </div>
        </header>
        <div class="ui-modal-body" :class="bodyClass"><slot /></div>
        <footer v-if="$slots.footer" class="ui-modal-footer"><slot name="footer" /></footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// The dashboard's one modal window (styles in styles/ui.css): the same overlay, panel, header, footer, sizes and light/dark colours
// everywhere, Esc and a click on the overlay to close (unless `persistent`), the focus kept inside and given back, the page behind
// not scrolling, and the topmost window the only one that answers Esc. Rendered in <body>, so no parent's overflow or z-index clips it.
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { lockPageScroll, modalStack, unlockPageScroll } from './modal-stack'

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  subtitle?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  align?: 'center' | 'top'
  /** Neither Esc nor a click outside closes it (a form with unsaved work): only the buttons do. */
  persistent?: boolean
  hideClose?: boolean
  bodyClass?: string
  testid?: string
}>(), { size: 'md', align: 'center' })
const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)
const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`

const me = Symbol('modal')
let opener: HTMLElement | null = null
let locked = false

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !props.persistent && modalStack.isTop(me)) { e.stopPropagation(); emit('close') }
}
function onOverlay() { if (!props.persistent) emit('close') }

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
function trapTab(e: KeyboardEvent) {
  const nodes = [...(panel.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((n) => n.offsetParent !== null)
  if (nodes.length === 0) { e.preventDefault(); panel.value?.focus(); return }
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (e.shiftKey && (active === first || active === panel.value)) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
}

function opened() {
  opener = document.activeElement as HTMLElement | null
  modalStack.push(me)
  locked = true
  lockPageScroll()
  window.addEventListener('keydown', onKey, true)
  void nextTick(() => {
    const mine = panel.value?.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
    ;(mine ?? panel.value)?.focus()
  })
}
function closed() {
  modalStack.remove(me)
  if (locked) { locked = false; unlockPageScroll() }
  window.removeEventListener('keydown', onKey, true)
  const back = opener
  opener = null
  if (back && document.contains(back)) void nextTick(() => back.focus({ preventScroll: true }))
}

watch(() => props.open, (v, was) => { if (v && !was) opened(); else if (!v && was) closed() }, { immediate: true })
onBeforeUnmount(() => { if (props.open) closed() })
</script>

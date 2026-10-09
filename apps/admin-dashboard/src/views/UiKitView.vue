<template>
  <div class="min-h-full p-8 bg-slate-950 light:bg-slate-50 text-slate-200 light:text-slate-800" data-testid="ui-kit">
    <div class="max-w-5xl mx-auto space-y-10">
      <header class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-slate-50 light:text-slate-900">UI kit</h1>
          <p class="text-sm text-slate-400 light:text-slate-600">The shared look of the dashboard - font, buttons, fields, windows - in both themes. Reference for new screens; styles in <code>src/styles/ui.css</code>.</p>
        </div>
        <button class="btn btn-secondary" data-testid="kit-theme" @click="theme.toggleTheme()">{{ theme.theme === 'dark' ? 'Light theme' : 'Dark theme' }}</button>
      </header>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">Font</h2>
        <p class="text-base">Inter, then the system's: <span class="font-semibold">Semibold</span> <span class="font-bold">Bold</span> <span class="italic">Italic</span> — 0123456789 — The quick brown fox jumps over the lazy dog.</p>
        <p class="text-sm text-slate-400 light:text-slate-600">Small text, <code class="font-mono text-xs px-1 rounded bg-slate-800 light:bg-slate-200">code and identifiers use the monospace face</code>, and <input class="field font-mono !w-56 inline-block" value="/docs/product" aria-label="a path" /> keeps it in a field.</p>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">Buttons</h2>
        <div class="flex flex-wrap items-center gap-2" data-testid="kit-buttons">
          <button v-for="v in variants" :key="v" class="btn" :class="`btn-${v}`">{{ v }}</button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button v-for="v in variants" :key="v" class="btn btn-sm" :class="`btn-${v}`">{{ v }} sm</button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button v-for="v in variants" :key="v" class="btn" :class="`btn-${v}`" disabled>{{ v }}</button>
          <button class="btn btn-primary btn-lg">Large</button>
          <button class="btn btn-ghost btn-icon" aria-label="Settings"><Settings class="w-4 h-4" /></button>
        </div>
      </section>

      <section class="space-y-3 max-w-xl">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">Fields</h2>
        <div><label class="field-label" for="k1">Name</label><input id="k1" class="field" placeholder="Placeholder text" /><p class="field-hint">A hint under the field.</p></div>
        <div><label class="field-label" for="k2">Invalid</label><input id="k2" class="field field-error" value="oops" /></div>
        <div><label class="field-label" for="k3">Choice</label><select id="k3" class="field"><option>One</option><option>Two</option></select></div>
        <div><label class="field-label" for="k4">Text</label><textarea id="k4" class="field" rows="3" placeholder="Longer text"></textarea></div>
        <div><label class="field-label" for="k5">Disabled</label><input id="k5" class="field" value="not editable" disabled /></div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">Windows</h2>
        <div class="flex flex-wrap gap-2">
          <button v-for="s in sizes" :key="s" class="btn btn-soft-primary" :data-testid="`kit-open-${s}`" @click="open = s">Open {{ s }}</button>
          <button class="btn btn-soft-warning" data-testid="kit-open-nested" @click="nested = true">Nested windows</button>
        </div>
      </section>
    </div>

    <BaseModal :open="!!open" :title="`A ${open} window`" subtitle="Title, subtitle, content and actions" :size="open || 'md'" @close="open = null">
      <p class="text-sm">Esc, the close button and a click outside close it. The focus stays inside, and goes back to the button that opened it.</p>
      <div class="mt-3"><label class="field-label" for="m1">Name</label><input id="m1" class="field" data-autofocus placeholder="The first field gets the focus" /></div>
      <template #footer>
        <button class="btn btn-ghost" @click="open = null">Cancel</button>
        <button class="btn btn-primary" @click="open = null">Save</button>
      </template>
    </BaseModal>

    <BaseModal :open="nested" title="First window" size="lg" @close="nested = false">
      <p class="text-sm">Esc closes only the window on top.</p>
      <button class="btn btn-secondary mt-3" data-testid="kit-open-inner" @click="inner = true">Open another</button>
    </BaseModal>
    <BaseModal :open="inner" title="Second window" size="sm" @close="inner = false">
      <p class="text-sm">On top of the first.</p>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Settings } from '@lucide/vue'
import BaseModal from '../components/ui/BaseModal.vue'
import { useThemeStore } from '../stores/themeStore'

const theme = useThemeStore()
const variants = ['primary', 'secondary', 'ghost', 'danger', 'success', 'warning', 'link', 'soft-primary', 'soft-success', 'soft-danger', 'soft-warning']
const sizes = ['sm', 'md', 'lg', 'xl'] as const
const open = ref<(typeof sizes)[number] | null>(null)
const nested = ref(false)
const inner = ref(false)
</script>

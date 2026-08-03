<template>
  <div class="w-64 shrink-0 overflow-y-auto flex flex-col text-xs">
    <div v-if="!editor.current" class="p-3 text-gray-400">Select an element to customize</div>
    <template v-else>
      <template v-for="group in visibleGroups" :key="group.label">
        <button
          type="button"
          class="w-full flex items-center justify-between px-3 py-2 font-semibold capitalize text-gray-600 hover:bg-gray-50 border-b"
          @click="openGroup = openGroup === group.label ? null : group.label"
        >
          {{ group.label }}
          <span class="text-gray-400">{{ openGroup === group.label ? '−' : '+' }}</span>
        </button>

        <div v-if="openGroup === group.label" class="p-2 space-y-3 border-b bg-gray-50">
          <template v-for="control in group.components" :key="control.attr">
            <component
              v-if="controlComponent(control.name)"
              :is="controlComponent(control.name)"
              :attr="control.attr"
              :title="control.title || control.attr"
            />
          </template>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's src/components/blocks/tailwind/BlockTailwind.
// vue - the "customize any TailwindCSS utility" panel, driven by tw.groups.
// js (Phase 1, dormant until now) resolving to the control atoms in
// ./tailwind-controls/. One group open at a time (accordion), matching the
// source's own behavior.
//
// The button and its own conditional content div must live inside the same
// v-for iteration (one <template v-for> per group, not a v-for on the
// buttons plus one global v-if after the loop) - a real bug caught after
// the fact: with the content rendered separately after the whole button
// list, the expanded panel always appeared at the very bottom regardless
// of which group was actually clicked, instead of right underneath it.
//
// Not ported: Position/BgPosition/BgGradient/BgGradientPresets/TextFont
// controls (`controlComponent()` returns null for these, and the `v-if`
// above just skips rendering them - font-family picking, gradient presets,
// and CSS position controls are all real features with no equivalent
// built yet, not attempted here). Text/background color pickers
// (tailwind.color.vue/tailwind.bgcolor.vue) aren't ported either, but this
// matches the *source's own* current state, not a gap this port
// introduces - both are commented out in tw.groups.js already; only
// BorderColor is actually wired up there.
import { computed, ref } from 'vue'
import twgroups from '../scripts/tw.groups.js'
import { useEditorStore } from '../store/editor'
import OptionsControl from './tailwind-controls/OptionsControl.vue'
import RangeControl from './tailwind-controls/RangeControl.vue'
import CheckboxControl from './tailwind-controls/CheckboxControl.vue'
import ButtonControl from './tailwind-controls/ButtonControl.vue'
import BorderColorControl from './tailwind-controls/BorderColorControl.vue'
import CustomClassesControl from './tailwind-controls/CustomClassesControl.vue'

interface TwControl {
  name: string
  attr: string
  title?: string
}
interface TwGroup {
  label: string
  filter?: string[]
  components: TwControl[]
}

const editor = useEditorStore()
const openGroup = ref<string | null>(null)

const groups = twgroups as unknown as TwGroup[]

// Not from tw.groups.js - no source equivalent (see CustomClassesControl.
// vue's own header). Appended unconditionally, not filtered by tag like
// the ported groups above: unlike e.g. the "grid" group (only meaningful
// for grid containers), typing arbitrary classes is valid for any node.
const CUSTOM_CLASSES_GROUP: TwGroup = {
  label: 'custom classes',
  components: [{ name: 'CustomClasses', attr: 'css' }],
}

const visibleGroups = computed(() => {
  if (!editor.current) return []
  const tag = editor.current.tag
  return [...groups.filter((g) => !g.filter || g.filter.includes(tag)), CUSTOM_CLASSES_GROUP]
})

const componentMap: Record<string, unknown> = {
  Options: OptionsControl,
  Width: OptionsControl,
  Height: OptionsControl,
  Range: RangeControl,
  Checkbox: CheckboxControl,
  Button: ButtonControl,
  BorderColor: BorderColorControl,
  CustomClasses: CustomClassesControl,
}

function controlComponent(name: string) {
  return componentMap[name] ?? null
}
</script>

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
          <ChevronDown v-if="openGroup === group.label" class="w-3.5 h-3.5 text-gray-400" />
          <ChevronRight v-else class="w-3.5 h-3.5 text-gray-400" />
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
import { ChevronDown, ChevronRight } from '@lucide/vue'
import twgroups from '../scripts/tw.groups.js'
import { useEditorStore } from '../store/editor'
import OptionsControl from './tailwind-controls/OptionsControl.vue'
import RangeControl from './tailwind-controls/RangeControl.vue'
import CheckboxControl from './tailwind-controls/CheckboxControl.vue'
import ButtonControl from './tailwind-controls/ButtonControl.vue'
import BorderColorControl from './tailwind-controls/BorderColorControl.vue'
import CustomClassesControl from './tailwind-controls/CustomClassesControl.vue'
import SemanticControl from './tailwind-controls/SemanticControl.vue'
import DataBindingTransformControl from './tailwind-controls/DataBindingTransformControl.vue'

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

// Also not from tw.groups.js - a second place to reach the same setting
// FloatingToolbar.vue's own "Semantic tag" popover already controls (both
// read/write the identical `editor.current.semantic` field, so there's
// nothing to keep in sync between them). Gated on `type === 'container'`,
// unlike Custom Classes above - a leaf element's own `semantic` would be
// real, storable data, but nothing ever reads it (BlockElement.vue only
// ever renders its `element` field), so showing this control for one
// would silently do nothing, not just "not apply to every node" the way
// e.g. the grid-only ported groups already don't.
const SEMANTIC_GROUP: TwGroup = {
  label: 'semantic',
  components: [{ name: 'Semantic', attr: 'semantic', title: 'Renders as' }],
}

// Not from tw.groups.js either - lets a data-bound element's displayed
// value be reformatted (date/number/url-as-link/truncate) without leaving
// this sidebar, the same way every other post-bind setting already works
// here. Shown for 'content'-target bindings, and for 'src'-target bindings
// on an <img> element specifically - bindingTarget() in FloatingToolbar.vue
// always targets an image binding at 'src' (there is no reachable path
// that ever produces target 'alt' today, despite DataObjectPicker.vue's
// own fieldCompatibleWithTarget() having a case for it - same kind of
// forward-looking dead branch as its 'datetime' fieldType check), and
// BlockElement.vue/BlockElementPreview.vue's displayAlt reuses that same
// binding's resolved+transformed value as the image's alt text. Excluded
// for 'href'/'icon'/'custom' targets - their resolved values never flow
// through a transform-aware render path (href isn't applied to the DOM at
// all yet, a pre-existing gap; icon/custom values are used as-is).
//
// No fieldType-based gating here (unlike DataBindingTransformControl.vue's
// own availableTransformers) - truncate's 'any' applicableFieldTypes gate
// means at least one transformer is always offered regardless of fieldType,
// so a field-type check here would never actually hide the group; deciding
// *which* transformers show is entirely that control's own job, including
// its fallback lookup for bindings saved before fieldType existed (see
// resolve-binding-field-type.ts).
const DATA_BINDING_GROUP: TwGroup = {
  label: 'data binding',
  components: [{ name: 'DataBindingTransform', attr: 'dataBinding', title: 'Format bound value' }],
}

const visibleGroups = computed(() => {
  if (!editor.current) return []
  const tag = editor.current.tag
  const isContainer = (editor.current as any).type === 'container'
  const db = (editor.current as any).dataBinding
  const isImgSrcBinding = db?.target === 'src' && (editor.current as any).element === 'img'
  const showDataBinding = db && (db.target === 'content' || isImgSrcBinding)
  return [
    ...groups.filter((g) => !g.filter || g.filter.includes(tag)),
    ...(isContainer ? [SEMANTIC_GROUP] : []),
    ...(showDataBinding ? [DATA_BINDING_GROUP] : []),
    CUSTOM_CLASSES_GROUP,
  ]
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
  Semantic: SemanticControl,
  DataBindingTransform: DataBindingTransformControl,
}

function controlComponent(name: string) {
  return componentMap[name] ?? null
}
</script>

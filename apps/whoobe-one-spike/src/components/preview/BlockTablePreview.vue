<template>
  <table :id="doc.id" ref="rootEl" :class="classe" :style="stile" v-bind="extraAttrs">
    <caption v-if="table.caption">{{ table.caption }}</caption>
    <thead v-if="table.hasHeader">
      <tr :class="table.headerRowClass">
        <template v-for="(cell, c) in table.header" :key="cell.id">
          <th
            v-if="!cell.merged"
            :colspan="cell.colspan > 1 ? cell.colspan : undefined"
            :class="[table.headerCellClass, cell.cellClass]"
            v-html="safeHtml(cell.content)"
          ></th>
        </template>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, r) in table.body" :key="r" :class="table.bodyRowClass">
        <template v-for="cell in row" :key="cell.id">
          <td
            v-if="!cell.merged"
            :colspan="cell.colspan > 1 ? cell.colspan : undefined"
            :rowspan="cell.rowspan > 1 ? cell.rowspan : undefined"
            :class="[table.bodyCellClass, cell.cellClass]"
            v-html="safeHtml(cell.content)"
          ></td>
        </template>
      </tr>
    </tbody>
    <tfoot v-if="table.hasFooter">
      <tr :class="table.footerRowClass">
        <template v-for="(cell, c) in table.footer" :key="cell.id">
          <td
            v-if="!cell.merged"
            :colspan="cell.colspan > 1 ? cell.colspan : undefined"
            :class="[table.footerCellClass, cell.cellClass]"
            v-html="safeHtml(cell.content)"
          ></td>
        </template>
      </tr>
    </tfoot>
  </table>
</template>

<script setup lang="ts">
import { sanitizeRichText as safeHtml } from '@whoobe-cms/schema'
// Read-only preview/publish-time counterpart to ../BlockTable.vue - see
// that file's/ElementsClass.js's Table() header comment for the full
// grid-model rationale. No structure/cell toolbars, no contenteditable,
// no click-to-select here - just the saved header/body/footer grid
// rendered as a real semantic <table>, matching every other *Preview.vue
// in this folder's "no editing chrome" split from its live counterpart.
//
// Renders the <table> itself as the root node (no wrapper div, unlike
// ../BlockTable.vue's div-wraps-table structure, which only exists there
// to host the corner tag/toolbars) - css.css/css.container land on this
// one real element, same as BlockElementPreview.vue applies a leaf
// element's own classes directly to its rendered tag. No separate
// `table.tableClass` field - that would just be a second, competing class
// source targeting this exact same tag (see ElementsClass.js's Table()
// comment).
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type Element from '../../scripts/ElementsClass.js'
import { resolveDisplayUrl } from '../../resolve-display-url'
import { customAttrs, safeAlpineValue } from '../../helpers'
import { mountAnimation } from '../../scripts/gsap-actions'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  doc: WhoobeElement
}>()

const table = computed(() => (props.doc as any).table as NonNullable<WhoobeElement['table']>)

const classe = computed(() => {
  const doc = props.doc as any
  return `${doc.css?.css ?? ''} ${doc.css?.container ?? ''}`.trim()
})

const stile = computed(() => {
  const doc = props.doc as any
  let st = ''
  const bgUrl = resolveDisplayUrl(doc.image?.url)
  if (bgUrl) st += `background-image:url(${bgUrl});`
  if (doc.font) st += `font-family:"${doc.font.replaceAll('+', ' ')}";`
  return st + (doc.style ?? '')
})

// Same alpine/custom-attribute wiring as BlockContainerPreview.vue/
// BlockIsometricPreview.vue - see BlockContainerPreview.vue's comment for
// the full rationale (why alpineAttrs drops empty values, why there's an
// explicit Alpine.initTree() call rather than relying only on Alpine's own
// MutationObserver).
const alpineAttrs = computed(() => {
  const alpine = (props.doc as any).alpine as Record<string, string> | undefined
  if (!alpine) return {}
  const result: Record<string, string> = {}
  for (const key of Object.keys(alpine)) {
    result[key] = alpine[key] ? safeAlpineValue(alpine[key], key) : ''
  }
  return result
})

const extraAttrs = computed(() => ({
  ...customAttrs((props.doc as any).data?.attributes),
  ...alpineAttrs.value,
}))

const rootEl = ref<HTMLElement | null>(null)
let stopAnimation: (() => void) | null = null

onMounted(() => {
  if (rootEl.value) stopAnimation = mountAnimation(props.doc, rootEl.value)
  if (rootEl.value && (window as any).Alpine) {
    nextTick(() => (window as any).Alpine.initTree(rootEl.value))
  }
})

onUnmounted(() => {
  stopAnimation?.()
})
</script>

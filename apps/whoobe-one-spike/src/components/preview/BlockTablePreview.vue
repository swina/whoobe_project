<template>
  <table :id="doc.id" ref="rootEl" :class="classe" :style="stile" v-bind="extraAttrs">
    <caption v-if="table.caption || (bound.isBound.value && table.searchable)">
      <div v-if="bound.isBound.value && table.searchable" class="text-left">
        <input v-model="bound.query.value" type="search" :placeholder="table.searchPlaceholder || 'Search…'" aria-label="Search the table" :class="table.searchClass || 'w-full max-w-xs px-3 py-1.5 mb-2 rounded border border-gray-300 text-sm'" @click.stop />
      </div>
      {{ table.caption }}</caption>
    <thead v-if="table.hasHeader">
      <tr :class="table.headerRowClass">
        <template v-if="bound.isBound.value">
          <th v-for="col in bound.columns.value" :key="col.id" :class="[table.headerCellClass, col.headerCellClass]" :aria-sort="bound.canSort(col) ? bound.ariaSort(col) : undefined">
              <button v-if="bound.canSort(col)" type="button" class="inline-flex items-center gap-1 text-left font-[inherit] cursor-pointer select-none" @click.stop="bound.setSort(col)">
                {{ col.header }}<span aria-hidden="true" class="text-[0.7em] opacity-70">{{ bound.sortMark(col) }}</span>
              </button>
              <template v-else>{{ col.header }}</template>
            </th>
        </template>
        <template v-else>
          <template v-for="(cell, c) in table.header" :key="cell.id">
            <th
              v-if="!cell.merged"
              :colspan="cell.colspan > 1 ? cell.colspan : undefined"
              :class="[table.headerCellClass, cell.cellClass]"
              v-html="safeHtml(cell.content)"
            ></th>
          </template>
        </template>
      </tr>
    </thead>
    <tbody v-if="bound.isBound.value">
      <tr v-for="row in bound.rows.value" :key="row.key" :class="table.bodyRowClass">
        <td v-for="cell in row.cells" :key="cell.key" :class="[table.bodyCellClass, cell.cellClass]">
          <a v-if="cell.result.kind === 'link'" :href="cell.result.href" :target="cell.result.target" rel="noopener noreferrer">{{ cell.result.text }}</a>
          <span v-else :class="cell.result.className">{{ cell.result.text }}</span>
        </td>
      </tr>
      <tr v-if="!bound.rows.value.length">
        <td :colspan="Math.max(1, bound.columns.value.length)" :class="table.bodyCellClass" class="text-center opacity-60">{{ bound.searching.value ? 'No matching rows' : (table.emptyText || 'No data') }}</td>
      </tr>
    </tbody>
    <tbody v-else>
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
    <!-- A bound table has no static footer (its rows come from the data); the pagination controls sit in the table, in one row. -->
    <tfoot v-if="bound.isBound.value && bound.hasFooter.value">
      <tr>
        <td :colspan="Math.max(1, bound.columns.value.length)" class="p-0">
          <div :class="bound.needsControls.value ? bound.pagination.value.containerClass : 'w-full flex justify-center p-2'">
            <span v-if="bound.showCount.value" :class="table.countClass || 'text-xs text-gray-500'" aria-live="polite">{{ bound.countLabel.value }}</span>
            <template v-if="bound.needsControls.value">
              <template v-if="bound.pagination.value.mode === 'standard'">
                <div class="flex items-center justify-center gap-3 text-xs text-gray-500">
                  <button type="button" class="px-2 py-1 rounded border disabled:opacity-40" :disabled="bound.page.value <= 1" @click="bound.prev()">‹ Prev</button>
                  <span>Page {{ bound.page.value }} of {{ bound.pages.value }}</span>
                  <button type="button" class="px-2 py-1 rounded border disabled:opacity-40" :disabled="bound.page.value >= bound.pages.value" @click="bound.next()">Next ›</button>
                </div>
              </template>
              <template v-else>
                <span v-if="!bound.showCount.value" class="text-xs text-gray-500">{{ bound.rows.value.length }} / {{ bound.total.value }}</span>
                <button v-if="bound.rows.value.length < bound.total.value" type="button" :class="bound.pagination.value.loadMoreClass" @click="bound.more()">{{ bound.pagination.value.loadMoreText }}</button>
              </template>
            </template>
          </div>
        </td>
      </tr>
    </tfoot>
    <tfoot v-else-if="table.hasFooter && !bound.isBound.value">
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
import { useBoundTable } from '../../composables/useBoundTable'
import type Element from '../../scripts/ElementsClass.js'
import { resolveDisplayUrl } from '../../resolve-display-url'
import { customAttrs, safeAlpineValue } from '../../helpers'
import { mountAnimation } from '../../scripts/gsap-actions'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  doc: WhoobeElement
}>()

const table = computed(() => (props.doc as any).table as NonNullable<WhoobeElement['table']>)
// Bound to a list (a Data Class query or a gateway array): the header and the rows come from the data, see useBoundTable.ts
const bound = useBoundTable(computed(() => props.doc))

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

<template>
  <!-- Semantic -->
  <component :is="semantic" :id="doc.id" ref="rootEl" :class="classe" :style="stile" v-bind="extraAttrs">
    <!-- Collection binding: this container is a repeater template - render
         its children once per resolved data object, each time providing
         that object's data to the whole subtree. -->
    <template v-if="collectionResolved.length">
      <template v-for="(obj, index) in pagedItems" :key="index">
        <template v-for="child in doc.blocks" :key="child.id">
          <a
          v-if="(child as any).link || (child as any).dynamicLink"
          :href="childHref(child, obj)"
          :target="(child as any).dynamicLink ? ((child as any).linkTarget || '_blank') : (child as any).linkTarget || undefined"
          :rel="(child as any).dynamicLink ? 'noopener noreferrer' : undefined"
          @click="onDynamicLinkClick($event, child, obj)"
          >
          <component :is="childComponent(child)" v-bind="boundChildProps(child, obj)" />
        </a>
        <component v-else :is="childComponent(child)" v-bind="boundChildProps(child, obj)" />
      </template>
    </template>
    
    <div :class="paginationContainerClass">
      <template v-if="rowsPerPage > 0 && collectionResolved.length > rowsPerPage">
        <div v-if="paginationMode === 'standard'" class="flex items-center justify-center gap-3 text-xs text-gray-500 py-2">
          <button type="button" class="px-2 py-1 rounded border disabled:opacity-40" :disabled="currentPage <= 1" @click="currentPage = Math.max(1, currentPage - 1)">‹ Prev</button>
          <span>Page {{ currentPage }} of {{ totalPages }}</span>
          <button type="button" class="px-2 py-1 rounded border disabled:opacity-40" :disabled="currentPage >= totalPages" @click="currentPage = Math.min(totalPages, currentPage + 1)">Next ›</button>
        </div>
        <div v-else class="flex flex-col items-center gap-2 py-2">
          <span class="text-xs text-gray-500">{{ visibleCount }} / {{ collectionResolved.length }}</span>
          <button
            v-if="visibleCount < collectionResolved.length"
            :class="loadMoreButtonClass"
            @click="loadMoreMore"
          >{{ loadMoreButtonText }}</button>
        </div>
      </template>
    </div>
    </template>
    <!-- Normal children, or a single-object binding (no field = whole object
         passed down to the subtree; with a field = only the bound element
         itself shows the value). -->
    <template v-else>
      <template v-for="child in doc.blocks" :key="child.id">
        <a v-if="(child as any).link" :href="(child as any).link" :target="(child as any).linkTarget || undefined">
          <component :is="childComponent(child)" v-bind="childPropsWithContext(child)" />
        </a>
        <component v-else :is="childComponent(child)" v-bind="childPropsWithContext(child)" />
      </template>
    </template>

    <!-- Submission result from form-actions.ts - only ever set on a
         tag === 'form' container with formConfig.enabled (see onMounted()
         below), stays empty/absent for every other container. Displayed as
         a click-to-close HTML popup over the page: the success/error
         message configured in FormConfigControl.vue renders as HTML, and
         any click dismisses it. On success form-actions.ts already resets
         the form; on error it leaves the values in place. -->
    <Teleport to="body">
      <div
        v-if="submitResult"
        class="fixed inset-0 z-[100000] bg-black/60 flex items-center justify-center p-4 cursor-pointer"
        @click="submitResult = null"
      >
        <div
          class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 relative text-sm cursor-default"
        >
          <button
            type="button"
            class="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Close"
            @click="submitResult = null"
          >
            <X class="w-4 h-4" />
          </button>
          <div
            v-html="safeHtml(submitResult.message)"
            :class="submitResult.ok ? 'text-emerald-700' : 'text-rose-700'"
          ></div>
        </div>
      </div>
    </Teleport>
  </component>
</template>

<script setup lang="ts">
import { sanitizeRichText as safeHtml } from '@whoobe-cms/schema'
// Read-only counterpart of ../BlockContainer.vue, for DocumentPreview.vue -
// port of whoobe-one-studio's src/components/blocks/preview/BlockContainer.
// vue. No dragula-container class, no click-to-select, no corner tag
// button/selection border/empty-container size floor - none of that is
// editing chrome a real preview should ever show. Renders the container's
// own `semantic` tag (e.g. "section"/"nav") when set, falling back to a
// plain div exactly like the source does, rather than always rendering a
// div the way the editing BlockContainer.vue does (semantic tags don't
// matter for the editing canvas, but they do for a preview meant to
// resemble real output).
//
// A real bug, fixed here: the source wraps a linked child in its own
// <a :href="block.link"> right in this same per-child loop (see this
// file's own history in the source repo) - that wrapping was missed
// entirely when this preview tree was first ported, so `element.link`
// was stored by the editor but never actually rendered anywhere, in any
// document. Fixed by dispatching each child through one dynamic
// `<component :is>` (childComponent()/childProps() below) instead of the
// three-way v-if/else-if chain this used to be, so the <a> wrapper only
// has to be written once instead of duplicated across all three branches.
// `target` is new, not in the source at all (its own <a> never sets one) -
// see FloatingToolbar.vue's Link popover.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import { X } from '@lucide/vue'
import type Element from '../../scripts/ElementsClass.js'
import { resolveDisplayUrl } from '../../resolve-display-url'
import { useEditorStore } from '../../store/editor'
import type { DataObjectRecord } from '../../data-objects-api'
import { getPage } from '../../pages-api'
import { customAttrs, safeAlpineValue } from '../../helpers'
import { mountAnimation } from '../../scripts/gsap-actions'
import { mountFormSubmit, type FormSubmitResult } from '../../scripts/form-actions'
import { extractPlaceholderNames, substitutePattern } from '../../scripts/path-pattern'
import { resolveGatewayFieldValue } from '../../scripts/data-resolver'
import BlockElementPreview from './BlockElementPreview.vue'
import BlockIFramePreview from './BlockIFramePreview.vue'
import BlockSliderPreview from './BlockSliderPreview.vue'
import BlockIsometricPreview from './BlockIsometricPreview.vue'
import BlockTablePreview from './BlockTablePreview.vue'
// Self-import: <script setup>'s auto-recursion (referencing a component by
// its own inferred name) only works inside the *template*, not plain
// script code - childComponent() below needs a real value to return, so
// this file imports itself. Vite/Vue resolve this circular reference fine
// for SFCs (the recursive reference is only ever needed at render time,
// well after this module has finished evaluating).
import BlockContainerPreview from './BlockContainerPreview.vue'
import { parentTargetOrigin } from '../../scripts/parent-origin'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  doc: WhoobeElement
  dataContext?: DataObjectRecord | null
  // Set only by DocumentPreview.vue/PreviewView.vue (the editor's own
  // Preview modal/iframe) - gates document.canvasBackground/
  // editor.templateBody application below so it never reaches PublicPage.
  // vue's live render, which composes the real body slot itself
  // (see PublicPage.vue's `layout.body`).
  editorPreview?: boolean
}>()

const editor = useEditorStore()

// A container with a collection data binding (resolveMode 'query'/'first',
// no field = bind the whole container to a list). The children are a
// template, rendered once per resolved object.
const collectionResolved = computed<DataObjectRecord[]>(() => {
  const el = props.doc as any
  const db = el.dataBinding
  if (db && !db.field) {
    const resolved = editor.resolvedData[el.id]
    if (!Array.isArray(resolved)) return []
    return resolved
  }
  const gb = el.gatewayBinding
  if (gb) {
    const resolved = editor.resolvedData[el.id]
    if (!Array.isArray(resolved)) return []
    return resolved
  }
  return []
})

// Client-side pagination over collectionResolved - the binding's own
// rowsPerPage (0/unset = no pagination, render the whole working set) and
// paginationMode ('standard' Prev/Next arrows vs 'lazyload' a growing list
// plus a configurable "More" button). Ephemeral, not persisted: resets
// whenever the resolved set itself changes, same as ObjectsView.vue's own
// currentPage pattern.
// The binding that feeds the list carries the pagination settings: a Data Class query, else a gateway array (same precedence
// as collectionResolved above).
const pagBinding = computed(() => {
  const el = props.doc as any
  return el.dataBinding && !el.dataBinding.field ? el.dataBinding : el.gatewayBinding ?? null
})
const rowsPerPage = computed(() => Number(pagBinding.value?.rowsPerPage) || 0)
const paginationMode = computed<'standard' | 'lazyload'>(() =>
  pagBinding.value?.paginationMode === 'lazyload' ? 'lazyload' : 'standard'
)
const currentPage = ref(1)
const totalPages = computed(() =>
  rowsPerPage.value > 0 ? Math.max(1, Math.ceil(collectionResolved.value.length / rowsPerPage.value)) : 1
)
// Lazyload: how many rows are currently shown (grows by rowsPerPage per
// "More" click). Standard mode ignores it and pages instead.
const visibleCount = ref(rowsPerPage.value || 0)
const loadMoreButtonText = computed(() => pagBinding.value?.loadMoreText?.trim() || 'More')
const loadMoreButtonClass = computed(() => {
  const cls = pagBinding.value?.loadMoreClass?.trim()
  return cls || 'px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50'
})
const paginationContainerClass = computed(() => {
  const cls = pagBinding.value?.paginationContainerClass?.trim()
  return cls || 'w-full flex flex-col items-center justify-center md:gap-3 gap-2 md:p-4 p-2'
})
const pagedItems = computed(() => {
  if (!rowsPerPage.value) return collectionResolved.value
  if (paginationMode.value === 'lazyload') {
    return collectionResolved.value.slice(0, visibleCount.value)
  }
  const start = (currentPage.value - 1) * rowsPerPage.value
  return collectionResolved.value.slice(start, start + rowsPerPage.value)
})
function loadMoreMore() {
  visibleCount.value = Math.min(visibleCount.value + rowsPerPage.value, collectionResolved.value.length)
}
watch(collectionResolved, () => {
  currentPage.value = 1
  visibleCount.value = rowsPerPage.value
})
watch(rowsPerPage, (n) => {
  visibleCount.value = n || 0
})
watch(totalPages, (p) => {
  if (currentPage.value > p) currentPage.value = p
})

// A container with a single-object binding (whole object, no field).
// The resolved object is passed as dataContext to all children, so
// their relative bindings (no objectId) resolve against it.
const singleObjectContext = computed<DataObjectRecord | null>(() => {
  const el = props.doc as any
  const db = el.dataBinding
  if (db && !db.field) {
    const resolved = editor.resolvedData[el.id]
    if (!resolved || Array.isArray(resolved)) return null
    return resolved as DataObjectRecord
  }
  const gb = el.gatewayBinding
  if (gb && !gb.fieldPath) {
    const resolved = editor.resolvedData[el.id]
    if (!resolved || Array.isArray(resolved)) return null
    return resolved as DataObjectRecord
  }
  return null
})

function boundChildProps(child: WhoobeElement, obj: DataObjectRecord): Record<string, unknown> {
  const c = child as any
  if (c.tag === 'table') return { doc: child }
  if (c.tag === 'isometric' || c.tag === 'slider' || c.type === 'container') return { doc: child, dataContext: obj }
  return { element: child, dataContext: obj }
}

// List-to-detail linking (docs/plans/website/website-paths.md): per-record
// href, built by substituting `dynamicLink.valueField`'s value on THIS
// record into the target page's own dynamic slug pattern. Cached by
// targetPageId, same lazy-fetch-then-cache pattern resolve-display-url.ts
// already uses - childHref() is called during render, so a not-yet-cached
// id triggers a fetch and returns '#' for this pass; the reactive Map
// update re-renders with the real href once it resolves.
const targetPageCache = ref<Map<string, { slug: string; locale: string }>>(new Map())
const pendingTargetPageIds = new Set<string>()

function ensureTargetPageLoaded(targetPageId: string) {
  if (targetPageCache.value.has(targetPageId) || pendingTargetPageIds.has(targetPageId)) return
  pendingTargetPageIds.add(targetPageId)
  getPage(targetPageId)
    .then((page) => { targetPageCache.value.set(targetPageId, { slug: page.slug, locale: page.locale }) })
    .catch(() => {
      // Target page missing/deleted - childHref falls back to '#'.
    })
    .finally(() => { pendingTargetPageIds.delete(targetPageId) })
}

// Shared by childHref() and onDynamicLinkClick() - resolves a dynamicLink
// child + its current record down to the concrete { path, locale } a real
// visit to this specific record would need. Returns null when the target
// page isn't loaded yet, the record has no value for the mapped field, or
// (v1 limitation) the target pattern has more than one placeholder - only
// the first is ever filled from valueField, matching childHref()'s own
// documented v1 boundary.
function resolveDynamicLinkTarget(child: WhoobeElement, obj: DataObjectRecord): { path: string; locale: string } | null {
  const c = child as any
  if (!c.dynamicLink) return null
  ensureTargetPageLoaded(c.dynamicLink.targetPageId)
  const target = targetPageCache.value.get(c.dynamicLink.targetPageId)
  const value = c.dynamicLink.source === 'gateway'
    ? resolveGatewayFieldValue(obj, c.dynamicLink.valueField)
    : (obj.attributes as any)?.[c.dynamicLink.valueField]
  if (!target || value == null) return null
  const [placeholderName] = extractPlaceholderNames(target.slug)
  if (!placeholderName) return null
  const path = substitutePattern(target.slug, { [placeholderName]: String(value) })
  if (!path) return null
  return { path, locale: target.locale }
}

function childHref(child: WhoobeElement, obj: DataObjectRecord): string {
  const c = child as any
  if (c.dynamicLink) {
    const resolved = resolveDynamicLinkTarget(child, obj)
    if (!resolved) return '#'
    // Clean SEO-friendly URL — the server resolves locale from the DB
    // via GET /public/page/* (no query params needed).
    return resolved.path
  }
  return c.link || '#'
}

// When running embedded inside admin-dashboard (editor.embedded), a
// list-to-detail link opens as a tab in admin-dashboard's own tab strip
// instead of a real new browser tab - see docs/plans (list-to-detail-tabs
// plan) and DashboardLayout.vue's matching message listener. Standalone
// (:3006 direct, no parent to message) falls through to the anchor's own
// `target` - which defaults to `_blank` (see the template) so a real click
// doesn't navigate the standalone editor preview away from itself, but
// honors the element's own `linkTarget` ("Opens in") when the user set one.
function onDynamicLinkClick(e: MouseEvent, child: WhoobeElement, obj: DataObjectRecord) {
  const c = child as any
  if (!c.dynamicLink || !editor.embedded) return
  const resolved = resolveDynamicLinkTarget(child, obj)
  if (!resolved) return
  e.preventDefault()
  window.parent.postMessage(
    { type: 'whoobe-one:open-page-preview', pageId: c.dynamicLink.targetPageId, path: resolved.path, locale: resolved.locale },
    editor.parentOrigin || parentTargetOrigin()
  )
}

function childComponent(child: WhoobeElement): Component {
  const c = child as any
  // Checked before the generic `type === 'container'` case below - a
  // slider *is* a container (its slides are just its `.blocks`, see
  // ElementsClass.js's Slider() builder comment), but needs its own real
  // one-at-a-time/autoplay/nav rendering instead of the plain "show every
  // child stacked" behavior every other container gets.
  if (c.tag === 'isometric') return BlockIsometricPreview as unknown as Component
  if (c.tag === 'slider') return BlockSliderPreview as unknown as Component
  if (c.tag === 'table') return BlockTablePreview as unknown as Component
  if (c.type === 'container') return BlockContainerPreview as unknown as Component
  if (c.tag === 'youtube' || c.tag === 'vimeo') return BlockIFramePreview as unknown as Component
  return BlockElementPreview as unknown as Component
}

function childProps(child: WhoobeElement): Record<string, unknown> {
  const c = child as any
  if (c.tag === 'table') return { doc: child }
  if (c.tag === 'isometric' || c.tag === 'slider' || c.type === 'container') return { doc: child }
  return { element: child }
}

// Same as childProps(), but threads the container's own resolved single
// object down as dataContext - the mechanism that lets a generated
// template's relative bindings (children with no objectId) resolve
// against the object this container is bound to. Falls back to any
// dataContext the container itself received from its own parent.
function childPropsWithContext(child: WhoobeElement): Record<string, unknown> {
  const base = childProps(child)
  const ctx = singleObjectContext.value ?? props.dataContext ?? undefined
  if (!ctx) return base
  return { ...base, dataContext: ctx }
}

const semantic = computed(() => (props.doc as any).semantic || 'div')

// Editor-only classes that the canvas adds at edit time
// (BlockContainer.vue adds `whoobe-canvas-root editor-custom` for the
// document root). Strip them from preview so they never leak to the
// public page. Legacy baked-in classes (`gap-4 min-h-[600px] bg-white
// p-6`) are stripped only from the document root — child containers
// that happen to use `gap-4` or `bg-white` are never affected.
const EDITOR_ONLY_CLASSES = ['whoobe-canvas-root', 'editor-custom']

const LEGACY_ROOT_CLASSES = ['gap-4', 'min-h-[600px]', 'bg-white', 'p-6']

const classe = computed(() => {
  const doc = props.doc as any
  const raw = `${doc.css?.css ?? ''} ${doc.css?.container ?? ''}`.trim()
  const isRoot = doc.tag === 'document'
  const strip = isRoot ? [...EDITOR_ONLY_CLASSES, ...LEGACY_ROOT_CLASSES] : EDITOR_ONLY_CLASSES
  let cls = raw.split(' ').filter((c: string) => !strip.includes(c)).join(' ')
  // Editor-preview-only canvas background (see BlockContainer.vue's matching
  // comment) - props.editorPreview keeps this out of PublicPage.vue's live
  // render, which reuses this exact component for the routed page's body.
  if (isRoot && props.editorPreview) {
    const cb = doc.canvasBackground
    if (!(cb && cb.useTemplate === false) && editor.templateBody?.className) {
      cls += ' ' + editor.templateBody.className
    }
  }
  return cls
})

const stile = computed(() => {
  const doc = props.doc as any
  let st = ''
  const bgUrl = resolveDisplayUrl(doc.image?.url)
  if (bgUrl) st += `background-image:url(${bgUrl});`
  if (doc.font) st += `font-family:"${doc.font.replaceAll('+', ' ')}";`
  if (doc.tag === 'document' && props.editorPreview) {
    const cb = doc.canvasBackground
    if (cb && cb.useTemplate === false) {
      st += cb.style ?? ''
    } else if (editor.templateBody?.style) {
      st += editor.templateBody.style
    }
  }
  return st + (doc.style ?? '')
})

// Custom attributes/AlpineJS directives/GSAP scroll-triggered animation on
// the container itself - same wiring as BlockElementPreview.vue, see that
// file's comment for the full rationale (why alpineAttrs drops empty
// values, why the animation gate skips `&& gsap.duration`, why there's an
// explicit Alpine.initTree() watch instead of relying only on Alpine's own
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

// Template ref, not document.getElementById(doc.id) - see
// BlockElementPreview.vue's comment for the real bug that was (duplicate
// ids: the editing canvas keeps its own :id="doc.id" node mounted
// underneath DocumentPreview.vue's modal, and a data-bound repeater can
// render this same doc N times, each with the identical id).
const rootEl = ref<HTMLElement | null>(null)

let stopAnimation: (() => void) | null = null
let stopFormSubmit: (() => void) | null = null
const submitResult = ref<FormSubmitResult | null>(null)

onMounted(() => {
  if (rootEl.value) stopAnimation = mountAnimation(props.doc, rootEl.value)
  if ((props.doc as any).tag === 'form' && rootEl.value) {
    stopFormSubmit = mountFormSubmit(props.doc, rootEl.value as unknown as HTMLFormElement, (result) => {
      submitResult.value = result
    })
  }
  // Alpine attributes are already on the element via v-bind="extraAttrs",
  // but Alpine's MutationObserver doesn't always catch them on initial
  // mount inside an iframe. Explicit initTree guarantees they're processed.
  if (rootEl.value && (window as any).Alpine) {
    nextTick(() => (window as any).Alpine.initTree(rootEl.value))
  }
})

onUnmounted(() => {
  stopAnimation?.()
  stopFormSubmit?.()
})

watch(
  () => (props.doc as any).alpine,
  () => {
    nextTick(() => {
      if (rootEl.value && (window as any).Alpine) (window as any).Alpine.initTree(rootEl.value)
    })
  },
  { deep: true }
)
</script>

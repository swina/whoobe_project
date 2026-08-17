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
          :target="(child as any).dynamicLink ? '_blank' : (child as any).linkTarget || undefined"
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
            v-html="submitResult.message"
            :class="submitResult.ok ? 'text-emerald-700' : 'text-rose-700'"
          ></div>
        </div>
      </div>
    </Teleport>
  </component>
</template>

<script setup lang="ts">
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
import BlockElementPreview from './BlockElementPreview.vue'
import BlockIFramePreview from './BlockIFramePreview.vue'
import BlockSliderPreview from './BlockSliderPreview.vue'
// Self-import: <script setup>'s auto-recursion (referencing a component by
// its own inferred name) only works inside the *template*, not plain
// script code - childComponent() below needs a real value to return, so
// this file imports itself. Vite/Vue resolve this circular reference fine
// for SFCs (the recursive reference is only ever needed at render time,
// well after this module has finished evaluating).
import BlockContainerPreview from './BlockContainerPreview.vue'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  doc: WhoobeElement
  dataContext?: DataObjectRecord | null
}>()

const editor = useEditorStore()

// A container with a collection data binding (resolveMode 'query'/'first',
// no field = bind the whole container to a list). The children are a
// template, rendered once per resolved object.
const collectionResolved = computed<DataObjectRecord[]>(() => {
  const el = props.doc as any
  const db = el.dataBinding
  if (!db || db.field) return []
  const resolved = editor.resolvedData[el.id]
  if (!Array.isArray(resolved)) return []
  return resolved
})

// Client-side pagination over collectionResolved - the binding's own
// rowsPerPage (0/unset = no pagination, render the whole working set) and
// paginationMode ('standard' Prev/Next arrows vs 'lazyload' a growing list
// plus a configurable "More" button). Ephemeral, not persisted: resets
// whenever the resolved set itself changes, same as ObjectsView.vue's own
// currentPage pattern.
const rowsPerPage = computed(() => Number((props.doc as any).dataBinding?.rowsPerPage) || 0)
const paginationMode = computed<'standard' | 'lazyload'>(() =>
  (props.doc as any).dataBinding?.paginationMode === 'lazyload' ? 'lazyload' : 'standard'
)
const currentPage = ref(1)
const totalPages = computed(() =>
  rowsPerPage.value > 0 ? Math.max(1, Math.ceil(collectionResolved.value.length / rowsPerPage.value)) : 1
)
// Lazyload: how many rows are currently shown (grows by rowsPerPage per
// "More" click). Standard mode ignores it and pages instead.
const visibleCount = ref(rowsPerPage.value || 0)
const loadMoreButtonText = computed(() => (props.doc as any).dataBinding?.loadMoreText?.trim() || 'More')
const loadMoreButtonClass = computed(() => {
  const cls = (props.doc as any).dataBinding?.loadMoreClass?.trim()
  return cls || 'px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50'
})
const paginationContainerClass = computed(() => {
  const cls = (props.doc as any).dataBinding?.paginationContainerClass?.trim()
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
  if (!db || db.field) return null
  const resolved = editor.resolvedData[el.id]
  if (!resolved || Array.isArray(resolved)) return null
  return resolved as DataObjectRecord
})

function boundChildProps(child: WhoobeElement, obj: DataObjectRecord): Record<string, unknown> {
  const c = child as any
  if (c.tag === 'slider' || c.type === 'container') return { doc: child, dataContext: obj }
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
  const value = (obj.attributes as any)?.[c.dynamicLink.valueField]
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
    // ?locale= is a dev-preview-tool affordance (see PublicPage.vue): the
    // public page route needs locale as an explicit param, and it's not
    // reliably derivable from the path itself (the DB's own locale column
    // doesn't always match a leading path segment) - taken directly from
    // the target page's own real, already-fetched locale, not guessed.
    return `${resolved.path}?locale=${encodeURIComponent(resolved.locale)}`
  }
  return c.link || '#'
}

// When running embedded inside admin-dashboard (editor.embedded), a
// list-to-detail link opens as a tab in admin-dashboard's own tab strip
// instead of a real new browser tab - see docs/plans (list-to-detail-tabs
// plan) and DashboardLayout.vue's matching message listener. Standalone
// (:3006 direct, no parent to message) falls through to the normal
// target="_blank" navigation, unchanged.
function onDynamicLinkClick(e: MouseEvent, child: WhoobeElement, obj: DataObjectRecord) {
  const c = child as any
  if (!c.dynamicLink || !editor.embedded) return
  const resolved = resolveDynamicLinkTarget(child, obj)
  if (!resolved) return
  e.preventDefault()
  window.parent.postMessage(
    { type: 'whoobe-one:open-page-preview', pageId: c.dynamicLink.targetPageId, path: resolved.path, locale: resolved.locale },
    editor.parentOrigin || '*'
  )
}

function childComponent(child: WhoobeElement): Component {
  const c = child as any
  // Checked before the generic `type === 'container'` case below - a
  // slider *is* a container (its slides are just its `.blocks`, see
  // ElementsClass.js's Slider() builder comment), but needs its own real
  // one-at-a-time/autoplay/nav rendering instead of the plain "show every
  // child stacked" behavior every other container gets.
  if (c.tag === 'slider') return BlockSliderPreview as unknown as Component
  if (c.type === 'container') return BlockContainerPreview as unknown as Component
  if (c.tag === 'youtube' || c.tag === 'vimeo') return BlockIFramePreview as unknown as Component
  return BlockElementPreview as unknown as Component
}

function childProps(child: WhoobeElement): Record<string, unknown> {
  const c = child as any
  if (c.tag === 'slider' || c.type === 'container') return { doc: child }
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

const classe = computed(() => {
  const doc = props.doc as any
  return `${doc.css.css ?? ''} ${doc.css.container ?? ''}`.trim()
})

const stile = computed(() => {
  const doc = props.doc as any
  let st = ''
  const bgUrl = resolveDisplayUrl(doc.image?.url)
  if (bgUrl) st += `background-image:url(${bgUrl});`
  if (doc.font) st += `font-family:"${doc.font.replaceAll('+', ' ')}";`
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
    if (alpine[key]) result[key] = safeAlpineValue(alpine[key])
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

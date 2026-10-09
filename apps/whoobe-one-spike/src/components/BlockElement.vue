<template>
  <div class="relative group" :data-toolbar-anchor="element.id">
    <!-- Not part of the v-if chain below: the badge sits next to the element, it must not replace it (as a chain
         branch it did - a leaf element with `hidden`, `lg:hidden` ... rendered only this badge and could not be
         selected or edited; BlockContainer.vue always had it as a separate element). -->
    <span
      v-if="hasHiddenClass && !isCollapsedNode"
      class="absolute -top-2.5 left-1/2 -translate-x-1/2 z-50 px-1.5 py-0.5 rounded text-[10px] leading-none font-semibold bg-black text-white font-mono"
      :title="`Hidden in the published view by: ${hiddenBy}. It stays visible here so it can be edited.`"
    >{{ hiddenBy }}</span>
    <!-- Collapsed via FloatingToolbar.vue's "Hide content" toggle - see
         BlockContainer.vue's own comment on the same mechanism (store/
         editor.ts's collapsedIds), applied here to leaf elements too (an
         absolutely-positioned image/icon can layer-block siblings just as
         easily as a container can). -->
    <button
      v-if="isCollapsedNode"
      type="button"
      :id="element.id"
      :data-id="element.id"
      data-type="element"
      class="inline-flex items-center gap-1 m-0.5 px-1.5 py-0.5 rounded border border-dashed border-gray-400 bg-gray-200 text-gray-500 text-[10px] font-mono hover:border-indigo-400 hover:text-indigo-600"
      title="Hidden - click to show content again"
      @click="showAgain"
    >
      &lt;{{ component }}&gt;
    </button>
    <!-- The "Search" element is a live component, not a native tag - a
         dedicated branch (like lucideicon) so the generic <component>
         branch's v-html/contenteditable never touch its interactive
         internals. `editing` keeps it from submitting/navigating, and this
         branch uses its own select-only click (no preventDefault, unlike
         onClick) so the input stays focusable - the admin can type and see
         the live dropdown (and its custom classes) while managing it. -->
    <SearchElement
      v-else-if="element.tag === 'search'"
      :id="element.id"
      :ref="element.id"
      :config="(element as any).searchConfig"
      :placeholder="element.placeholder"
      :editing="true"
      :class="classe"
      :style="stile"
      :data-id="element.id"
      data-type="element"
      @click.stop="selectSearchElement"
    />
    <span
      v-else-if="element.tag === 'lucideicon'"
      :id="element.id"
      :ref="element.id"
      :class="classe"
      :style="stile"
      :data-id="element.id"
      data-type="element"
      @click="onClick"
    >
      <component :is="iconComponent" v-if="iconComponent" class="w-6 h-6" style="display:inline-block" />
      <span v-else class="text-gray-300">—</span>
    </span>
    <!-- Button/submit/reset with an optional Lucide icon before/after the
         label (FloatingToolbar.vue's "Button icon" picker). A dedicated
         branch, like lucideicon/search above, for the same reason: v-html
         on the outer tag (the generic branch below) would wipe out a real
         Vue-rendered icon component the instant it ran. contenteditable
         moves to the inner text span instead of the button itself, so
         onBlur still commits exactly `element.content` (plain text/HTML),
         untouched by the icon markup around it. -->
    <component
      v-else-if="element.tag === 'button' || element.tag === 'submit' || element.tag === 'reset' || element.tag === 'file'"
      :is="component"
      :id="element.id"
      :ref="element.id"
      :class="classe"
      :style="stile"
      :data-id="element.id"
      data-type="element"
      v-bind="elementAttrs"
      @click="onClick"
    >
      <span v-if="buttonIconComponent && buttonIconPosition !== 'after'" class="inline-flex items-center mr-1.5" contenteditable="false"><component :is="buttonIconComponent" :style="buttonIconStyle" /></span>
      <span
        :contenteditable="!resolvedDataValue && element.editable"
        v-html="safeDisplayContent"
        @input="edited = true"
        @blur="onBlur"
      ></span>
      <span v-if="buttonIconComponent && buttonIconPosition === 'after'" class="inline-flex items-center ml-1.5" contenteditable="false"><component :is="buttonIconComponent" :style="buttonIconStyle" /></span>
    </component>
    <!-- Audio: the browser's player, or the waveform player (components/AudioPlayer.vue). The same component renders
         the preview and the public page, so what is configured here is what visitors get. -->
    <AudioPlayer
      v-else-if="element.element === 'audio'"
      :id="element.id"
      :class="classe"
      :style="stile"
      :data-id="element.id"
      data-type="element"
      v-bind="elementAttrs"
      :src="displaySrc"
      :source="(element as any).image?.url"
      :options="(element as any).options"
      @click="onAudioClick"
    />
    <video
      v-else-if="element.element === 'video'"
      :id="element.id"
      ref="videoEl"
      :class="classe"
      :style="stile"
      :data-id="element.id"
      data-type="element"
      v-bind="elementAttrs"
      controls
      @click="onClick"
    >
      <source :src="displaySrc" type="video/mp4" />
    </video>
    <component
      v-else
      :is="component"
      :id="element.id"
      :ref="element.id"
      :class="classe"
      :style="stile"
      :contenteditable="!resolvedDataValue && element.editable && element.tag !== 'markdown'"
      :src="displaySrc"
      :alt="displayAlt"
      :placeholder="element.placeholder"
      :data-id="element.id"
      data-type="element"
      v-bind="elementAttrs"
      v-html="safeDisplayContent"
      @click="onClick"
      @input="edited = true"
      @blur="onBlur"
    ></component>
    <!--<button
      v-if="element.element === 'pre'"
      type="button"
      class="absolute -top-2.5 -left-2.5 z-50 px-1 py-0.5 rounded text-[10px] leading-none text-white bg-blue-500 hover:bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
      title="Copy code"
      @click.stop="copyCode"
    >
      <Copy class="w-3 h-3" />
    </button>-->
    <div
      v-if="showOverlay"
      class="absolute inset-0 z-10 flex items-center justify-center bg-indigo-50/80 text-indigo-500 text-[10px] font-mono pointer-events-none select-none rounded"
    >
      {{ bindingPlaceholder }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { sanitizeRichText as safeHtml, dropForeignInlineStyles } from '@whoobe-cms/schema'
// Port of whoobe-one-studio's src/components/blocks/BlockElement.vue - the
// actual inline-WYSIWYG mechanism (see port plan §1.2): contenteditable is
// set directly on the rendered tag when the node is selected and editable,
// and onBlur reads the live DOM innerHTML back into reactive state. No
// editor library, no textarea-based editing - this IS the element.
//
// Deviations from the original (deliberate, see port plan §2/§5 Phase 0):
// - `element`/`level` are real declared props, not read off `this.$attrs`
//   (the original's pervasive $attrs-instead-of-props pattern, item 3).
// - No z-index/overlay hit-testing trick for click selection - see
//   BlockContainer.vue's @click.self approach instead, which makes the
//   whole "which element did the click actually land on" question a
//   native DOM concern rather than a manually-maintained z-index ladder.
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import type { Component } from 'vue'
import type Element from '../scripts/ElementsClass.js'
import { useEditorStore } from '../store/editor'
import { imageURL } from '../helpers'
import { resolveDisplayUrl } from '../resolve-display-url'
import { resolveFieldValue, resolveFieldFromRecord } from '../scripts/data-resolver'
import type { DataObjectRecord } from '../data-objects-api'
import { editorBus } from '../bus'
import { applyTransform, escapeHtml, renderMarkdown } from '../scripts/field-transforms'
import { Copy } from '@lucide/vue'
import AudioPlayer from './AudioPlayer.vue'
import { customAttrs, renderSelectOptionsHtml, renderRadioGroupHtml, resolveLucideIcon, stripBlockLevelTags, stripEditorHidden, PHRASING_ONLY_ELEMENTS } from '../helpers'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  element: WhoobeElement
  level: number
  dataContext?: DataObjectRecord | null
}>()

const editor = useEditorStore()

const iconComponent = shallowRef<Component | null>(null)

function resolveIcon() {
  const el = props.element as any
  if (el.tag !== 'lucideicon') return
  const name = (el.content || '').trim()
  if (!name) {
    iconComponent.value = null
    return
  }
  resolveLucideIcon(name).then((comp) => {
    iconComponent.value = comp
  }).catch(() => {
    iconComponent.value = null
  })
}

onMounted(() => {
  resolveIcon()
})

watch(() => (props.element as any).content, () => {
  resolveIcon()
})

// Button icon (mirrors BlockElementPreview.vue's own copy of this - see
// this file's button branch above for why the canvas needs its own,
// separate from the lucideicon-content resolver above).
const buttonIconComponent = shallowRef<Component | null>(null)
watch(
  () => (props.element as any).buttonIcon,
  (name) => {
    buttonIconComponent.value = null
    if (!name) return
    resolveLucideIcon(name).then((comp) => {
      buttonIconComponent.value = comp
    }).catch(() => {
      buttonIconComponent.value = null
    })
  },
  { immediate: true }
)
const buttonIconPosition = computed(() => (props.element as any).buttonIconPosition ?? 'before')
const buttonIconStyle = computed(() => ({
  width: ((props.element as any).buttonIconWidth ?? 16) + 'px',
  height: ((props.element as any).buttonIconHeight ?? 16) + 'px',
}))

const isSelected = computed(() => editor.current?.id === props.element.id)
const isCollapsedNode = computed(() => editor.isCollapsed(props.element.id))
function showAgain() {
  editor.toggleCollapsed(props.element.id)
  editor.setCurrent(props.element)
}

const db = computed(() => (props.element as any).dataBinding)
const gb = computed(() => (props.element as any).gatewayBinding)

// Resolved data value: explicit bindings (with objectId) use the store's
// resolved data. Relative bindings (no objectId, e.g. generated template
// fields) resolve against the nearest container's dataContext.
const resolvedDataValue = computed(() => {
  const binding = db.value
  if (binding) {
    if (binding.objectId) {
      const resolved = editor.resolvedData[props.element.id]
      if (!resolved) return null
      return resolveFieldValue(resolved, binding)
    }
    if (props.dataContext && binding.field) {
      return (props.dataContext.attributes as any)?.[binding.field]
    }
    if (props.dataContext && !binding.field) {
      return props.dataContext
    }
    return null
  }
  // Gateway binding: resolve field from container's dataContext (repeater item)
  const gateway = gb.value
  if (gateway) {
    if (props.dataContext && gateway.fieldPath) {
      return resolveFieldFromRecord(props.dataContext, gateway.fieldPath)
    }
    if (props.dataContext && !gateway.fieldPath) {
      return props.dataContext
    }
    const resolved = editor.resolvedData[props.element.id]
    return resolved
  }
  return null
})

const hasResolvedData = computed(() => (db.value || gb.value) && resolvedDataValue.value !== null)

// Show the abstract {Class.field} overlay only when binding exists but data
// hasn't resolved yet (loading / not yet fetched). Once resolved, the real
// value is shown inline below.
const showOverlay = computed(() => (db.value || gb.value) && !hasResolvedData.value)

const bindingPlaceholder = computed(() => {
  const binding = db.value
  if (!binding) return ''
  return binding.field ? `{${binding.className}.${binding.field}}` : `{${binding.className}}`
})

// Computed once and reused by displayContent/transformClassName below,
// rather than calling applyTransform twice per render.
const transformResult = computed(() => (hasResolvedData.value ? applyTransform(resolvedDataValue.value, db.value?.transform ?? gb.value?.transform, editor.page?.locale) : null))

const safeDisplayContent = computed(() => safeHtml(displayContent.value))
const displayContent = computed(() => {
  const result = transformResult.value
  if (result) {
    if (result.kind === 'link') {
      const targetAttr = result.target ? ` target="${result.target}" rel="noopener noreferrer"` : ''
      return `<a href="${escapeHtml(result.href)}"${targetAttr}>${escapeHtml(result.text)}</a>`
    }
    // See BlockElementPreview.vue's identical branch - a `markdown`-type
    // field with no explicit transform gets its raw source converted to
    // HTML so the editing canvas shows the same rendered output the
    // published page will.
    const isUntransformed = !db.value?.transform || db.value.transform.type === 'none'
    if (db.value?.fieldType === 'markdown' && isUntransformed) {
      return renderMarkdown(resolvedDataValue.value)
    }
    return result.text
  }
  const el = props.element as any
  // A select/radio group was never a real editable-content element - its
  // configured options list (FormFieldControl.vue) generates real
  // <option>/<input type="radio"> markup instead of falling through to the
  // (always empty) static `content` field.
  if (el.tag === 'select') return renderSelectOptionsHtml(el.data?.options)
  if (el.tag === 'radiogroup') return renderRadioGroupHtml(el.data?.options, el.data?.attributes?.name)
  // The Markdown element stores the source and shows it as HTML (never contenteditable: the source is edited in
  // the toolbar's "Edit content", a blur would otherwise write the rendered HTML over it).
  if (el.tag === 'markdown') return renderMarkdown(el.content)
  return el.content
})

// 'valueMap' transform's per-value className - see field-transforms.ts's
// valueMapTransformer / BlockElementPreview.vue's identical computed.
const transformClassName = computed(() => {
  const result = transformResult.value
  return result && result.kind === 'text' ? result.className : undefined
})

const displaySrc = computed(() => {
  if (hasResolvedData.value && (props.element as any).element === 'img') {
    const v = resolvedDataValue.value
    if (typeof v === 'string') return resolveDisplayUrl(v)
    if (v && typeof v === 'object' && typeof (v as any).url === 'string') return (v as any).url
    if (v && typeof v === 'object' && typeof (v as any).assetId === 'string') return resolveDisplayUrl((v as any).assetId)
  }
  return resolveDisplayUrl(imageURL((props.element as any).image))
})

// resolveDisplayUrl() resolves asset references asynchronously - see the
// identical watcher/comment in ../preview/BlockElementPreview.vue. Without
// this, a <video> whose <source src> only lands after the initial parse
// never actually loads it: controls render, but play does nothing.
const videoEl = ref<HTMLVideoElement | null>(null)
watch(displaySrc, (src) => {
  if ((props.element as any).element === 'video' && src) videoEl.value?.load()
})

const displayAlt = computed(() => {
  if (hasResolvedData.value && (props.element as any).element === 'img') {
    const v = resolvedDataValue.value
    const transform = db.value?.transform ?? gb.value?.transform
    if (transform && transform.type !== 'none') {
      const text = applyTransform(v, transform, editor.page?.locale).text
      return text || undefined
    }
    if (typeof v === 'string') return v
    return undefined
  }
  return (props.element as any).image?.alt || undefined
})

const component = computed(() => {
  const el = props.element as any
  if ('level' in el && el.level) {
    const level = Number(el.level)
    return 'h' + (Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1)
  }
  // The "Search" palette element renders as the globally-registered
  // SearchElement component (search-element-plan), not a native tag.
  if (el.element === 'search') return 'SearchElement'
  return el.element === 'grid' ? 'div' : el.element
})

const classe = computed(() => {
  const el = props.element as any
  const css = el.css || { css: '', container: '' }
  const raw = `${css.css} ${css.container}`
  const { cleaned } = stripEditorHidden(raw)
  let cls = cleaned
  // Keep a bound element with no content visible/selectable in the editor
  // canvas (data not yet resolved, or resolves to empty/null).
  if (db.value && !el.content && el.element !== 'img') cls += ' min-h-8'
  if (transformClassName.value) cls += ` ${transformClassName.value}`
  if (isSelected.value) cls += ' shadow-lg ring-2 ring-indigo-500'
  return cls
})

const hasHiddenClass = computed(() => {
  const el = props.element as any
  const css = el.css || { css: '', container: '' }
  const raw = `${css.css} ${css.container}`
  return stripEditorHidden(raw).hasHidden
})

// What hides it (`hidden`, `lg:hidden` ...), for the badge: a variant is hidden only from some width on, which is the
// thing to know about an element that stays visible here.
const hiddenBy = computed(() => {
  const el = props.element as any
  const css = el.css || { css: '', container: '' }
  return stripEditorHidden(`${css.css} ${css.container}`).hidden.join(' ')
})

const stile = computed(() => {
  const el = props.element as any
  let st = ''
  const showBg = el.element !== 'img' && !(db.value && db.value.target === 'src' && hasResolvedData.value)
  if (showBg) {
    const bgUrl = resolveDisplayUrl(el.image?.url)
    if (bgUrl) st += `background-image:url(${bgUrl});`
  }
  // replaceAll, not replace - a source-repo bug (single replace() only
  // swaps the first '+'): a 3-word font like "Alfa+Slab+One" rendered as
  // the broken `font-family:"Alfa Slab+One"` (2 pluses, one replaced).
  // Same fix applied to every other font.replace('+', ' ') call site
  // (BlockContainer.vue/BlockSlider.vue + their *Preview.vue counterparts).
  if (el.font) st += `font-family:"${el.font.replaceAll('+', ' ')}";`
  return st + (el.style ?? '')
})

const elementAttrs = computed(() => customAttrs((props.element as any).data?.attributes))

function onClick(e: MouseEvent) {
  // preventDefault, not just stopPropagation - this node's own tag/type
  // attribute is rendered here exactly as it would be on the published
  // page (elementAttrs above, incl. InputSubmit()'s real type="submit"
  // added for the forms feature - see docs/plans/forms/cms-forms.md).
  // Without this, clicking a Submit/Reset button (or any other element
  // with a native click action - a checkbox toggling, a raw <a> navigating)
  // while editing would fire that native browser behavior on top of
  // selection - a submit button would actually submit/navigate away from
  // the editor. Edit mode is select-and-customize only; only the preview/
  // published render tree (BlockElementPreview.vue) is ever "live".
  e.preventDefault()
  e.stopPropagation()
  editor.setCurrent(isSelected.value ? null : props.element)
  if (!isSelected.value) editorBus.emit('floatingElement', props.element.id)
}

// The Audio element is meant to be played and scrubbed while editing, so a click on it selects it and never toggles the
// selection off (onClick above does, and preventDefault there would also fight the player's own controls).
function onAudioClick(e: MouseEvent) {
  e.stopPropagation()
  if (!isSelected.value) {
    editor.setCurrent(props.element)
    editorBus.emit('floatingElement', props.element.id)
  }
}

function copyCode(e: MouseEvent) {
  e.stopPropagation()
  const text = typeof props.element.content === 'string' ? props.element.content : ''
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

// Commits on blur, whether or not the element is still selected - `contenteditable` (template, above) is gated on
// `element.editable`, not on `isSelected`, so this can genuinely lose focus while still holding an in-progress edit:
// click once inside an already-selected text element to reposition the cursor mid-edit and onClick's own toggle
// logic (`editor.setCurrent(isSelected.value ? null : ...)`) deselects it without blurring the DOM node. A
// `isSelected.value` guard here once threw that edit away the next time blur fired - Save then persisted the stale
// value too. Selection state has no bearing on whether a real edit happened; only an `input` event does.
// A blur only commits when something was typed, pasted or cut (`input`): the DOM shown is the sanitized rendering of
// `element.content`, not the content itself, so writing it back after a mere focus/blur (select the paragraph on
// the canvas, then use any other control) replaced the content with a copy of what the sanitizer lets through.
// With the old "strip every style" that also threw away the colours made in TipTap.
let edited = false

function onBlur(e: FocusEvent) {
  if (!edited) return
  edited = false
  const target = e.target as HTMLElement
  // What an edit adds on its own (font-size, a pasted white background ...) is dropped; the inline styles the
  // content already had - the TipTap colours - are kept.
  let text = dropForeignInlineStyles(target.innerHTML, props.element.content)
  // A native paste into contenteditable doesn't enforce the real HTML
  // content model - a pasted <div> lands fine in a <p>/<h1>/<span> here,
  // then silently breaks once actually parsed (published site SSR/static
  // output) - see stripBlockLevelTags()'s own comment.
  if (PHRASING_ONLY_ELEMENTS.has(props.element.element ?? '')) {
    text = stripBlockLevelTags(text)
  }
  props.element.content = text
}

// Selection for the Search element - same as onClick minus the
// preventDefault (a native <form> has no default navigation to suppress,
// and blocking the default click would also block focusing its <input>,
// so the admin couldn't type to see the live dropdown).
function selectSearchElement() {
  editor.setCurrent(isSelected.value ? null : props.element)
  if (!isSelected.value) editorBus.emit('floatingElement', props.element.id)
}
</script>
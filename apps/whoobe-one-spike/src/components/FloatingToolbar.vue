<template>
  <div
    v-if="editor.current"
    class="fixed z-[9999] flex items-center gap-1 bg-white text-black shadow-lg border border-gray-200 rounded-md px-1.5 py-1 text-xs"
    :style="{ top: top + 'px', left: left + 'px' }"
  >
    <span class="px-1.5 py-0.5 rounded bg-blue-500 text-white capitalize font-semibold">{{ label }}</span>

    <button title="Move up" class="toolbar-icon" @click="moveUp">⬆</button>
    <template v-if="isContainer">
      <button title="Add child (Paragraph)" class="toolbar-icon" @click="addChild">➕</button>
      <button title="Direction: row" class="toolbar-icon" @click="setDirection('row')">⬌</button>
      <button title="Direction: column" class="toolbar-icon" @click="setDirection('col')">⬍</button>
    </template>
    <button v-if="isTextEditable || isVideoEmbed" title="Edit content" class="toolbar-icon" @click="onEditContent">✎</button>
    <button v-if="isVideoEmbed && editor.current?.content" title="Play video" class="toolbar-icon" @click="playVideoEmbed">▶</button>
    <label v-if="isTextEditable" title="Text color" class="toolbar-icon relative">
      A
      <input type="color" class="absolute inset-0 opacity-0 cursor-pointer" @input="pickTextColor" />
    </label>
    <div class="relative">
      <button type="button" title="Fill color" class="toolbar-icon" @click="showFillPicker = !showFillPicker">⬛</button>
      <template v-if="showFillPicker">
        <div class="fixed inset-0 z-[10000]" @click="showFillPicker = false"></div>
        <div class="absolute z-[10001] top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-2 w-44" @click.stop>
          <label class="flex items-center gap-1.5 mb-2 cursor-pointer text-[10px] text-gray-500">
            Custom
            <input type="color" class="w-5 h-5 border rounded cursor-pointer" @input="pickFillColor" />
          </label>
          <div class="grid grid-cols-6 gap-1">
            <button
              v-for="swatch in fillSwatches"
              :key="swatch"
              type="button"
              :title="swatch"
              class="w-5 h-5 rounded-full border-2"
              :class="swatch"
              @click="pickFillSwatch(swatch)"
            ></button>
            <button type="button" title="Clear" class="w-5 h-5 rounded-full border flex items-center justify-center text-[8px] text-gray-400" @click="clearFill">
              ✕
            </button>
          </div>
        </div>
      </template>
    </div>
    <button title="Image URL (background, unless this is an actual <img>)" class="toolbar-icon" @click="setImage">🖼</button>
    <button title="Browse assets (backend DAM)" class="toolbar-icon" @click="showMediaPicker = true">🗂</button>
    <button title="Link URL" class="toolbar-icon" @click="setLink">🔗</button>
    <label title="Animation (GSAP)" class="toolbar-icon relative">
      ✨
      <select class="absolute inset-0 opacity-0 cursor-pointer" :value="editor.current?.gsap.animation ?? ''" @change="pickAnimation">
        <option value="">None</option>
        <option v-for="name in gsapEffects" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>
    <button v-if="editor.current?.gsap.animation" title="Preview animation" class="toolbar-icon" @click="replayAnimation">▶</button>
    <button title="Delete" class="toolbar-icon text-rose-500" :disabled="isRoot" @click="remove">🗑</button>
  </div>

  <!-- Port of BlockEditContent.vue's TipTap dispatch - the source only
       ever opens BlockTipTap.vue as a dialog for `element === 'p'`, never
       other text types (Heading/Span/InlineText/Blockquote/Code just get
       the plain textarea/contenteditable path). Shown as an inline modal
       owned directly by this component rather than routed through a
       dialog-bus system that doesn't exist yet (Phase 3). -->
  <div v-if="showTipTap && editor.current" class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="showTipTap = false">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl h-96 flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span class="text-xs font-semibold text-gray-600">Rich text editor</span>
        <button class="text-gray-400 hover:text-gray-700 text-xs" @click="showTipTap = false">✕ Close</button>
      </div>
      <TipTapPanel v-model="editor.current.content" />
    </div>
  </div>

  <MediaPickerModal v-if="showMediaPicker" @select="onMediaPicked" @close="showMediaPicker = false" />
</template>

<script setup lang="ts">
// Equivalent of the original app's BlockFloatingAction.vue/BlockFloating.vue
// - a small contextual action bar anchored at the top-left corner of
// whatever is currently selected, shown/hidden entirely by `editor.current`.
// Deliberately scoped down from the reference: real icon fonts (Iconify)
// are a Phase 2 concern (port plan §5) - plain glyphs stand in here, and
// Image/Link use a plain window.prompt() rather than the original's own
// picker dialogs (MediaUrlImporter-equivalent doesn't exist yet in this
// spike). Font family/size picking is skipped entirely for now.
//
// Position tracks the selected DOM node's live getBoundingClientRect() on
// every animation frame while something is selected (cheap - a rect read
// plus two ref writes) rather than wiring explicit scroll/resize/mutation
// listeners - simpler, and correctly handles content reflow (e.g. editing
// text changes the element's height) without needing a MutationObserver.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Element from '../scripts/ElementsClass.js'
import animations from '../scripts/animations.js'
import twclasses from '../scripts/tw.classes.js'
import { previewAnimation } from '../scripts/gsap-actions'
import { playYouTubeVideo } from '../scripts/youtube-player'
import { useEditorStore } from '../store/editor'
import { clean, findParentAndIndex, removeNodeById } from '../helpers'
import TipTapPanel from './TipTapPanel.vue'
import MediaPickerModal from './MediaPickerModal.vue'

const gsapEffects = animations.gsapEffects

const editor = useEditorStore()

const top = ref(0)
const left = ref(0)
const showTipTap = ref(false)
const showMediaPicker = ref(false)
const showFillPicker = ref(false)

// Standard Tailwind color scheme swatches for the Fill color popover -
// same `tw.classes.js` colors list BorderColorControl.vue already uses.
// Each swatch's own visual color comes from applying the real `bg-{color}-
// {shade}` utility class to itself (no hardcoded hex table to keep in
// sync) - works because this app's Tailwind engine runs live in the
// browser (see main.ts) and generates real CSS for whatever classes
// appear, not just ones it can statically scan for.
const FILL_SHADES = [300, 500, 700]
const BG_COLOR_CLASS_RE = new RegExp(`^bg-(${(twclasses.colors as string[]).join('|')})-\\d+$`)
const fillSwatches = (twclasses.colors as string[]).flatMap((color) => FILL_SHADES.map((shade) => `bg-${color}-${shade}`))

const isContainer = computed(() => !!editor.current?.blocks)
const isTextEditable = computed(() => !!editor.current?.editable)
const isVideoEmbed = computed(() => editor.current?.tag === 'youtube' || editor.current?.tag === 'vimeo')
const isRoot = computed(() => !editor.document || editor.current?.id === editor.document.id)
const label = computed(() => {
  const el = editor.current as any
  if (!el) return ''
  return isContainer.value ? `${el.tag || 'div'} ${el.css?.container?.includes('flex-col') ? 'col' : el.css?.container?.includes('flex') ? 'row' : ''}`.trim() : el.element
})

function updatePosition() {
  if (!editor.current) return
  const el = document.getElementById(editor.current.id)
  if (!el) return
  const rect = el.getBoundingClientRect()
  top.value = Math.max(4, rect.top - 36)
  left.value = rect.left
}

let rafId: number | null = null
function loop() {
  updatePosition()
  rafId = requestAnimationFrame(loop)
}
onMounted(() => {
  rafId = requestAnimationFrame(loop)
})
onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
})

function moveUp() {
  if (!editor.document || !editor.current) return
  const found = findParentAndIndex(editor.document, editor.current.id)
  if (!found || found.index === 0) return
  const [node] = found.parent.blocks.splice(found.index, 1)
  found.parent.blocks.splice(found.index - 1, 0, node)
}

function addChild() {
  if (!editor.current?.blocks) return
  const created = new Element().createElement('Paragraph', {})
  if (!created) return
  created.css.css = clean(created.css.css)
  editor.current.blocks.push(created)
  editor.setCurrent(created)
}

function setDirection(dir: 'row' | 'col') {
  if (!editor.current) return
  const el = editor.current as any
  el.css.container = clean(`${el.css.container.replace('flex-col', '').replace('flex-row', '')} flex-${dir}`)
}

function focusContent() {
  if (!editor.current) return
  document.getElementById(editor.current.id)?.focus()
}

function onEditContent() {
  if (!editor.current) return
  if (isVideoEmbed.value) {
    // BlockIFrame.vue renders `element.src + element.content` - `src` is
    // already the fixed embed-prefix set by YTVideo()/VimeoVideo(), so
    // only the video ID itself needs collecting here (matches the
    // source's own BlockEditContent.vue, which shows a plain "Video ID"
    // text input for exactly these two tags instead of the textarea/
    // TipTap paths every other editable type gets).
    const id = window.prompt(`${editor.current.tag === 'youtube' ? 'YouTube' : 'Vimeo'} video ID`, editor.current.content || '')
    if (id !== null) editor.current.content = id.trim()
    return
  }
  if (editor.current.element === 'p') {
    showTipTap.value = true
    return
  }
  focusContent()
}

// BlockIFrame.vue disables pointer-events on the iframe itself (see its
// own comment - a click landing on the actual embed is a separate
// browsing context and never reaches this app at all, which used to mean
// "select the element" and "start the video" were the same click). This
// button is now the only deliberate way to start playback while editing.
// YouTube goes through the real IFrame Player API (youtube-player.ts) -
// raw guessed postMessage commands turned out unreliable in practice (no
// ready signal to wait for without the real API, so a command sent before
// the embedded page's internal listener finished initializing was just
// silently dropped). Vimeo keeps its own raw player postMessage protocol
// (`{method:'play'}`) - that one's a stable, long-documented wire format
// or Vimeo's own official Player.js SDK is itself built on, unlike
// YouTube's.
async function playVideoEmbed() {
  if (!editor.current) return
  const iframe = document.getElementById(editor.current.id)?.querySelector('iframe')
  if (!iframe) return
  if (editor.current.tag === 'vimeo') {
    iframe.contentWindow?.postMessage(JSON.stringify({ method: 'play' }), '*')
    return
  }
  await playYouTubeVideo(iframe)
}

function pickTextColor(e: Event) {
  if (!editor.current) return
  const value = (e.target as HTMLInputElement).value
  editor.current.style = `${(editor.current.style ?? '').replace(/color:[^;]+;?/g, '')}color:${value};`
}

function pickFillColor(e: Event) {
  if (!editor.current) return
  const value = (e.target as HTMLInputElement).value
  const el = editor.current as any
  // Drop any standard-palette bg-* class picked below, so it doesn't
  // linger unnoticed once a custom color is chosen instead (inline style
  // always wins the cascade regardless, but only one should be "current").
  el.css.css = clean(el.css.css.split(' ').filter((cl: string) => !BG_COLOR_CLASS_RE.test(cl)).join(' '))
  el.style = `${(el.style ?? '').replace(/background-color:[^;]+;?/g, '')}background-color:${value};`
}

function pickFillSwatch(value: string) {
  if (!editor.current) return
  const el = editor.current as any
  el.style = (el.style ?? '').replace(/background-color:[^;]+;?/g, '')
  const withoutOld = el.css.css.split(' ').filter((cl: string) => !BG_COLOR_CLASS_RE.test(cl)).join(' ')
  el.css.css = clean(`${withoutOld} ${value}`)
  showFillPicker.value = false
}

function clearFill() {
  if (!editor.current) return
  const el = editor.current as any
  el.style = (el.style ?? '').replace(/background-color:[^;]+;?/g, '')
  el.css.css = clean(el.css.css.split(' ').filter((cl: string) => !BG_COLOR_CLASS_RE.test(cl)).join(' '))
  showFillPicker.value = false
}

function setImage() {
  if (!editor.current) return
  const url = window.prompt('Image URL', editor.current.image?.url || '')
  if (url) editor.current.image = { url }
}

// The picker emits a *stable path* (pimcorePath), never a resolved URL -
// see resolve-display-url.ts/dam-api.ts for why. This is the only real
// difference from setImage() above (which stores whatever URL string the
// user pastes, verbatim, unresolved either way).
function onMediaPicked(pimcorePath: string) {
  if (editor.current) editor.current.image = { url: pimcorePath }
  showMediaPicker.value = false
}

function setLink() {
  if (!editor.current) return
  const url = window.prompt('Link URL', editor.current.link || '')
  if (url !== null) editor.current.link = url
}

function pickAnimation(e: Event) {
  if (!editor.current) return
  const value = (e.target as HTMLSelectElement).value
  editor.current.gsap.animation = value || null
  if (value) previewAnimation(editor.current)
}

function replayAnimation() {
  if (editor.current) previewAnimation(editor.current)
}

function remove() {
  if (!editor.document || !editor.current || isRoot.value) return
  const id = editor.current.id
  editor.setCurrent(null)
  removeNodeById(editor.document, id)
}
</script>

<style scoped>
.toolbar-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.25rem;
  color: #6b7280;
}
.toolbar-icon:hover {
  background: #f3f4f6;
  color: #4f46e5;
}
.toolbar-icon:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
</style>

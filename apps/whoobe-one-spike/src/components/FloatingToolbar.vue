<template>
  <div
    v-if="editor.current"
    class="fixed z-[9999] flex items-center gap-1 bg-white text-black shadow-lg border border-gray-200 rounded-md px-1.5 py-1 text-xs"
    :style="{ top: (top-7) + 'px', left: (left+0) + 'px' }"
  >
    <span class="px-1.5 py-0.5 rounded bg-blue-500 text-white capitalize font-semibold">{{ label }}</span>

    <button title="Move up" class="toolbar-icon" @click="moveUp"><ArrowUp class="w-4 h-4" /></button>
    <template v-if="isContainer">
      <button title="Add child (Paragraph)" class="toolbar-icon" @click="addChild"><Plus class="w-4 h-4" /></button>
      <button title="Direction: row" class="toolbar-icon" @click="setDirection('row')"><ArrowLeftRight class="w-4 h-4" /></button>
      <button title="Direction: column" class="toolbar-icon" @click="setDirection('col')"><ArrowUpDown class="w-4 h-4" /></button>
      <div class="relative">
        <button
          type="button"
          title="Semantic HTML tag"
          class="toolbar-icon"
          @click="showSemanticPicker = !showSemanticPicker"
        >
          <Tag class="w-4 h-4" />
        </button>
        <template v-if="showSemanticPicker">
          <div class="fixed inset-0 z-[10000]" @click="showSemanticPicker = false"></div>
          <div class="absolute z-[10001] top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-2 w-40" @click.stop>
            <span class="block text-[10px] text-gray-500 mb-1">Renders as</span>
            <select
              v-model="semanticValue"
              class="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:border-indigo-500"
            >
              <option v-for="tag in semanticTagOptions" :key="tag" :value="tag">&lt;{{ tag }}&gt;</option>
            </select>
          </div>
        </template>
      </div>
    </template>
    <div v-if="isSlider" class="relative">
      <button type="button" title="Slider settings" class="toolbar-icon" @click="showSliderSettings = !showSliderSettings">
        <SlidersHorizontal class="w-4 h-4" />
      </button>
      <template v-if="showSliderSettings && editor.current?.slider">
        <div class="fixed inset-0 z-[10000]" @click="showSliderSettings = false"></div>
        <div
          class="absolute z-[10001] left-0 bg-white border border-gray-200 rounded-md shadow-lg p-3 w-80 space-y-3 text-sm overflow-y-auto"
          :class="sliderPopoverOpensUpward ? 'bottom-full mb-1' : 'top-full mt-1'"
          :style="{ maxHeight: sliderPopoverMaxHeight + 'px' }"
          @click.stop
        >
          <div>
            <span class="block text-xs font-medium text-gray-500 mb-1.5">Navigation style</span>
            <div class="flex gap-3">
              <label class="flex items-center gap-1.5">
                <input type="radio" value="standard" class="w-4 h-4" v-model="editor.current.slider.mode" />
                Standard (arrows)
              </label>
              <label class="flex items-center gap-1.5">
                <input type="radio" value="tabs" class="w-4 h-4" v-model="editor.current.slider.mode" />
                Tabs (named)
              </label>
            </div>
          </div>
          <label class="flex items-center justify-between">
            Autoplay
            <input type="checkbox" class="w-4 h-4" v-model="editor.current.slider.autoplay" />
          </label>
          <label v-if="editor.current.slider.autoplay" class="block">
            <span class="block text-xs font-medium text-gray-500 mb-1.5">Interval (ms)</span>
            <input
              type="number"
              min="500"
              step="500"
              v-model.number="editor.current.slider.interval"
              class="w-full px-2.5 py-1.5 text-sm rounded border border-gray-300 focus:outline-none focus:border-indigo-500"
            />
          </label>
          <label class="flex items-center justify-between">
            Cycle (loop)
            <input type="checkbox" class="w-4 h-4" v-model="editor.current.slider.loop" />
          </label>

          <template v-if="(editor.current.slider.mode || 'standard') === 'standard'">
            <label class="flex items-center justify-between">
              Back/forward buttons
              <input type="checkbox" class="w-4 h-4" v-model="editor.current.slider.showNav" />
            </label>
            <label class="flex items-center justify-between">
              Home button
              <input type="checkbox" class="w-4 h-4" v-model="editor.current.slider.showHome" />
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-gray-500 mb-1.5">Arrow icon</span>
              <select
                v-model="editor.current.slider.arrowIcon"
                class="w-full px-2.5 py-1.5 text-sm rounded border border-gray-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="chevron">Chevron ‹ ›</option>
                <option value="arrow">Arrow ← →</option>
                <option value="triangle">Triangle ◀ ▶</option>
              </select>
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-gray-500 mb-1.5">Home icon</span>
              <select
                v-model="editor.current.slider.homeIcon"
                class="w-full px-2.5 py-1.5 text-sm rounded border border-gray-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="home">House</option>
                <option value="dot">Dot</option>
                <option value="circle">Circle</option>
              </select>
            </label>
          </template>

          <template v-else>
            <div>
              <span class="block text-xs font-medium text-gray-500 mb-1.5">Tab row position</span>
              <div class="flex gap-3">
                <label class="flex items-center gap-1.5">
                  <input type="radio" value="above" class="w-4 h-4" v-model="editor.current.slider.tabsPosition" />
                  Above
                </label>
                <label class="flex items-center gap-1.5">
                  <input type="radio" value="below" class="w-4 h-4" v-model="editor.current.slider.tabsPosition" />
                  Below
                </label>
              </div>
            </div>
            <p class="text-xs text-gray-400">
              Tab names are set directly on the slider's own nav strip while editing - double-click a tab to rename it.
            </p>
          </template>

          <div class="pt-2 border-t border-gray-100 space-y-3">
            <span class="block text-xs text-gray-500">
              Full Tailwind classes for each part - edit directly to match your design (this replaces the whole class list for
              that part, it doesn't add to a hidden default).
            </span>
            <label class="block">
              <span class="block text-xs font-medium text-gray-500 mb-1.5">Nav wrapper classes</span>
              <ExpandableTextInput
                v-model="editor.current.slider.navClass"
                popup-label="Nav wrapper classes"
                monospace
              />
            </label>
            <template v-if="(editor.current.slider.mode || 'standard') === 'standard'">
              <label class="block">
                <span class="block text-xs font-medium text-gray-500 mb-1.5">Arrow button classes</span>
                <ExpandableTextInput
                  v-model="editor.current.slider.arrowClass"
                  popup-label="Arrow button classes"
                  monospace
                />
              </label>
              <label class="block">
                <span class="block text-xs font-medium text-gray-500 mb-1.5">Home button classes</span>
                <ExpandableTextInput
                  v-model="editor.current.slider.homeClass"
                  popup-label="Home button classes"
                  monospace
                />
              </label>
            </template>
            <template v-else>
              <label class="block">
                <span class="block text-xs font-medium text-gray-500 mb-1.5">Tab button classes</span>
                <ExpandableTextInput
                  v-model="editor.current.slider.tabClass"
                  popup-label="Tab button classes"
                  monospace
                />
              </label>
              <label class="block">
                <span class="block text-xs font-medium text-gray-500 mb-1.5">Active tab classes</span>
                <ExpandableTextInput
                  v-model="editor.current.slider.activeTabClass"
                  popup-label="Active tab classes"
                  monospace
                />
              </label>
            </template>
          </div>
        </div>
      </template>
    </div>
    <button v-if="isTextEditable || isVideoEmbed" title="Edit content" class="toolbar-icon" @click="onEditContent"><Pencil class="w-4 h-4" /></button>
    <button v-if="isVideoEmbed && editor.current?.content" title="Play video" class="toolbar-icon" @click="playVideoEmbed"><Play class="w-4 h-4" /></button>
    <div v-if="isTextEditable" class="relative">
      <button type="button" title="Text color" class="toolbar-icon" @click="showTextPicker = !showTextPicker"><Type class="w-4 h-4" /></button>
      <template v-if="showTextPicker">
        <div class="fixed inset-0 z-[10000]" @click="showTextPicker = false"></div>
        <div class="absolute z-[10001] top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-2 w-44" @click.stop>
          <label class="flex items-center gap-1.5 mb-2 cursor-pointer text-[10px] text-gray-500">
            Custom
            <input type="color" class="w-5 h-5 border rounded cursor-pointer" @input="pickTextColor" />
          </label>
          <div class="grid grid-cols-6 gap-1">
            <button
              v-for="swatch in textSwatches"
              :key="swatch"
              type="button"
              :title="swatch"
              class="w-5 h-5 rounded-full border-2"
              :class="swatch"
              @click="pickTextSwatch(swatch)"
            ></button>
            <button type="button" title="Clear" class="w-5 h-5 rounded-full border flex items-center justify-center text-gray-400" @click="clearTextColor">
              <X class="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </template>
    </div>
    <div class="relative">
      <button type="button" title="Fill color" class="toolbar-icon" @click="showFillPicker = !showFillPicker"><PaintBucket class="w-4 h-4" /></button>
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
            <button type="button" title="Clear" class="w-5 h-5 rounded-full border flex items-center justify-center text-gray-400" @click="clearFill">
              <X class="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </template>
    </div>
    <div class="relative">
      <button
        type="button"
        title="Image URL (background, unless this is an actual <img>)"
        class="toolbar-icon"
        @click="openImagePicker"
      >
        <Image class="w-4 h-4" />
      </button>
      <template v-if="showImagePicker">
        <div class="fixed inset-0 z-[10000]" @click="showImagePicker = false"></div>
        <div class="absolute z-[10001] top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-2 w-56 space-y-2" @click.stop>
          <div>
            <label class="block text-[10px] text-gray-500 mb-1">Image URL</label>
            <div class="flex items-center gap-1">
              <input
                v-model="imageUrlDraft"
                type="text"
                placeholder="https://…"
                class="flex-1 px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                title="Bind to data field"
                class="shrink-0 px-1.5 py-1 text-[10px] rounded font-semibold"
                :class="hasSrcBinding ? 'text-indigo-600 bg-indigo-50 border border-indigo-200' : 'text-gray-400 hover:text-indigo-500 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200'"
                @click.stop="openFieldDataPicker('src')"
              >
                <Database class="w-3 h-3" />
              </button>
            </div>
            <div v-if="srcBindingLabel" class="text-[9px] text-indigo-500 font-mono mt-0.5">{{ srcBindingLabel }}</div>
          </div>
          <div v-if="editor.current?.element === 'img'">
            <label class="block text-[10px] text-gray-500 mb-1">Alt text</label>
            <input
              v-model="imageAltDraft"
              type="text"
              placeholder="Describes the image for screen readers"
              class="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div class="flex justify-between pt-1">
            <button type="button" class="px-2 py-1 text-[10px] rounded bg-gray-100 hover:bg-gray-200 text-gray-500" @click="clearImage">Clear</button>
            <button type="button" class="px-2 py-1 text-[10px] rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold" @click="applyImage">
              Apply
            </button>
          </div>
        </div>
      </template>
    </div>
    <button title="Browse assets (backend DAM)" class="toolbar-icon" @click="showMediaPicker = true"><FolderOpen class="w-4 h-4" /></button>
    <div class="relative">
      <button type="button" title="Link URL" class="toolbar-icon" @click="openLinkPicker"><Link class="w-4 h-4" /></button>
      <template v-if="showLinkPicker">
        <div class="fixed inset-0 z-[10000]" @click="showLinkPicker = false"></div>
        <div class="absolute z-[10001] top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-2 w-56 space-y-2" @click.stop>
          <div>
            <label class="block text-[10px] text-gray-500 mb-1">URL</label>
            <div class="flex items-center gap-1">
              <input
                v-model="linkUrlDraft"
                type="text"
                placeholder="https://…"
                class="flex-1 px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                title="Bind to data field"
                class="shrink-0 px-1.5 py-1 text-[10px] rounded font-semibold"
                :class="hasHrefBinding ? 'text-indigo-600 bg-indigo-50 border border-indigo-200' : 'text-gray-400 hover:text-indigo-500 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200'"
                @click.stop="openFieldDataPicker('href')"
              >
                <Database class="w-3 h-3" />
              </button>
            </div>
            <div v-if="hrefBindingLabel" class="text-[9px] text-indigo-500 font-mono mt-0.5">{{ hrefBindingLabel }}</div>
          </div>

          <div class="border-t border-gray-100 pt-2">
            <button
              type="button"
              title="Link each record in this list to its own detail page"
              class="w-full flex items-center gap-1.5 px-1.5 py-1 text-[10px] rounded font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              :class="hasDynamicLink ? 'text-indigo-600 bg-indigo-50 border border-indigo-200' : 'text-gray-500 hover:text-indigo-500 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200'"
              :disabled="!ancestorCollectionClassName"
              @click.stop="togglePageLinkPicker"
            >
              <FileText class="w-3 h-3" /> Link to a page (per record)
            </button>
            <div v-if="!ancestorCollectionClassName" class="text-[9px] text-gray-400 mt-0.5">
              Only available inside a data-bound list.
            </div>
            <template v-else-if="showPageLinkPicker">
              <div class="mt-1.5 space-y-1.5">
                <select v-model="pageLinkTargetPageId" class="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:border-indigo-500">
                  <option value="">Select a dynamic page…</option>
                  <option v-for="p in dynamicPagesList" :key="p.id" :value="p.id">{{ p.name }} ({{ p.path }})</option>
                </select>
                <select v-model="pageLinkValueField" class="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:border-indigo-500">
                  <option value="">Select a field…</option>
                  <option v-for="f in ancestorClassFields" :key="f.name" :value="f.name">{{ f.title || f.name }}</option>
                </select>
                <div class="flex justify-between pt-1">
                  <button type="button" class="px-2 py-1 text-[10px] rounded bg-gray-100 hover:bg-gray-200 text-gray-500" @click="clearPageLink">Clear</button>
                  <button
                    type="button"
                    class="px-2 py-1 text-[10px] rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-40"
                    :disabled="!pageLinkTargetPageId || !pageLinkValueField"
                    @click="applyPageLink"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </template>
          </div>

          <div>
            <label class="block text-[10px] text-gray-500 mb-1">Opens in</label>
            <select v-model="linkTargetDraft" class="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:border-indigo-500">
              <option value="_self">Same tab (_self)</option>
              <option value="_blank">New tab (_blank)</option>
              <option value="_parent">Parent frame (_parent)</option>
              <option value="_top">Top frame (_top)</option>
            </select>
          </div>
          <div class="flex justify-between pt-1">
            <button type="button" class="px-2 py-1 text-[10px] rounded bg-gray-100 hover:bg-gray-200 text-gray-500" @click="clearLink">Clear</button>
            <button type="button" class="px-2 py-1 text-[10px] rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold" @click="applyLink">
              Apply
            </button>
          </div>
        </div>
      </template>
    </div>
    <label title="Animation (GSAP)" class="toolbar-icon relative">
      <Sparkles class="w-4 h-4" />
      <select class="absolute inset-0 opacity-0 cursor-pointer" :value="editor.current?.gsap?.animation ?? ''" @change="pickAnimation">
        <option value="">None</option>
        <option v-for="name in gsapEffects" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>
    <button v-if="editor.current?.gsap?.animation" title="Preview animation" class="toolbar-icon" @click="replayAnimation"><Play class="w-4 h-4" /></button>
    <button title="Save as snippet" class="toolbar-icon" @click="showSaveSnippet = true"><Save class="w-4 h-4" /></button>
    <button
      title="Bind to data object"
      class="toolbar-icon"
      :class="bindingTarget && editor.current?.dataBinding ? 'text-indigo-600' : ''"
      @click="showDataPicker = true"
    >
      <Database class="w-4 h-4" />
    </button>
    <button title="Delete" class="toolbar-icon text-rose-500" :disabled="isRoot" @click="remove"><Trash2 class="w-4 h-4" /></button>
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
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="showTipTap = false"><X class="w-3.5 h-3.5" /> Close</button>
      </div>
      <TipTapPanel v-model="editor.current.content" />
    </div>
  </div>

  <MediaPickerModal v-if="showMediaPicker" @select="onMediaPicked" @close="showMediaPicker = false" />

  <SaveSnippetModal v-if="showSaveSnippet && editor.current" :element="editor.current" @close="showSaveSnippet = false" />

  <DataObjectPicker
    v-if="showDataPicker && editor.current"
    :target="bindingTarget"
    :initial="editor.current.dataBinding"
    :allow-relative="allowRelativeBinding"
    @select="onDataBound"
    @clear="onDataClear"
    @generate-template="onGenerateTemplate"
    @close="showDataPicker = false"
  />

  <!-- Field-level binding picker (opens from Image/Link popovers) -->
  <DataObjectPicker
    v-if="showFieldDataPicker && editor.current"
    :target="fieldDataTarget"
    :initial="editor.current.dataBinding"
    :allow-relative="allowRelativeBinding"
    @select="onFieldDataBound"
    @clear="onFieldDataClear"
    @generate-template="onGenerateTemplate"
    @close="showFieldDataPicker = false"
  />
</template>

<script setup lang="ts">
// Equivalent of the original app's BlockFloatingAction.vue/BlockFloating.vue
// - a small contextual action bar anchored at the top-left corner of
// whatever is currently selected, shown/hidden entirely by `editor.current`.
// Deliberately scoped down from the reference: Image/Link use a plain
// window.prompt() rather than the original's own picker dialogs (a
// MediaUrlImporter-equivalent doesn't exist in this spike). Font family/
// size picking is skipped entirely for now.
//
// Every button here is a real `@lucide/vue` icon (this monorepo's own
// existing icon library - apps/admin-dashboard already uses it the same
// way, see SliderNavIcon.vue's own comment for the fuller reasoning), not
// the plain unicode glyphs this toolbar used originally - real icon
// rendering didn't exist anywhere in this app until the Slider's own nav
// icons needed it. Three exceptions, not oversights: the arrow-style
// `<option>` labels ("Chevron ‹ ›"/"Arrow ← →"/"Triangle ◀ ▶") stay plain
// text - a native `<option>` can only ever render text content, never a
// Vue component, so there's no way to put a real icon inside one.
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
import { clean, findParentAndIndex, findAncestorChain, removeNodeById, friendlyElementName } from '../helpers'
import TipTapPanel from './TipTapPanel.vue'
import MediaPickerModal from './MediaPickerModal.vue'
import SaveSnippetModal from './SaveSnippetModal.vue'
import DataObjectPicker from './DataObjectPicker.vue'
import ExpandableTextInput from './ExpandableTextInput.vue'
import type { ElementDataBinding } from '../scripts/ElementsClass.js'
import { generateTemplateFromClass } from '../scripts/template-generator'
import { resolveDocumentData } from '../scripts/data-resolver'
import { getDataClass, getDataClassByName } from '../data-objects-api'
import { listPages } from '../scripts/database-actions'
import { isDynamicSlug } from '../scripts/path-pattern'
import {
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  Database,
  FileText,
  FolderOpen,
  Image,
  Link,
  PaintBucket,
  Pencil,
  Play,
  Plus,
  Save,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Type,
  X,
} from '@lucide/vue'

const gsapEffects = animations.gsapEffects

const editor = useEditorStore()

const top = ref(0)
const left = ref(0)
const showTipTap = ref(false)
const showMediaPicker = ref(false)
const showTextPicker = ref(false)
const showFillPicker = ref(false)
const showSaveSnippet = ref(false)
const showLinkPicker = ref(false)
const linkUrlDraft = ref('')
const linkTargetDraft = ref('_self')

// --- List-to-detail linking ("Link to a page") ---
const showPageLinkPicker = ref(false)
const pageLinkTargetPageId = ref('')
const pageLinkValueField = ref('')
const dynamicPagesList = ref<{ id: string; name: string; path: string }[]>([])
const ancestorClassFields = ref<{ name: string; title?: string }[]>([])
const showImagePicker = ref(false)
const imageUrlDraft = ref('')
const imageAltDraft = ref('')
const showSliderSettings = ref(false)
const showSemanticPicker = ref(false)
const showDataPicker = ref(false)
const showFieldDataPicker = ref(false)
const fieldDataTarget = ref<'src' | 'href'>('src')

// Same `tw.classes.js` list the Tailwind customizer's own controls already
// reuse elsewhere (e.g. BorderColorControl.vue's colors) - not a new,
// parallel list invented for this control. Ported verbatim from the
// source repo, including two entries ('hero'/'product') that aren't real
// HTML tag names - left as-is rather than silently curated, matching this
// app's port invariant (see ElementsClass.d.ts's own header on exceptions
// needing to be deliberate, not just convenient).
const semanticTagOptions = twclasses.semantics as string[]

// A plain `v-model="editor.current.semantic"` would show blank/unselected
// whenever `semantic` is unset, even though BlockContainer.vue/BlockSlider
// .vue both already fall back to rendering a real 'div' in that case - this
// computed makes the dropdown reflect what's actually rendered (including
// that default), not just whatever the field happens to literally hold.
const semanticValue = computed({
  get: () => (editor.current as any)?.semantic || 'div',
  set: (value: string) => {
    if (editor.current) (editor.current as any).semantic = value
  },
})

// Standard Tailwind color scheme swatches for the Fill/Text color popovers -
// same `tw.classes.js` colors list BorderColorControl.vue already uses.
// Each swatch's own visual color comes from applying the real `bg-{color}-
// {shade}`/`text-{color}-{shade}` utility class to itself (no hardcoded
// hex table to keep in sync) - works because this app's Tailwind engine
// runs live in the browser (see main.ts) and generates real CSS for
// whatever classes appear, not just ones it can statically scan for.
const FILL_SHADES = [300, 500, 700]
const BG_COLOR_CLASS_RE = new RegExp(`^bg-(${(twclasses.colors as string[]).join('|')})-\\d+$`)
const fillSwatches = (twclasses.colors as string[]).flatMap((color) => FILL_SHADES.map((shade) => `bg-${color}-${shade}`))
const TEXT_COLOR_CLASS_RE = new RegExp(`^text-(${(twclasses.colors as string[]).join('|')})-\\d+$`)
const textSwatches = (twclasses.colors as string[]).flatMap((color) => FILL_SHADES.map((shade) => `text-${color}-${shade}`))

// A real bug, fixed here: was `!!editor.current?.blocks` - every Element,
// container or leaf, has a `blocks: []` array from the base constructor
// (and `![]` is truthy), so this was actually `true` for every single
// element, not just genuine containers - a Paragraph/Heading/Image
// selection would have shown "Add child"/Direction controls too, silently
// pushing orphaned nodes into a leaf element's own unused `.blocks` array
// (never rendered anywhere, since BlockElement.vue never reads it). Fixed
// to check the same `type === 'container'` discriminator BlockContainer.
// vue's own dispatch already uses.
const isContainer = computed(() => (editor.current as any)?.type === 'container')
const isSlider = computed(() => editor.current?.tag === 'slider')
const isTextEditable = computed(() => !!editor.current?.editable)
const isVideoEmbed = computed(() => editor.current?.tag === 'youtube' || editor.current?.tag === 'vimeo')
const isRoot = computed(() => !editor.document || editor.current?.id === editor.document.id)

// Auto-detect the binding target based on the current element's nature.
// This matches the field compatibility table in DataObjectPicker.vue.
const bindingTarget = computed(() => {
  const el = editor.current as any
  if (!el) return 'content'
  if (el.type === 'container' || el.tag === 'slider') return 'custom'
  if (el.element === 'img') return 'src'
  if (el.tag === 'youtube' || el.tag === 'vimeo') return 'src'
  if (el.tag === 'micon' || el.tag === 'iconify') return 'icon'
  if (el.link) return 'href'
  return 'content'
})

function onDataBound(binding: ElementDataBinding) {
  if (editor.current) (editor.current as any).dataBinding = binding
  showDataPicker.value = false
  if (editor.document) resolveDocumentData(editor.document)
}

function onDataClear() {
  if (editor.current) (editor.current as any).dataBinding = null
  showDataPicker.value = false
  if (editor.document) resolveDocumentData(editor.document)
}

// --- Field-level binding (Image src / Link href) ---

// Whether the current element's existing dataBinding targets this field.
const hasSrcBinding = computed(() => (editor.current as any)?.dataBinding?.target === 'src')
const hasHrefBinding = computed(() => (editor.current as any)?.dataBinding?.target === 'href')

const srcBindingLabel = computed(() => {
  const db = (editor.current as any)?.dataBinding
  return db?.target === 'src' && db.field ? `{${db.className}.${db.field}}` : ''
})
const hrefBindingLabel = computed(() => {
  const db = (editor.current as any)?.dataBinding
  return db?.target === 'href' && db.field ? `{${db.className}.${db.field}}` : ''
})

// Allow relative bindings (no objectId) when the element already has a
// binding referencing a data class without a specific object - the object
// comes from the nearest container ancestor's dataContext instead.
const allowRelativeBinding = computed(() => {
  const db = (editor.current as any)?.dataBinding
  return !!(db && !db.objectId && db.className)
})

function openFieldDataPicker(target: 'src' | 'href') {
  fieldDataTarget.value = target
  showFieldDataPicker.value = true
}

function onFieldDataBound(binding: ElementDataBinding) {
  if (editor.current) (editor.current as any).dataBinding = binding
  showFieldDataPicker.value = false
}

function onFieldDataClear() {
  if (editor.current) (editor.current as any).dataBinding = null
  showFieldDataPicker.value = false
}

async function onGenerateTemplate(classId: string) {
  try {
    const dataClass = await getDataClass(classId)
    const template = generateTemplateFromClass(dataClass)
    if (!editor.document) {
      editor.setDocument(template)
      editor.setCurrent(template)
    } else if (editor.current && (editor.current as any).type === 'container') {
      editor.current.blocks.push(template)
      editor.setCurrent(template)
    } else {
      editor.document.blocks.push(template)
      editor.setCurrent(template)
    }
  } catch (e: any) {
    console.error('Failed to generate template:', e)
  }
  showDataPicker.value = false
  showFieldDataPicker.value = false
}

const label = computed(() => {
  const el = editor.current as any
  if (!el) return ''
  if (isContainer.value) {
    return `${el.tag || 'div'} ${el.css?.container?.includes('flex-col') ? 'col' : el.css?.container?.includes('flex') ? 'row' : ''}`.trim()
  }
  // Was el.element (the raw HTML tag - "p", "span", "h", ...) - see
  // DocumentTreeNode.vue's own comment on friendlyElementName() for why
  // that's not actually distinctive enough to tell several builders apart.
  return friendlyElementName(el)
})

function updatePosition() {
  if (!editor.current) return
  const el = document.getElementById(editor.current.id)
  if (!el) return
  const rect = el.getBoundingClientRect()
  top.value = Math.max(4, rect.top - 36)
  left.value = rect.left
}

// The Slider settings popover is tall enough (a dozen-plus controls, five
// of them free-text inputs) that a plain `top-full` drop - fine for every
// other, much shorter popover in this file - can run past the bottom of
// the viewport whenever the toolbar itself is anchored low on screen (the
// toolbar tracks the *selected element's* position, not a fixed spot, so
// this isn't an edge case - it happens whenever a Slider lower on the page
// gets selected). Recomputed continuously (read inside a computed that
// already re-runs every animation frame off `top.value`, no separate
// listener needed) rather than measured once, so window resizes and the
// toolbar's own movement both stay accounted for automatically.
const TOOLBAR_HEIGHT = 34
const POPOVER_MARGIN = 12
const sliderPopoverOpensUpward = computed(() => {
  const spaceBelow = window.innerHeight - (top.value + TOOLBAR_HEIGHT) - POPOVER_MARGIN
  return spaceBelow < 320 && top.value > spaceBelow
})
const sliderPopoverMaxHeight = computed(() => {
  const available = sliderPopoverOpensUpward.value
    ? top.value - POPOVER_MARGIN
    : window.innerHeight - (top.value + TOOLBAR_HEIGHT) - POPOVER_MARGIN
  return Math.max(160, available)
})

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

// Same popover pattern as Fill color (custom native picker + standard
// Tailwind swatch grid + clear), operating on `color:`/`text-{color}-
// {shade}` instead of `background-color:`/`bg-{color}-{shade}`.
//
// A real bug, fixed here: the old plain `/color:[^;]+;?/g` strip matched
// "color:" as a literal substring - including inside "background-color:",
// which also contains that substring. Setting a text color while a fill
// color was already set corrupted the style string (left a dangling,
// invalid "background-" fragment behind and silently discarded the
// background-color value in the process). Fixed with a negative lookbehind
// (`(?<!-)color:`) so a "color:" preceded by "-" (i.e. part of
// "background-color:") is correctly left alone.
function pickTextColor(e: Event) {
  if (!editor.current) return
  const value = (e.target as HTMLInputElement).value
  const el = editor.current as any
  el.css.css = clean(el.css.css.split(' ').filter((cl: string) => !TEXT_COLOR_CLASS_RE.test(cl)).join(' '))
  el.style = `${(el.style ?? '').replace(/(?<!-)color:[^;]+;?/g, '')}color:${value};`
}

function pickTextSwatch(value: string) {
  if (!editor.current) return
  const el = editor.current as any
  el.style = (el.style ?? '').replace(/(?<!-)color:[^;]+;?/g, '')
  const withoutOld = el.css.css.split(' ').filter((cl: string) => !TEXT_COLOR_CLASS_RE.test(cl)).join(' ')
  el.css.css = clean(`${withoutOld} ${value}`)
  showTextPicker.value = false
}

function clearTextColor() {
  if (!editor.current) return
  const el = editor.current as any
  el.style = (el.style ?? '').replace(/(?<!-)color:[^;]+;?/g, '')
  el.css.css = clean(el.css.css.split(' ').filter((cl: string) => !TEXT_COLOR_CLASS_RE.test(cl)).join(' '))
  showTextPicker.value = false
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

// Port of the source's BlockImageUrl.vue's URL + "Alternative text" fields
// (its own Caption field isn't ported - no UI here reads element.image.
// caption anywhere, so it'd be a field with nowhere to show up; Unsplash
// search isn't ported either, superseded by the real DAM-backed
// MediaPickerModal.vue). Alt is only shown/meaningful for an actual
// `<img>` element (`element.element === 'img'`), matching the source's own
// `v-if="...element==='img'"` gate - a CSS background-image has no `alt`
// concept in HTML at all.
function openImagePicker() {
  if (!editor.current) return
  imageUrlDraft.value = editor.current.image?.url || ''
  imageAltDraft.value = editor.current.image?.alt || ''
  showImagePicker.value = true
}

function applyImage() {
  if (!editor.current) return
  editor.current.image = { url: imageUrlDraft.value, alt: imageAltDraft.value || null }
  showImagePicker.value = false
}

function clearImage() {
  if (!editor.current) return
  editor.current.image = { url: null, alt: null }
  imageUrlDraft.value = ''
  imageAltDraft.value = ''
  showImagePicker.value = false
}

// The picker emits a *stable path* (pimcorePath), never a resolved URL -
// see resolve-display-url.ts/dam-api.ts for why. Preserves any alt text
// already set - picking a new image from the DAM shouldn't silently wipe
// out alt text the user already typed.
function onMediaPicked(pimcorePath: string) {
  if (editor.current) editor.current.image = { ...editor.current.image, url: pimcorePath }
  showMediaPicker.value = false
}

// Not a port - the source never asks for a target at all (see
// preview/BlockContainerPreview.vue's own comment: its wrapping <a> has no
// target attribute anywhere). `linkTarget` is a new field, not in
// ElementsClass.js's constructor (kept byte-for-byte unmodified) - just
// assigned dynamically like `image`/`gsap.animation` already are elsewhere
// in this app, with ElementsClass.d.ts's hand-written shim updated to
// acknowledge it as an optional field.
function openLinkPicker() {
  if (!editor.current) return
  linkUrlDraft.value = editor.current.link || ''
  linkTargetDraft.value = (editor.current as any).linkTarget || '_self'
  showLinkPicker.value = true
  showPageLinkPicker.value = false
}

function applyLink() {
  if (!editor.current) return
  editor.current.link = linkUrlDraft.value
  ;(editor.current as any).linkTarget = linkTargetDraft.value
  // Mutually exclusive with "link to a page" - one unambiguous source of
  // truth per element.
  ;(editor.current as any).dynamicLink = null
  showLinkPicker.value = false
}

function clearLink() {
  if (!editor.current) return
  editor.current.link = ''
  ;(editor.current as any).linkTarget = '_self'
  linkUrlDraft.value = ''
  linkTargetDraft.value = '_self'
  showLinkPicker.value = false
}

// Nearest ancestor container (walking up from the selected element) whose
// own dataBinding is a collection binding (whole-object, resolveMode
// 'query') - the Data Class "Link to a page" resolves per-record field
// values against. null when the selected element isn't inside one at all.
const ancestorCollectionClassName = computed<string | null>(() => {
  if (!editor.document || !editor.current) return null
  const chain = findAncestorChain(editor.document, editor.current.id)
  for (let i = chain.length - 1; i >= 0; i--) {
    const db = (chain[i] as any).dataBinding
    if (db && !db.field && db.resolveMode === 'query') return db.className
  }
  return null
})

const hasDynamicLink = computed(() => !!(editor.current as any)?.dynamicLink)

async function togglePageLinkPicker() {
  if (!editor.current || !ancestorCollectionClassName.value) return
  if (showPageLinkPicker.value) {
    showPageLinkPicker.value = false
    return
  }
  const existing = (editor.current as any).dynamicLink
  pageLinkTargetPageId.value = existing?.targetPageId || ''
  pageLinkValueField.value = existing?.valueField || ''
  try {
    const [pages, dataClass] = await Promise.all([listPages(), getDataClassByName(ancestorCollectionClassName.value)])
    dynamicPagesList.value = pages.filter((p) => isDynamicSlug(p.path))
    ancestorClassFields.value = dataClass?.fields ?? []
  } catch (err) {
    console.error('[FloatingToolbar] Failed to load pages/fields for page link:', err)
    dynamicPagesList.value = []
    ancestorClassFields.value = []
  }
  showPageLinkPicker.value = true
}

function applyPageLink() {
  if (!editor.current || !pageLinkTargetPageId.value || !pageLinkValueField.value) return
  ;(editor.current as any).dynamicLink = {
    targetPageId: pageLinkTargetPageId.value,
    valueField: pageLinkValueField.value,
  }
  // Mutually exclusive with the plain URL link.
  editor.current.link = ''
  ;(editor.current as any).linkTarget = '_self'
  linkUrlDraft.value = ''
  showPageLinkPicker.value = false
  showLinkPicker.value = false
}

function clearPageLink() {
  if (!editor.current) return
  ;(editor.current as any).dynamicLink = null
  pageLinkTargetPageId.value = ''
  pageLinkValueField.value = ''
  showPageLinkPicker.value = false
}

function pickAnimation(e: Event) {
  if (!editor.current) return
  const value = (e.target as HTMLSelectElement).value
  // `gsap` is a real Element default (ElementsClass.js's constructor), but
  // content that never went through `new Element()` - migrated Pimcore
  // pages (pimcore-page-converter.ts's baseElement()), or any page
  // authored directly via the core-api - won't have it.
  if (!editor.current.gsap) (editor.current as any).gsap = { animation: null, ease: null, duration: 0, delay: 0 }
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

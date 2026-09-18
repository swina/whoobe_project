<template>
  <div class="h-full flex flex-col bg-gray-100 text-black">
    <div class="w-full h-10 px-4 flex items-center justify-start gap-2 bg-slate-200 border-t border-slate-300 shadow-sm text-[8px] font-mono">
      <template v-if="!editor.embedded">
        <span class="font-semibold text-gray-700 bg-violet-600 text-white px-2 py-1 rounded-md">Whoobe One Spike</span>
        <span class="text-gray-400">|</span>
        <span class="text-gray-500">
          selected: <b>{{ editor.current ? editor.current.element + ' (' + editor.current.id + ')' : 'none' }}</b>
        </span>
      </template>
      <!---<div class="flex-1"></div>-->

      <span v-if="saveState" class="text-[11px] text-gray-400 mr-1">{{ saveState }}</span>
      <button
        v-if="editor.page?.id && !editor.mailTemplateId && !editor.snippetMode"
        title="Edit this page's path"
        class="text-gray-400 hover:text-indigo-600 mr-1"
        @click="onEditSlug"
      >
        <Pencil class="w-3.5 h-3.5" />
      </button>

      <button :class="topbarBtnClass" @click="onNew"><FilePlus class="w-3.5 h-3.5" /> New</button>
      <!-- Hidden when embedded (CMS integration plan §6/§7) - the host's
           own page-listing view is what's reachable in that case, this
           app's own Templates gallery would be a redundant second way to
           browse the same content. -->
      <button :class="topbarBtnClass" @click="onSave"><Save class="w-3.5 h-3.5" /> {{ editor.mailTemplateId || editor.snippetMode ? 'Save' : 'Save' }}</button>
      <button :class="topbarBtnClass" @click="showThemeModal = true"><Palette class="w-3.5 h-3.5" /> Theme</button>
      <button v-if="editor.page?.id && !editor.mailTemplateId && !editor.snippetMode" :class="topbarBtnClass" @click="onSaveAs"><CopyPlus class="w-3.5 h-3.5" /> Save As</button>
      <button :class="topbarBtnClass" @click="showAiGeneratePage = true"><Wand2 class="w-3.5 h-3.5" /> AI Page</button>
      <button :class="topbarBtnClass" @click="showAiGenerateImage = true"><Image class="w-3.5 h-3.5" /> AI Image</button>
      <button :class="topbarBtnClass" @click="showFigmaImport = true"><Palette class="w-3.5 h-3.5" /> Figma</button>
      <button v-if="!editor.embedded" :class="topbarBtnClass" @click="showTemplateGallery = true">
        <FolderOpen class="w-3.5 h-3.5" /> Templates
      </button>
      <button :class="topbarBtnClass" @click="showAddToKit = true"><PackagePlus class="w-3.5 h-3.5" /> Add to Kit</button>
      <button :class="topbarBtnClass" @click="exportDocument(editor)"><Download class="w-3.5 h-3.5" /> Export</button>
      <button :class="topbarBtnClass" @click="fileInput?.click()"><Upload class="w-3.5 h-3.5" /> Import</button>
      <input ref="fileInput" type="file" accept="application/json" class="hidden" @change="onImportFile" />
      <button :class="topbarBtnClass" @click="showEditorSettings = true"><Cog class="w-3.5 h-3.5" /> Settings</button>
      <button :class="topbarBtnClass" @click="editor.setPreview(editor.appMode ? 'mobile' : 'fullscreen')"><Eye class="w-3.5 h-3.5" /> Preview</button>
      <button
        :class="[topbarBtnClass, editor.appMode ? 'text-indigo-600 bg-indigo-50' : '']"
        @click="onToggleAppMode"
      >
        <Smartphone class="w-3.5 h-3.5" /> App Mode
      </button>
    </div>

    <div class="flex-1 min-h-0 flex pb-5">
      <!-- @click.self, not plain @click: a plain @click here would also
           fire on the way up from a click already handled deeper in the
           tree (e.g. BlockContainer's own @click.self selecting a
           container) - a click event keeps bubbling after being handled,
           it doesn't stop just because something deeper acted on it. That
           was a real bug: select a container by clicking its background,
           and this handler would immediately clear the selection right
           back to null in the same click. @click.self only fires when
           this exact div was the actual click target - i.e. genuinely
           outside the whole document tree. -->
      <div
        class="flex-1 min-h-0 overflow-auto p-6 pt-10"
        :class="editor.appMode ? 'flex justify-center bg-gray-200' : ''"
        @click.self="editor.setCurrent(null)"
        @dragover="onGatewayFieldDragOver"
        @drop="onGatewayFieldDrop"
      >
        <div v-if="editor.appMode" class="relative bg-white shadow-xl rounded-[32px] overflow-hidden mx-auto my-4"
          style="width: 390px; height: 844px;">
          <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[30px] bg-black rounded-b-2xl z-10"></div>
          <div class="h-full overflow-y-auto">
            <BlockContainer v-if="editor.document" :doc="editor.document" :level="0" />
          </div>
          <div class="absolute bottom-1 left-1/2 -translate-x-1/2 w-[134px] h-[5px] bg-gray-400 rounded-full"></div>
        </div>
        <BlockContainer v-else-if="editor.document" :doc="editor.document" :level="0" />
      </div>

      <!-- Right sidebar: a tab switcher between the "add element" palette
           and the Tailwind customizer, mirroring the source's own right-
           side toolbar (Elements/Tailwind/CSS/Attributes/... tabs) rather
           than the earlier single-purpose always-elements sidebar.
           Horizontally collapsible - width lives here on the wrapper (not
           on each panel's own root, which used to each hardcode their own
           `w-64`) so collapsing doesn't need to reach into every panel. -->
      <div class="shrink-0 relative flex border border-slate-300 text-[9px] font-medium" :class="sidebarCollapsed ? 'w-0 border-l-0' : 'w-64'">
        <button
          type="button"
          :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          class="absolute top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full border bg-white shadow flex items-center justify-center text-gray-400 hover:text-indigo-600"
          :class="sidebarCollapsed ? '-left-5' : '-left-4'"
          @click="sidebarCollapsed = !sidebarCollapsed"
        >
          <ChevronLeft v-if="sidebarCollapsed" class="w-3.5 h-3.5" />
          <ChevronRight v-else class="w-3.5 h-3.5" />
        </button>

        <div v-show="!sidebarCollapsed" class="w-64 min-w-0 flex flex-col overflow-hidden text-xs">
          <div class="flex border-b text-xs shrink-0 bg-violet-200">

            <button
              type="button"
              title="Elements"
              class="flex-1 flex items-center justify-center py-2"
              :class="sidebarTab === 'elements' ? 'text-violet-600 border-b-2 border-indigo-600 -mb-px' : 'text-gray-400 hover:text-gray-600'"
              @click="sidebarTab = 'elements'"
            >
              <Shapes class="w-6 h-6" />
            </button>

            <button
              type="button"
              title="Snippets"
              class="flex-1 flex items-center justify-center py-2"
              :class="sidebarTab === 'snippets' ? 'text-violet-600 border-b-2 border-indigo-600 -mb-px' : 'text-gray-400 hover:text-gray-600'"
              @click="sidebarTab = 'snippets'"
            >
              <Component class="w-6 h-6" />
            </button>

            <button
              type="button"
              title="Customize"
              class="flex-1 flex items-center justify-center py-2"
              :class="sidebarTab === 'customize' ? 'text-violet-600 border-b-2 border-indigo-600 -mb-px' : 'text-gray-400 hover:text-gray-600'"
              @click="sidebarTab = 'customize'"
            >
              <Palette class="w-6 h-6" />
            </button>

            <button
              type="button"
              title="Advanced"
              class="flex-1 flex items-center justify-center py-2"
              :class="sidebarTab === 'advanced' ? 'text-violet-600 border-b-2 border-indigo-600 -mb-px' : 'text-gray-400 hover:text-gray-600'"
              @click="sidebarTab = 'advanced'"
            >
              <Settings2 class="w-6 h-6" />
            </button>

            <button
              type="button"
              title="Tree"
              class="flex-1 flex items-center justify-center py-2"
              :class="sidebarTab === 'tree' ? 'text-violet-600 border-b-2 border-indigo-600 -mb-px' : 'text-gray-400 hover:text-gray-600'"
              @click="sidebarTab = 'tree'"
            >
              <ListTree class="w-6 h-6" />
            </button>
            
            <button
              type="button"
              title="Kits"
              class="flex-1 flex items-center justify-center py-2"
              :class="sidebarTab === 'kits' ? 'text-violet-600 border-b-2 border-indigo-600 -mb-px' : 'text-gray-400 hover:text-gray-600'"
              @click="sidebarTab = 'kits'"
            >
              <Package class="w-6 h-6" />
            </button>

            <button
              type="button"
              title="AI generations"
              class="flex-1 flex items-center justify-center py-2"
              :class="sidebarTab === 'ai' ? 'text-violet-600 border-b-2 border-indigo-600 -mb-px' : 'text-gray-400 hover:text-gray-600'"
              @click="sidebarTab = 'ai'"
            >
              <WandSparkles class="w-6 h-6" />
            </button>

            <button
              type="button"
              title="Integrations"
              class="flex-1 flex items-center justify-center py-2"
              :class="sidebarTab === 'gateway' ? 'text-violet-600 border-b-2 border-indigo-600 -mb-px' : 'text-gray-400 hover:text-gray-600'"
              @click="sidebarTab = 'gateway'"
            >
              <Plug class="w-6 h-6" />
            </button>

            <button
              v-if="editor.appMode"
              type="button"
              title="App Config"
              class="flex-1 flex items-center justify-center py-2"
              :class="sidebarTab === 'pwa' ? 'text-violet-600 border-b-2 border-indigo-600 -mb-px' : 'text-gray-400 hover:text-gray-600'"
              @click="sidebarTab = 'pwa'"
            >
              <Smartphone class="w-6 h-6" />
            </button>
          </div>
          <!-- Real BlockElements.vue port (categorized, drag-to-add) - see
               BlockElementsPalette.vue. Dragging out of it works exactly like
               the old flat palette row did (same data-type="template"/
               data-template attributes, same dragula-source-container class),
               so the shared dragula instance/drop handler below need no
               changes. -->
          <BlockElementsPalette v-if="sidebarTab === 'elements'" />
          <TailwindCustomizer v-else-if="sidebarTab === 'customize'" />
          <AdvancedPanel v-else-if="sidebarTab === 'advanced'" />
          <DocumentTree v-else-if="sidebarTab === 'tree'" />
          <SnippetsPanel v-else-if="sidebarTab === 'snippets'" />
          <KitsPanel v-else-if="sidebarTab === 'kits'" @loaded="sidebarTab = 'elements'" />
          <GatewayPanel v-else-if="sidebarTab === 'gateway'" />
          <PwaConfigPanel v-else-if="sidebarTab === 'pwa'" />
          <AiGeneratedPanel v-else @import="onAiGeneratedImport" @preview="onAiGeneratedPreview" />
        </div>
      </div>
    </div>

    <FloatingToolbar />

    <DocumentPreview v-if="editor.preview" :doc="editor.document" @close="editor.setPreview(false)" />

    <AddToKitModal v-if="showAddToKit" @close="showAddToKit = false" />

    <TemplateGalleryModal v-if="showTemplateGallery" @close="showTemplateGallery = false" @loaded="onTemplateLoaded" />

    <ThemeModal v-if="showThemeModal" @close="showThemeModal = false" />

    <AiGenerateModal
      v-if="showAiGeneratePage"
      kind="page"
      :context="{ pageTitle: editor.page?.name ?? null, pageCategory: editor.page?.category ?? null }"
      @close="showAiGeneratePage = false"
      @generated="onAiPageGenerated"
    />

    <AiImageGenerateModal
      v-if="showAiGenerateImage"
      @close="showAiGenerateImage = false"
      @select="onAiImageSelected"
    />

    <FigmaImportModal
      v-if="showFigmaImport"
      @close="showFigmaImport = false"
      @imported="onFigmaImported"
    />

    <AiGeneratedPreviewModal
      v-if="showAiPreview && aiPreviewRecord"
      :record="aiPreviewRecord"
      @close="showAiPreview = false"
      @import="onAiGeneratedImportIntoCurrent"
    />

    <EditorSettingsModal v-if="showEditorSettings" @close="showEditorSettings = false" />

    <div v-if="message" class="shrink-0 px-4 py-1.5 text-white text-xs" :class="messageKind === 'error' ? 'bg-rose-600' : 'bg-emerald-600'">
      {{ message }}
    </div>
  </div>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's src/components/blocks/BlockEditor.vue,
// trimmed to Phase 0 scope (see docs/plans/cms/whoobe-one-studio-vue3-port-
// plan.md §5): the floating-toolbar positioning system, autosave, and
// dialog-bus wiring are all deferred (Phase 2+) - this keeps just enough
// chrome to add/select/edit/reorder/delete nodes, which is what Phase 0
// exists to prove works at all under Vue 3.
//
// The single dragula instance lives here (not one per BlockContainer, see
// that file's comment) and is the part of this spike carrying the most
// real risk: dragula physically moves the dragged DOM node into the target
// container as part of its own drag UX, *before* our 'drop' handler runs.
// If we then also push a data node into the target's reactive array, Vue's
// own re-render creates a *new* DOM node for it, leaving dragula's
// manually-moved original node behind as a duplicate. The fix (a
// well-known Vue+dragula integration pattern): undo dragula's DOM move
// ourselves in the 'drop' handler before mutating state, so Vue's reactive
// re-render is the only thing that ever decides final DOM order - true
// whether the dropped item is an existing node being reordered or a brand
// new one being created from the palette below.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import dragula from 'dragula'
import {
  ChevronLeft,
  ChevronRight,
  Component,
  CopyPlus,
  Download,
  Eye,
  FilePlus,
  FolderOpen,
  Cog,
  Image,
  ListTree,
  Package,
  PackagePlus,
  Palette,
  Pencil,
  Plug,
  Save,
  Settings2,
  Shapes,
  Smartphone,
  Sparkles,
  Upload,
  Wand2,
  WandSparkles,
} from '@lucide/vue'
import Element from '../scripts/ElementsClass.js'
import Block from '../scripts/BlocksClass.js'
import BlockContainer from './BlockContainer.vue'
import FloatingToolbar from './FloatingToolbar.vue'
import BlockElementsPalette from './BlockElementsPalette.vue'
import TailwindCustomizer from './TailwindCustomizer.vue'
import DocumentTree from './DocumentTree.vue'
import AdvancedPanel from './AdvancedPanel.vue'
import DocumentPreview from './DocumentPreview.vue'
import KitsPanel from './KitsPanel.vue'
import SnippetsPanel from './SnippetsPanel.vue'
import AddToKitModal from './AddToKitModal.vue'
import TemplateGalleryModal from './TemplateGalleryModal.vue'
import ThemeModal from './ThemeModal.vue'
import AiGenerateModal from './AiGenerateModal.vue'
import AiImageGenerateModal from './AiImageGenerateModal.vue'
import FigmaImportModal from './FigmaImportModal.vue'
import AiGeneratedPanel from './AiGeneratedPanel.vue'
import AiGeneratedPreviewModal from './AiGeneratedPreviewModal.vue'
import EditorSettingsModal from './EditorSettingsModal.vue'
import PwaConfigPanel from './PwaConfigPanel.vue'
import GatewayPanel from './GatewayPanel.vue'
import type { AiGeneratedRecord } from '../ai-api'
import { GATEWAY_FIELD_DRAG_MIME_TYPE, type GatewayFieldDragPayload } from '../utils/gateway-drag'
import { useEditorStore } from '../store/editor'
import { useSnippetsStore } from '../store/snippets'
import { useThemeStyles } from '../composables/useThemeStyles'
import { clean, findNodeById, removeNodeById, findParentAndIndex, applyImagePlaceholder, normalizeGeneratedTree } from '../helpers'
import { editorBus } from '../bus'
import { exportDocument, importDocument, cloneWithFreshIds, insertGeneratedSnippet } from '../scripts/editor-actions'
import { savePage, saveMailTemplate, saveSnippet, saveAsNewTemplate, updatePageSlug } from '../scripts/database-actions'
import { resolveDocumentData } from '../scripts/data-resolver'
import { insertFigmaAsPage, insertFigmaAsSnippet } from '../scripts/figma-actions'

type WhoobeElement = InstanceType<typeof Element>

const editor = useEditorStore()
const snippetsStore = useSnippetsStore()
const message = ref('')
const topbarBtnClass = 'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-violet-400 hover:bg-violet-800 text-white'
const sidebarTab = ref<'elements' | 'customize' | 'tree' | 'advanced' | 'snippets' | 'kits' | 'ai' | 'pwa' | 'gateway'>('elements')
const sidebarCollapsed = ref(false)
const showAddToKit = ref(false)
const showTemplateGallery = ref(false)
const showThemeModal = ref(false)
const showAiGeneratePage = ref(false)
const showAiGenerateImage = ref(false)
const showFigmaImport = ref(false)
const showEditorSettings = ref(false)

// Inject theme colors as @theme CSS custom properties so @tailwindcss/browser
// recognizes named classes like `bg-light-grey`. Watches editor.document
// reactively and updates a shared <style id="whoobe-theme-styles">.
useThemeStyles(() => editor.document)

// A real, reported bug fixed here: `flash()` used to render every message
// - including genuine failures ("Failed to save", "A path is required...")
// - in the exact same green success bar (`bg-emerald-600`, unconditional).
// A save that actually failed server-side still popped up looking like a
// success confirmation, which is exactly backwards - `messageKind` now
// picks red (`bg-rose-600`) for errors, so a failed save reads as a
// failure at a glance instead of being easy to mistake for one that
// worked (reported as "I don't see Save As even though I saved the
// template" - the save had very likely never actually succeeded at all).
const messageKind = ref<'success' | 'error'>('success')
function flash(text: string, kind: 'success' | 'error' = 'success') {
  message.value = text
  messageKind.value = kind
  window.setTimeout(() => (message.value = ''), 1500)
}

// Phase 2: real save/load (database-actions.ts - originally Dexie-backed,
// now the real backend, see that file's own header comment) and JSON
// export/import (editor-actions.ts). Loading now opens TemplateGalleryModal
// (a real gallery, same as Kits) rather than the plain text dropdown this
// used to be - see that file's own header comment.
const saveState = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

// Not a port - BlocksClass.js's own model has no URL-routing concept at
// all (see BlocksClass.d.ts's comment), so a plain slug guess from the
// page's name is as good a starting point as this app can offer; the user
// can still type over it entirely in the prompt below.
function suggestPathFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return '/' + slug
}

// "New" - starts a genuinely empty template: a bare root container with
// zero children, not the demo content (heading/paragraph/image/button)
// views/Editor.vue seeds on first load - that seed exists to prove the
// core editing loop works at all on a cold start, not to be what "New"
// hands you every time you deliberately ask to start over. Mirrors that
// same seeding pattern otherwise (a Flexbox tagged 'document' - see
// ElementsClass.js's Slider() comment and database-actions.ts's
// unwrapDocumentRoot() for why every document root carries that tag).
// Resets `editor.page` to a fresh, unsaved Block too (id left at its
// constructor default, `0`) - "New" must not silently keep pointing at
// whatever template happened to be open before, or the next "Save Template"
// would overwrite it instead of creating a genuinely new one. No unsaved-
// changes confirmation prompt - consistent with every other document-
// replacing action in this file (Load, Import), none of which warn either.
function onNew() {
  const root = new Element().Flexbox({ direction: 'col' }).setIcon('dashboard').setTag('document')
  // No padding/margin here deliberately - the root should render full-bleed
  // by default (a real page has no built-in inset), with any padding/margin
  // left entirely to the user to add via the customize sidebar. The canvas
  // min-height affordance is editor-only (see .whoobe-canvas-root in
  // style.css / BlockContainer.vue) and is NOT baked into the stored
  // content, so it never leaks into preview or the public site.
  root.css.container = clean(root.css.container)

  editor.setDocument(root)
  editor.setCurrent(null)

  const page = new Block()
  page.name = 'Untitled'
  page.category = ''
  page.json.blocks = root
  editor.setPage(page)

  // Leaving a mail-template/snippet session also leaves its mode - "New"
  // now edits a plain document again, not an unsaved template/snippet.
  editor.setMailTemplateId(null)
  editor.setSnippetMode(false)

  flash('New empty template')
}

// "Save Template" - overwrites the current template in place once it
// already has one; only asks for a path the very first time (a document
// with no id yet). A real, reported gap this used to have: there was no
// way to take an already-saved template and branch off a *new*, separate
// copy of it instead - only ever "create the first time" or "overwrite
// forever after" existed. `onSaveAs()` below is the other half of that -
// two always-visible, clearly distinct actions (once there's something to
// tell them apart from) rather than one button that silently asks a
// choice via a confirm() popup.
async function onSave() {
  if (!editor.page) return

  // Editing a whoobe snippet (admin-dashboard's Snippets item) - saves to
  // whoobe_one_snippets, creating on first save.
  if (editor.snippetMode) {
    saveState.value = 'saving…'
    try {
      await saveSnippet(editor)
      saveState.value = 'saved ' + new Date().toLocaleTimeString()
    } catch (e: any) {
      saveState.value = ''
      flash(e?.message || 'Failed to save snippet', 'error')
    }
    return
  }

  // Editing an HTML mail template (docs/plans/forms/mail-templates.md) -
  // no path to ask for, saves straight to mail_templates.
  if (editor.mailTemplateId) {
    saveState.value = 'saving…'
    try {
      await saveMailTemplate(editor)
      saveState.value = 'saved ' + new Date().toLocaleTimeString()
    } catch (e: any) {
      saveState.value = ''
      flash(e?.message || 'Failed to save mail template', 'error')
    }
    return
  }

  // Only a brand-new document (no id yet) needs a path - an already-saved
  // one keeps whatever it was given the first time (changing a document's
  // path later isn't in scope here).
  let path: string | undefined
  if (!editor.page.id) {
    const suggested = suggestPathFromName(editor.page.name || '')
    const input = window.prompt('Document path (e.g. /about-us or /it/news/{slug} for a dynamic page)', suggested)
    if (input === null) return // cancelled - don't create a half-saved document
    path = input.trim() ? (input.trim().startsWith('/') ? input.trim() : '/' + input.trim()) : ''
    if (!path) {
      flash('A path is required to save a new document', 'error')
      return
    }
  }

  saveState.value = 'saving…'
  try {
    await savePage(editor, path)
    saveState.value = 'saved ' + new Date().toLocaleTimeString()
  } catch (e: any) {
    // A real, expected failure mode now that this is a network call
    // against a real database, not local storage - most commonly the
    // path's own unique constraint (see whoobe-one-template-schema.ts),
    // surfaced by core-api as a 409 with a clear message.
    saveState.value = ''
    flash(e?.message || 'Failed to save', 'error')
  }
}

// The counterpart onSave() itself deliberately doesn't offer for an
// already-saved page (see its own comment) - updatePageSlug() covers the
// real gap that leaves: an existing page's path/slug could never be
// changed through this editor at all before, so a dynamic pattern like
// /it/news/{slug} (docs/plans/website/website-paths.md) could only ever
// be set at creation time.
async function onEditSlug() {
  if (!editor.page?.id) return
  const current = (editor.page as any).path || ''
  const input = window.prompt('Document path (e.g. /about-us or /it/news/{slug} for a dynamic page)', current)
  if (input === null) return // cancelled
  const trimmed = input.trim()
  const newSlug = trimmed ? (trimmed.startsWith('/') ? trimmed : '/' + trimmed) : ''
  if (!newSlug || newSlug === current) return
  try {
    await updatePageSlug(editor, newSlug)
    flash('Path updated')
  } catch (e: any) {
    flash(e?.message || 'Failed to update path', 'error')
  }
}

// Only shown once `editor.page.id` already exists (see the template) -
// for a brand-new document, "Save" and "Save As" would be the exact same
// action, so there's nothing for a second button to offer yet. Always
// creates a genuinely new template (saveAsNewTemplate() in database-
// actions.ts never overwrites the original) and switches `editor.page` to
// point at that new one - matching "Save As" in every other editor, where
// you keep working on the new copy afterward, not the original.
async function onSaveAs() {
  if (!editor.page) return

  const suggestedName = `${editor.page.name || 'Untitled'} copy`
  const name = window.prompt('New template name', suggestedName)
  if (name === null || !name.trim()) return

  const suggestedPath = suggestPathFromName(name.trim())
  const pathInput = window.prompt('Document path (e.g. /about-us-copy)', suggestedPath)
  if (pathInput === null) return
  const path = pathInput.trim() ? (pathInput.trim().startsWith('/') ? pathInput.trim() : '/' + pathInput.trim()) : ''
  if (!path) {
    flash('A path is required to save a new template', 'error')
    return
  }

  saveState.value = 'saving…'
  try {
    await saveAsNewTemplate(editor, name.trim(), path)
    saveState.value = 'saved ' + new Date().toLocaleTimeString()
    flash(`Saved as "${name.trim()}"`)
  } catch (e: any) {
    saveState.value = ''
    flash(e?.message || 'Failed to save as a new template', 'error')
  }
}

function onTemplateLoaded() {
  flash('Loaded')
}

// AI-generated whole-page replacement - mirrors onNew()'s document swap
// (fresh ids throughout, root coerced to the 'document' tag the editor
// expects, page object reset so the next "Save Template" saves this new
// content, keeping the page's id/name/category if one was already open).
function onAiPageGenerated(payload: unknown) {
  showAiGeneratePage.value = false
  if (!editor.document) return
  // normalizeGeneratedTree(): the model's raw output uses builder names
  // for `type` and omits `element` entirely (see helpers.ts's own comment
  // on the render dispatch), which rendered generated pages as empty
  // canvas - derive the fields the editor's renderer actually needs.
  const root = normalizeGeneratedTree(cloneWithFreshIds(payload)) as WhoobeElement
  root.tag = 'document'
  root.icon = 'dashboard'
  root.css = {
    css: clean(root.css?.css || ''),
    container: clean(root.css?.container || ''),
  }
  applyImagePlaceholder(root)
  editor.setDocument(root)
  editor.setCurrent(null)
  const page = editor.page ?? new Block()
  page.name = editor.page?.name || 'Untitled'
  page.category = editor.page?.category || ''
  page.json.blocks = root
  editor.setPage(page)
  flash('AI page generated')
}

function onAiImageSelected(result: { damUrl: string; assetId: string }) {
  showAiGenerateImage.value = false
  if (!editor.document) return
  const img = new Element().Image()
  img.image = { url: result.damUrl, alt: null, assetId: result.assetId }
  const current = editor.current as (WhoobeElement & { type?: string }) | null
  if (current && current.type === 'container') {
    current.blocks.push(img)
  } else if (current) {
    const found = findParentAndIndex(editor.document, current.id)
    if (found) found.parent.blocks.splice(found.index + 1, 0, img)
    else editor.document.blocks.push(img)
  } else {
    editor.document.blocks.push(img)
  }
  editor.setCurrent(img)
  flash('AI image inserted')
}

// Re-import from the AI history panel (AiGeneratedPanel): a generation can
// be lost between server-side success (payload persisted in
// whoobe_ai_generated) and the client actually inserting it into the
// canvas - this is the recovery path. Pages replace the document (same as
// a fresh generation), snippets insert at the current selection (same as
// the FloatingToolbar's flow).
function onAiGeneratedImport(record: { kind: 'snippet' | 'page'; payload: unknown }) {
  if (record.kind === 'page') {
    onAiPageGenerated(record.payload)
    return
  }
  insertGeneratedSnippet(editor, record.payload)
  flash('AI snippet imported')
}

function onFigmaImported(result: { element: any; name: string; mode: 'page' | 'snippet' }) {
  showFigmaImport.value = false
  if (result.mode === 'page') {
    insertFigmaAsPage(editor, result.element, result.name)
    flash(`Figma page imported: ${result.name}`)
  } else {
    const ok = insertFigmaAsSnippet(editor, result.element)
    flash(ok ? `Figma snippet imported: ${result.name}` : 'Failed to import Figma snippet')
  }
}

// Preview button from the AI history panel: opens the read-only modal
// (AiGeneratedPreviewModal renders the payload through the same
// BlockContainerPreview renderer DocumentPreview uses).
const showAiPreview = ref(false)
const aiPreviewRecord = ref<AiGeneratedRecord | null>(null)
function onAiGeneratedPreview(record: AiGeneratedRecord) {
  aiPreviewRecord.value = record
  showAiPreview.value = true
}

// "Import into current element" (from the panel's Import button or the
// preview modal's footer): always inserts the tree into the current
// selection - into it when it's a real container, after it otherwise,
// falling back to the page root when nothing is selected - regardless of
// the stored kind, unlike the row click above (which keeps the old
// kind-aware behavior: page → replace document).
function onAiGeneratedImportIntoCurrent(record: AiGeneratedRecord) {
  showAiPreview.value = false
  insertGeneratedSnippet(editor, record.payload)
  flash(`AI ${record.kind} imported into current element`)
}

async function onImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  await importDocument(editor, file)
  if (fileInput.value) fileInput.value.value = ''
  flash('Imported')
}

// Autosave timer - periodically calls onSave() when enabled.
// The timer interval is read reactively from the store so changing the
// setting takes effect without a page reload. The timer is started/restarted
// whenever the config changes, and cleared on unmount.
const autosaveTimer = ref<ReturnType<typeof setInterval> | null>(null)

function startAutosave() {
  stopAutosave()
  if (!editor.autosave.enabled) return
  const ms = editor.autosave.interval * 1000
  if (ms < 10000) return
  autosaveTimer.value = setInterval(() => {
    if (editor.document && editor.page) onSave()
  }, ms)
}

function stopAutosave() {
  if (autosaveTimer.value !== null) {
    clearInterval(autosaveTimer.value)
    autosaveTimer.value = null
  }
}

watch(() => editor.autosave, startAutosave, { deep: true, immediate: true })

onUnmounted(stopAutosave)

// Alt+N (hotkeys.ts) has emitted this since Phase 1 with nothing
// listening - this is the first real listener, matching hotkeys.ts's own
// comment that the preview hotkey "stays inert until the feature it
// targets is actually built".
function onPreviewEvent(mode: string) {
  editor.setPreview(mode)
}

function onToggleAppMode() {
  const next = !editor.appMode
  editor.setAppMode(next)
  if (next) {
    editor.setPreview('mobile')
  } else {
    editor.setPreview(false)
  }
}
onMounted(() => editorBus.on('preview', onPreviewEvent))
onUnmounted(() => editorBus.off('preview', onPreviewEvent))

// Loaded eagerly here, not lazily by SnippetsPanel.vue's own onMounted -
// the drop handler below and SaveSnippetModal.vue's "Update existing" list
// both need snippetsStore.items populated regardless of whether the user
// has ever opened the Snippets sidebar tab.
onMounted(() => snippetsStore.refresh())

onMounted(() => {
  const drake = dragula({
    isContainer: (el) => !!el?.classList.contains('dragula-container') || !!el?.classList.contains('dragula-source-container'),
    // Whitelist (only "element"/"template" direct children are draggable),
    // not a "!== container" blacklist - BlockContainer's selector tab
    // button is also a direct child of a .dragula-container div, and it
    // must never be picked up as a drag source.
    moves: (el) => {
      const type = el?.getAttribute('data-type')
      return type === 'element' || type === 'template'
    },
    accepts: (el, target, source) => {
      if (!el || !target) return false
      // The palette is a fixed menu, never a real drop target.
      if (target.classList.contains('dragula-source-container')) return false
      // Same-container drops are allowed: the drop handler resolves the
      // exact DOM drop index, so this is how in-place sibling reordering
      // works (both on the canvas and in the document tree). Rejecting
      // target === source here - as it used to - silently disabled every
      // same-parent reorder attempt.
      const type = el.getAttribute('data-type')
      return type === 'element' || type === 'template'
    },
    // Items dragged out of the palette are copied - the original stays put
    // (it's a menu, not inventory) - while real elements dragged between
    // real containers are moved, same as before.
    copy: (_el, source) => !!source?.classList.contains('dragula-source-container'),
  })

  drake.on('drop', (el, target) => {
    if (!editor.document || !target) return

    // Where in the target's children did the drop actually land? Count
    // only real node rows (data-type="element") - BlockContainer's own
    // absolute tag badges are also DOM children of the container element
    // but must never count as positions. The index is read BEFORE the
    // undo below (after removing the dragged element from the DOM the
    // lookup would be pointless), and it's what makes precise-position
    // drops work: the document tree's rows and the canvas's nodes both
    // land at the exact spot the mouse left them, including when the
    // source and target are the same container (sibling reordering).
    const siblings = Array.from(target.children).filter((c) => c.getAttribute('data-type') === 'element')
    const dropIndex = siblings.indexOf(el as HTMLElement)

    // Undo dragula's own DOM move/copy first - see file header comment.
    // Vue's reactive re-render (triggered by the state mutation below) is
    // what actually determines the element's final DOM position.
    if (el.parentNode === target) target.removeChild(el)

    const targetId = target.getAttribute('data-id')
    if (!targetId) return
    const targetNode = findNodeById(editor.document, targetId)
    if (!targetNode) return

    const insertAt = (node: WhoobeElement) => {
      targetNode.blocks.splice(dropIndex >= 0 ? Math.min(dropIndex, targetNode.blocks.length) : targetNode.blocks.length, 0, node)
    }

    const snippetId = el.getAttribute('data-snippet-id')
    if (snippetId) {
      // Same idea as the templateName branch below: construct a brand new
      // node, never reuse the stored one directly - cloneWithFreshIds()
      // regenerates every id in the subtree, so dropping the same snippet
      // twice (or reusing one that's already elsewhere in the document)
      // never collides on id with another instance of it.
      const snippet = snippetsStore.items.find((s) => s.id === snippetId)
      if (!snippet) return
      const created = cloneWithFreshIds(snippet.node) as WhoobeElement
      insertAt(created)
      editor.setCurrent(created)
      flash(`Added "${snippet.name}"`)
      return
    }

    const templateName = el.getAttribute('data-template')
    if (templateName) {
      // A palette drag: construct a brand new node rather than moving an
      // existing one.
      //
      // A real bug, fixed here: createElement()'s second argument isn't a
      // generic "options" object for every builder - ElementsClass.js's
      // own dispatcher forwards it as-is to whichever builder matches
      // (`this.Heading(options)`, `this.Flexbox(options)`, ...), and
      // Heading(level=1) expects that argument to literally BE the level
      // number (its only real source-repo call site, helpers/Heading.vue,
      // passes `this.level` directly - never an options object). Always
      // passing `{}` here (as this used to) meant Heading's own default
      // parameter never kicked in (defaults only apply to `undefined`,
      // not `{}`) - `this.level` became the object `{}` itself, and
      // `component`'s `'h' + el.level` computed the literal string
      // "h[object Object]", which the browser then rejects as an invalid
      // tag name. Only Flexbox actually needs an options object passed at
      // all; every other builder either ignores the second argument
      // entirely or, like Heading, needs it to be genuinely absent so its
      // own default takes over.
      const created =
        templateName === 'Flexbox'
          ? new Element().createElement(templateName, { direction: 'col' })
          : new Element().createElement(templateName)
      if (!created) return
      created.css.css = clean(created.css.css)
      applyImagePlaceholder(created)
      insertAt(created)
      editor.setCurrent(created)
      flash(`Added ${templateName}`)
      return
    }

    const id = el.getAttribute('data-id')
    if (!id) return
    const node = findNodeById(editor.document, id)
    if (!node) return
    // Dropping a container into itself or one of its own descendants
    // detaches that whole subtree from the document (the target lives
    // inside the moved node) and it silently disappears from canvas and
    // tree alike - the "element vanished after a drag" bug. The tree made
    // this easy to hit (rows are small, a container's own rows and its
    // children's rows sit right next to each other), so it's guarded here
    // for both surfaces.
    if (targetId === id || findNodeById(node, targetId)) {
      flash('Cannot drop an element into itself')
      return
    }
    const removed = removeNodeById(editor.document, id)
    if (!removed) return // the document root itself (no parent) - never re-parent it
    insertAt(removed)
    editorBus.emit('editorMessage', 'Block moved')
    flash('Moved')
  })
})

// Dragging a field chip from GatewayPanel.vue's sidebar tab onto a block on
// the canvas - a separate, native HTML5 drag (see gateway-drag.ts) from the
// dragula-driven element/snippet drag above, since this isn't an "insert at
// this position" drop but a "bind this field to whatever element is under
// the cursor" one. Resolves the nearest ancestor with a data-id (every
// BlockContainer.vue instance sets one on its own root) rather than
// requiring a drop exactly on the element's own outer edge.
function onGatewayFieldDragOver(event: DragEvent) {
  if (!event.dataTransfer?.types.includes(GATEWAY_FIELD_DRAG_MIME_TYPE)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}

function onGatewayFieldDrop(event: DragEvent) {
  const raw = event.dataTransfer?.getData(GATEWAY_FIELD_DRAG_MIME_TYPE)
  if (!raw || !editor.document) return
  event.preventDefault()

  const targetEl = (event.target as HTMLElement | null)?.closest('[data-id]')
  const targetId = targetEl?.getAttribute('data-id')
  if (!targetId) return
  const targetNode = findNodeById(editor.document, targetId)
  if (!targetNode) return

  let payload: GatewayFieldDragPayload
  try {
    payload = JSON.parse(raw)
  } catch {
    return
  }

  ;(targetNode as any).gatewayBinding = { endpointName: payload.endpointName, routePath: payload.routePath, fieldPath: payload.fieldPath, params: null, transform: null }
  editor.setCurrent(targetNode)
  flash(`Bound to ${payload.endpointName}${payload.fieldPath ? '.' + payload.fieldPath : ''}`)
}

// Data binding preview in the editor canvas: whenever the document's set of
// data bindings changes (a binding added/edited/removed, or a new page
// loaded), re-resolve them and store results in editor.resolvedData so the
// editing canvas shows real data object values instead of only the
// {Class.field} placeholder. Tracks a signature of all bindings (not the
// node tree) so normal text edits don't trigger refetches.
const bindingSignature = computed(() => {
  if (!editor.document) return ''
  const parts: string[] = []
  const walk = (node: any) => {
    if (node?.dataBinding) parts.push(`${node.id}:${JSON.stringify(node.dataBinding)}`)
    if (node?.gatewayBinding) parts.push(`${node.id}:${JSON.stringify(node.gatewayBinding)}`)
    for (const child of node?.blocks ?? []) walk(child)
  }
  walk(editor.document)
  return parts.join('|')
})

watch(bindingSignature, async () => {
  if (editor.document) await resolveDocumentData(editor.document)
}, { immediate: true })
</script>

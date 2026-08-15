// Pinia port of whoobe-one-studio's store/modules/editor.js - a flat,
// mechanical port (confirmed in the port plan §1.4: one mutation + one
// action per state key, no cross-module access, no async actions). Pinia
// collapses the mutation/action split into a single setter per field,
// since Pinia doesn't need Vuex's two-layer indirection (direct state
// mutation is idiomatic here, not an anti-pattern the way it would be in
// Vuex without going through a mutation).
//
// One rename, not optional: the source has a `export` state field -
// `export` is a reserved word and cannot be used as a variable/property
// identifier in a `const { export } = ...`/destructure or `ref()` binding
// here, so it's `exportMode` instead. Every other field name is unchanged.
//
// `page`/`project`/`selected`/`component`/`article`/`customizeTab` are
// typed loosely (`any`) for now - their real shapes (Block from
// BlocksClass.js, tw.groups.js's group config objects, etc.) aren't
// exercised by anything yet in this spike; tightening these is Phase 3/4
// work, once save/page and the Tailwind customizer are actually wired up.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type Element from '../scripts/ElementsClass.js'
import type { ElementGroup } from '../scripts/ElementsClass.js'

type WhoobeElement = InstanceType<typeof Element>

export const useEditorStore = defineStore('editor', () => {
  const mode = ref<string>('templates')
  const settings = ref<any>(null)
  const elements = ref<ElementGroup[] | null>(null)
  const document = ref<WhoobeElement | null>(null)
  const project = ref<any>(null)
  const selected = ref<any>(null)
  const page = ref<any>(null)
  const current = ref<WhoobeElement | null>(null)
  const component = ref<any>(null)
  const action = ref<string | null>(null)
  const subaction = ref<string | null>(null)
  const level = ref<number | null>(null)
  const parent = ref<WhoobeElement | null>(null)
  const startTime = ref<number | null>(null)
  const autosave = ref<any>(null)
  const exportMode = ref<string>('single')
  const preview = ref<boolean | string>(false)
  const fonts = ref<string[]>((import.meta.env.VITE_FONT_FAMILIES ?? '').split('|'))
  const save = ref<boolean>(true)
  const article = ref<any>(null)
  const customizeTab = ref<any>(null)

  // Not from the source - the CMS integration plan's embedding contract
  // (docs/plans/cms/whoobe-one-editor-integration-plan.md §6): a
  // `parentOrigin` query param on `/editor` means this is running inside
  // an <iframe> (apps/admin-dashboard's own WhoobeOneEmbed.vue), not the
  // standalone app - set once at startup (views/Editor.vue), read by
  // BlockEditor.vue to hide standalone-only chrome (its own branding, the
  // Templates gallery entry point - redundant once pages are reached from
  // the host's own nav instead). `parentOrigin` itself isn't validated or
  // used for any postMessage security check the way whoobe-studio's own
  // bridge needs it - nothing is exchanged bidirectionally here that would
  // need origin verification (see §6 point 3), it's kept only in case a
  // future need for it arises.
  const embedded = ref<boolean>(false)
  const parentOrigin = ref<string | null>(null)

  // Not from the source - mail template editing (docs/plans/forms/mail-
  // templates.md): set when /editor is opened with a `mailTemplateId` query
  // param (loadMailTemplate() also sets it), so the editor's Save writes to
  // mail_templates instead of whoobe_pages. Null while editing a regular
  // page or a fresh/demo document.
  const mailTemplateId = ref<string | null>(null)

  // Not from the source - snippet editing (admin-dashboard's Snippets main
  // item): set when /editor is opened with a `snippetId`/`snippetNew` query
  // param, so Save writes to whoobe_one_snippets. `snippetId` is the
  // snippet being edited (null for a brand-new one), `snippetMode` is the
  // mode flag (new or existing).
  const snippetId = ref<string | null>(null)
  const snippetMode = ref<boolean>(false)

  // Populated by data-resolver.ts at preview/render time - maps element ids
  // to their resolved data object records (DataObjectRecord or
  // DataObjectRecord[] for collection bindings). Cleared at the start of
  // each resolution pass.
  const resolvedData = ref<Record<string, any>>({})

  // Not from the source - a pure editor-session convenience (FloatingToolbar.
  // vue's "Hide content" button): ids of elements collapsed down to a small
  // tag-name chip in the canvas, so a layered/absolutely-positioned element
  // (e.g. a dropdown panel) can be gotten out of the way of whatever it's
  // covering while editing siblings underneath it. Deliberately NOT a field
  // on the Element itself - it has nothing to do with the page's actual
  // content (nothing reads it in BlockContainerPreview.vue/BlockElementPreview.
  // vue), same category as which sidebar accordion group is open, so it's
  // never saved/loaded with the document and always starts empty on a fresh
  // page load. A plain `ref<Set<string>>` (Vue 3 deep-wraps Set/Map objects
  // via reactive(), so .add()/.delete() mutations are reactive without any
  // manual reassignment) - no existing per-id UI-state precedent elsewhere
  // in this app to follow instead.
  const collapsedIds = ref<Set<string>>(new Set())

  function setMode(v: string) { mode.value = v }
  function setSettings(v: any) { settings.value = v }
  function setElements(v: ElementGroup[] | null) { elements.value = v }
  function setDocument(v: WhoobeElement | null) { document.value = v }
  function setProject(v: any) { project.value = v }
  function setSelected(v: any) { selected.value = v }
  function setPage(v: any) { page.value = v }
  function setCurrent(v: WhoobeElement | null) { current.value = v }
  function setComponent(v: any) { component.value = v }
  function setAction(v: string | null) { action.value = v }
  function setSubAction(v: string | null) { subaction.value = v }
  function setLevel(v: number | null) { level.value = v }
  function setParent(v: WhoobeElement | null) { parent.value = v }
  function setStartTime(v: number | null) { startTime.value = v }
  function setAutosave(v: any) { autosave.value = v }
  function setExportMode(v: string) { exportMode.value = v }
  function setPreview(v: boolean | string) { preview.value = v }
  function setSave(v: boolean) { save.value = v }
  function setArticle(v: any) { article.value = v }
  function setCustomizeTab(v: any) { customizeTab.value = v }
  function setEmbedded(v: boolean, origin: string | null = null) {
    embedded.value = v
    parentOrigin.value = origin
  }
  function setMailTemplateId(v: string | null) {
    mailTemplateId.value = v
  }
  function setSnippetId(v: string | null) {
    snippetId.value = v
    snippetMode.value = v !== null
  }
  function setSnippetMode(v: boolean) {
    snippetMode.value = v
    if (!v) snippetId.value = null
  }
  function toggleCollapsed(id: string) {
    if (collapsedIds.value.has(id)) collapsedIds.value.delete(id)
    else collapsedIds.value.add(id)
  }
  function isCollapsed(id: string): boolean {
    return collapsedIds.value.has(id)
  }

  return {
    mode, settings, elements, document, project, selected, page, current,
    component, action, subaction, level, parent, startTime, autosave,
    exportMode, preview, fonts, save, article, customizeTab, embedded, parentOrigin,
    mailTemplateId, snippetId, snippetMode,
    setMode, setSettings, setElements, setDocument, setProject, setSelected,
    setPage, setCurrent, setComponent, setAction, setSubAction, setLevel,
    setParent, setStartTime, setAutosave, setExportMode, setPreview, setSave,
    setArticle, setCustomizeTab, setEmbedded, setMailTemplateId, setSnippetId, setSnippetMode, resolvedData,
    collapsedIds, toggleCollapsed, isCollapsed,
  }
})

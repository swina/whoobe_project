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
import type { AlpinePreset } from '../alpine-presets-api'

type WhoobeElement = InstanceType<typeof Element>

const AUTOSAVE_KEY = 'whoobe:autosave'

function loadAutosaveConfig(): { enabled: boolean; interval: number } {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { enabled: false, interval: 60 }
}

// Whether this browser has ever saved its own autosave preference (via
// EditorSettingsModal). Computed once at store init, before setAutosaveDefault
// may run — used to avoid a fetched org-wide default clobbering a user's own
// per-browser override (see setAutosaveDefault below).
function hasStoredAutosaveConfig(): boolean {
  try {
    return localStorage.getItem(AUTOSAVE_KEY) !== null
  } catch {
    return false
  }
}

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
  const autosave = ref<{ enabled: boolean; interval: number }>(loadAutosaveConfig())
  const autosaveHasLocalOverride = ref<boolean>(hasStoredAutosaveConfig())
  // Settings > General "Remove HTML Comments in Page Preview" - org-wide,
  // fetched from core-api on route mount (Editor.vue/PublicPage.vue), no
  // per-browser override (unlike autosave). Defaults off so existing
  // previews render unchanged until an admin opts in.
  const stripHtmlComments = ref<boolean>(false)

  // Catalog of named Alpine directive sets (AlpineJS > Presets), loaded from core-api when the editor opens.
  const alpinePresets = ref<AlpinePreset[]>([])
  const exportMode = ref<string>('single')
  const preview = ref<boolean | string>(false)
  const fonts = ref<string[]>((import.meta.env.VITE_FONT_FAMILIES ?? '').split('|').filter(Boolean))
  // Faces of the custom fonts (Settings > Custom fonts) whose file can be read; their families are also in `fonts`, so every font list offers them.
  const customFonts = ref<{ family: string; weight: number; style: string; url: string }[]>([])
  const save = ref<boolean>(true)
  const article = ref<any>(null)
  const customizeTab = ref<any>(null)

  // Website-level theme (from websites.settings.theme) — set when a page or
  // snippet is loaded that belongs to a website. Acts as the base theme;
  // the per-page theme (document.theme) overrides it when present. Managed
  // via the Theme modal which can save back to the website.
  const websiteTheme = ref<{ colors: { name: string; hex: string }[]; fonts: string[]; styles: string; tailwindClasses: string }>({ colors: [], fonts: [], styles: '', tailwindClasses: '' })

  // The current page's website-template body slot (className/style) -
  // fetched via database-actions.ts's loadPageTemplateBody() when a page
  // belonging to a website loads. Null when the page has no website or no
  // template resolves. Consumed by BlockContainer.vue/BlockContainerPreview.
  // vue as the default canvas background, so the editor matches the live
  // site's body wrapper (WebsiteTemplateLayout.body) unless a page overrides
  // it via document.canvasBackground.
  const templateBody = ref<{ className: string; style: string } | null>(null)

  // All available themes for the current website (multiple named themes).
  const websiteThemes = ref<{ id: string; name: string; colors: { name: string; hex: string }[]; fonts: string[]; styles: string; tailwindClasses: string }[]>([])

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
// Editing one template of a user's kit (/editor?kitId=&templateId=): Save writes it back into the kit, not a page or a snippet.
const kitTemplate = ref<{ kitId: string; templateId: string; kitName: string } | null>(null)
const snippetMode = ref<boolean>(false)
// The snippet being edited is locked: the editor's autosave does not save it (manual Save does).
const snippetLocked = ref<boolean>(false)
const pageThemeId = ref<string | null>(null)
const websiteId = ref<string | null>(null)
const locale = ref<string>('en')

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

  // PWA / App Mode — when active, the canvas constrains to mobile
  // breakpoints and PWA-specific features become available.
  const appMode = ref<boolean>(false)
  const pwaConfig = ref<Record<string, unknown>>({})

  function setAppMode(v: boolean) { appMode.value = v }
  function setPwaConfig(v: Record<string, unknown>) { pwaConfig.value = v }

  // Default image placeholder — a DAM asset pimcorePath, fetched from the
  // backend on editor init and used by applyImagePlaceholder() (helpers.ts)
  // as a real image placeholder instead of the hardcoded SVG data URI.
  const defaultPlaceholderUrl = ref<string | null>(null)

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
  function setAutosave(v: { enabled: boolean; interval: number }) {
  autosave.value = v
  autosaveHasLocalOverride.value = true
  try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(v)) } catch { /* ignore */ }
}
  // Applies the org-wide autosave default fetched from core-api. Only takes
  // effect when the user hasn't already saved their own preference in this
  // browser via setAutosave/EditorSettingsModal - a local override always wins.
  function setAutosaveDefault(v: { enabled: boolean; interval: number }) {
    if (autosaveHasLocalOverride.value) return
    autosave.value = v
  }
  function setStripHtmlComments(v: boolean) {
    stripHtmlComments.value = v
  }
  function setAlpinePresets(v: AlpinePreset[]) { alpinePresets.value = v }
  function setCustomFonts(v: { family: string; weight: number; style: string; url: string }[]) {
    customFonts.value = v
    for (const f of v) {
      const key = f.family.trim().replace(/\s+/g, '+')
      if (!fonts.value.includes(key)) fonts.value.push(key)
    }
  }
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
  function setPageThemeId(v: string | null) { pageThemeId.value = v }
  function setSnippetId(v: string | null) {
    snippetId.value = v
    snippetMode.value = v !== null
    if (v === null) snippetLocked.value = false
  }
  function setKitTemplate(v: { kitId: string; templateId: string; kitName: string } | null) { kitTemplate.value = v }
  function setSnippetLocked(v: boolean) { snippetLocked.value = v }
  function setSnippetMode(v: boolean) {
    snippetMode.value = v
    if (!v) { snippetId.value = null; snippetLocked.value = false }
  }
  function setWebsiteId(v: string | null) { websiteId.value = v }
  function setLocale(v: string) { locale.value = v }
  function toggleCollapsed(id: string) {
    if (collapsedIds.value.has(id)) collapsedIds.value.delete(id)
    else collapsedIds.value.add(id)
  }
  function isCollapsed(id: string): boolean {
    return collapsedIds.value.has(id)
  }
  function setWebsiteTheme(v: { colors: { name: string; hex: string }[]; fonts: string[]; styles?: string; tailwindClasses?: string }) {
    websiteTheme.value = { colors: v.colors, fonts: v.fonts, styles: v.styles ?? '', tailwindClasses: v.tailwindClasses ?? '' }
  }
  function setTemplateBody(v: { className: string; style: string } | null) { templateBody.value = v }
  function setWebsiteThemes(v: { id: string; name: string; colors: { name: string; hex: string }[]; fonts: string[]; styles?: string; tailwindClasses?: string }[]) {
    websiteThemes.value = v.map((t) => ({ ...t, styles: t.styles ?? '', tailwindClasses: t.tailwindClasses ?? '' }))
  }

  function setDefaultPlaceholderUrl(v: string | null) {
    defaultPlaceholderUrl.value = v
  }

  return {
    mode, settings, elements, document, project, selected, page, current,
    component, action, subaction, level, parent, startTime, autosave, stripHtmlComments, alpinePresets,
    exportMode, preview, fonts, customFonts, setCustomFonts, save, article, customizeTab, embedded, parentOrigin,
    mailTemplateId, snippetId, kitTemplate, setKitTemplate, snippetMode, snippetLocked, pageThemeId, websiteId, locale, websiteTheme, websiteThemes, templateBody,
    defaultPlaceholderUrl,
    appMode, pwaConfig,
    setMode, setSettings, setElements, setDocument, setProject, setSelected,
    setPage, setCurrent, setComponent, setAction, setSubAction, setLevel,
    setParent, setStartTime, setAutosave, setAutosaveDefault, setStripHtmlComments, setAlpinePresets, setExportMode, setPreview, setSave,
    setArticle, setCustomizeTab, setEmbedded, setMailTemplateId, setPageThemeId, setSnippetId, setSnippetMode, setSnippetLocked, resolvedData,
    collapsedIds, toggleCollapsed, isCollapsed, setWebsiteTheme, setWebsiteThemes, setTemplateBody, setWebsiteId, setLocale,
    setDefaultPlaceholderUrl,
    setAppMode, setPwaConfig,
  }
})

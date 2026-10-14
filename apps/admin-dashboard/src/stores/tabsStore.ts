import { defineStore } from 'pinia'
import { ref } from 'vue'

// Global main-tab system (Pimcore-style): the sidebar's sections (Overview,
// Data Objects, Assets, Documents, Settings) and any opened master item
// (an asset or document, and later a data object) each get exactly one tab
// in a single flat strip. Item-specific views (an asset's Preview/Editor/
// Metadata, a document's Editor/Preview) are NOT separate main tabs - they
// are a sub-tab subsystem nested inside that one master-item tab (see
// MasterAssetTab.vue/MasterDocumentTab.vue). A document tab opens straight
// into its Editor sub-tab (Whoobe Studio, embedded inline - not a modal),
// with Preview (the read-only rendered HTML) as a second sub-tab, mirroring
// how an asset opens into Preview with Edit Image as a sibling sub-tab.

export type SectionKind = 'overview' | 'ai' | 'websites' | 'objects' | 'assets' | 'documents' | 'pages' | 'snippets' | 'components' | 'mail' | 'themes' | 'settings' | 'gateway' | 'gateway-plugins' | 'api-clients' | 'data-bindings' | 'automations' | 'system-logs' | 'publish'
export type MasterItemKind = 'asset' | 'document' | 'page' | 'snippet' | 'object' | 'class' | 'classList' | 'website' | 'docsSite' | 'docsDoc' | 'apiClient' | 'integrationImport'
// The AI section of the navigation (its own sidebar entry, no longer part of Settings): one card per kind of AI provider.
export type AiSubSection = 'text' | 'image' | 'translate'
export type DocsSiteSubTab = 'documents' | 'index' | 'publish' | 'settings'
export type AssetSubTab = 'preview' | 'editor' | 'metadata' | 'thumbnails'
export type DocumentSubTab = 'editor' | 'preview'
export type PageSubTab = 'editor' | 'settings' | 'preview'
export type WebsiteSubTab = 'settings' | 'paths' | 'templates'
// A fixed, known-upfront set (docs/plans/UI/settings-ui-plan.md) - unlike
// objectSubTab's free-form string (which varies per class's locales),
// this is a real enum, matching AssetSubTab/DocumentSubTab's own pattern.
export type SettingsSubSection = 'general' | 'dam' | 'classes' | 'roles' | 'security' | 'workflows' | 'figma' | 'pwa' | 'uploads'

export interface MainTab {
  id: string
  type: 'section' | 'item'
  section?: SectionKind
  itemKind?: MasterItemKind
  itemId?: string
  assetSubTab?: AssetSubTab
  documentSubTab?: DocumentSubTab
  pageSubTab?: PageSubTab
  // Page / snippet tab opened from the Automations list: the form to select once the editor has loaded it (editor `?elementId=`).
  elementId?: string
  websiteSubTab?: WebsiteSubTab
  // A Data Object tab's sub-tab is a *locale*, not a fixed enum like
  // assets/documents use - see openObject()'s own comment for why the
  // tab itself is keyed by translationGroupId, not one locale row's id.
  objectSubTab?: string
  // Which card the collapsible Settings submenu (DashboardLayout.vue's
  // sidebar) currently has selected - only meaningful when
  // `section === 'settings'`. Defaults to 'general' the first time the
  // Settings tab is opened (openSection('settings') below).
  settingsSubSection?: SettingsSubSection
  // Which card the AI section shows (sidebar submenu), only meaningful when `section === 'ai'`.
  aiSubSection?: AiSubSection
  // The owning data class, captured at open time - MasterObjectTab.vue
  // needs it as a prop and can't reliably derive it from a shared list
  // store (same reasoning as `label` below: the record may be brand new,
  // or the list's class filter may have moved on while this tab stayed
  // open).
  objectClassId?: string
  // The class whose objects this classList tab shows.
  classListClassId?: string
  // Set by the owning master-tab component once it knows a real label to
  // show (MasterObjectTab.vue's own key, once loaded/created) - other
  // item kinds derive their label from a shared store instead
  // (DashboardLayout.vue's own tabLabel()), which doesn't work for a
  // brand-new Data Object that isn't in any shared list yet.
  label?: string
  // Only meaningful when itemKind === 'page' && pageSubTab === 'preview' -
  // set by openPagePreview() below when a list-to-detail link (clicked
  // inside the embedded whoobe-one-spike editor's own Preview) asks this
  // page's Preview sub-tab to show one specific resolved record, rather
  // than the page's own static slug (PagePreviewTab.vue's default).
  pagePreviewPath?: string
  pagePreviewLocale?: string
  // Documentation sites (docs/plans/docs-sites/docs-site-plan.md): `docsSite` is a site's manager (its documents, index, publishing,
  // settings), `docsDoc` one document's editor - both keyed by the website; a document by its path in the source folder too.
  docsSubTab?: DocsSiteSubTab
  docsPath?: string
  /** A document that does not exist yet: the text to start from. */
  docsInitialText?: string
  /** Unsaved changes: closing the tab asks first. Set by the tab's own component. */
  dirty?: boolean
}

export function sectionTabId(section: SectionKind): string {
  return `section:${section}`
}

export function assetTabId(assetId: string): string {
  return `item:asset:${assetId}`
}

export function documentTabId(documentId: string): string {
  return `item:document:${documentId}`
}

export function pageTabId(pageId: string): string {
  return `item:page:${pageId}`
}

export function snippetTabId(snippetId: string): string {
  return `item:snippet:${snippetId}`
}

export function objectTabId(translationGroupId: string): string {
  return `item:object:${translationGroupId}`
}

export function classTabId(classId: string): string {
  return `item:class:${classId}`
}

export function websiteTabId(websiteId: string): string {
  return `item:website:${websiteId}`
}

export function apiClientTabId(clientId: string): string {
  return `item:apiClient:${clientId}`
}

export function docsSiteTabId(websiteId: string): string {
  return `item:docsSite:${websiteId}`
}

export function docsDocTabId(websiteId: string, path: string): string {
  return `item:docsDoc:${websiteId}:${path}`
}

export function classListTabId(classId: string): string {
  return `item:classList:${classId}`
}

export const useTabsStore = defineStore('tabs', () => {
  // No hardcoded default tab - the app starts with zero tabs open, and
  // DashboardLayout.vue renders OverviewView directly (not as a tab) as the
  // fallback for that empty state. The Overview sidebar menu item is
  // hidden for the same reason: there's nothing to "open" it into, it's
  // just what you see until you open something.
  const tabs = ref<MainTab[]>([])
  const activeTabId = ref<string | null>(null)

  function findIndex(id: string): number {
    return tabs.value.findIndex((t) => t.id === id)
  }

  // The website the Publish tab shows; set by "Publish" in the websites list before it opens the tab.
  const publishWebsiteId = ref<string | null>(null)
  function openPublish(websiteId?: string) {
    if (websiteId) publishWebsiteId.value = websiteId
    openSection('publish')
  }

  function openSection(section: SectionKind) {
    const id = sectionTabId(section)
    if (findIndex(id) === -1) {
      tabs.value.push({ id, type: 'section', section, settingsSubSection: section === 'settings' ? 'general' : undefined, aiSubSection: section === 'ai' ? 'text' : undefined })
    }
    activeTabId.value = id
  }

  // Opens (or focuses) the Settings tab and selects one card in its
  // collapsible submenu - the sidebar's own equivalent of
  // handleSelectSidebarFolder() for the Assets folder tree.
  function openSettingsSubSection(subSection: SettingsSubSection) {
    openSection('settings')
    const tab = tabs.value.find((t) => t.id === sectionTabId('settings'))
    if (tab) tab.settingsSubSection = subSection
  }

  // Opens (or focuses) the AI tab and selects one of its cards - the sidebar's AI submenu.
  function openAiSubSection(subSection: AiSubSection) {
    openSection('ai')
    const tab = tabs.value.find((t) => t.id === sectionTabId('ai'))
    if (tab) tab.aiSubSection = subSection
  }

  function openAsset(assetId: string) {
    const id = assetTabId(assetId)
    if (findIndex(id) === -1) {
      tabs.value.push({ id, type: 'item', itemKind: 'asset', itemId: assetId, assetSubTab: 'preview' })
    }
    activeTabId.value = id
  }

  function setAssetSubTab(assetId: string, subTab: AssetSubTab) {
    const tab = tabs.value.find((t) => t.id === assetTabId(assetId))
    if (tab) tab.assetSubTab = subTab
  }

  function openDocument(documentId: string) {
    const id = documentTabId(documentId)
    if (findIndex(id) === -1) {
      tabs.value.push({ id, type: 'item', itemKind: 'document', itemId: documentId, documentSubTab: 'editor' })
    }
    activeTabId.value = id
  }

  function setDocumentSubTab(documentId: string, subTab: DocumentSubTab) {
    const tab = tabs.value.find((t) => t.id === documentTabId(documentId))
    if (tab) tab.documentSubTab = subTab
  }

  // No sub-tab state here (unlike documents) - MasterPageTab.vue wraps a
  // single embedded whoobe-one-spike editor with no Editor/Preview toggle
  // of its own (the embedded app already has its own Preview mode inline).
  function openPage(pageId: string, subTab?: PageSubTab, elementId?: string) {
    const id = pageTabId(pageId)
    // an already open tab is only focused: its editor is loaded and may hold unsaved work, so `elementId` applies to a new tab
    if (findIndex(id) === -1) {
      tabs.value.push({ id, type: 'item', itemKind: 'page', itemId: pageId, pageSubTab: subTab ?? 'editor', elementId })
    }
    activeTabId.value = id
  }

  function setPageSubTab(pageId: string, subTab: PageSubTab) {
    const tab = tabs.value.find((t) => t.id === pageTabId(pageId))
    if (tab) tab.pageSubTab = subTab
  }

  // Opens (or focuses) a whoobe snippet's editor tab - the embedded
  // whoobe-one-spike editor pointed at /editor?snippetId=.
  function openSnippet(snippetId: string, elementId?: string) {
    const id = snippetTabId(snippetId)
    if (findIndex(id) === -1) {
      tabs.value.push({ id, type: 'item', itemKind: 'snippet', itemId: snippetId, elementId })
    }
    activeTabId.value = id
  }

  // Opens (or focuses) a page's tab directly on its Preview sub-tab,
  // targeted at one specific resolved record - the receiving end of the
  // postMessage a list-to-detail link posts from inside the embedded
  // whoobe-one-spike editor (see DashboardLayout.vue's message listener).
  // Reuses openPage()'s own dedup/focus logic as-is; clicking a second,
  // different record just overwrites pagePreviewPath/Locale on the same
  // tab rather than opening a duplicate.
  function openPagePreview(pageId: string, path: string, locale: string) {
    openPage(pageId, 'preview')
    const tab = tabs.value.find((t) => t.id === pageTabId(pageId))
    if (tab) {
      tab.pagePreviewPath = path
      tab.pagePreviewLocale = locale
    }
  }

  // A Data Object tab represents one *logical record* (`translationGroupId`),
  // not one locale row's own id - Pimcore-imported multi-locale records
  // (same translationGroupId, one row per language) are "the same record"
  // per docs/plans/datamodel/data-objects-views-editing.md, so opening
  // any one locale row opens the whole group as a single tab, with each
  // locale as a sub-tab inside it (MasterObjectTab.vue). A brand-new,
  // not-yet-saved object uses a client-generated placeholder id here
  // (still just a string) - MasterObjectTab.vue tracks its own real
  // backend ids internally once created, the tab itself never needs to
  // be re-keyed.
  function openObject(translationGroupId: string, classId: string, initialLocale: string) {
    const id = objectTabId(translationGroupId)
    const existing = tabs.value.find((t) => t.id === id)
    if (existing) {
      existing.objectSubTab = initialLocale
    } else {
      tabs.value.push({ id, type: 'item', itemKind: 'object', itemId: translationGroupId, objectClassId: classId, objectSubTab: initialLocale })
    }
    activeTabId.value = id
  }

  function setObjectSubTab(translationGroupId: string, locale: string) {
    const tab = tabs.value.find((t) => t.id === objectTabId(translationGroupId))
    if (tab) tab.objectSubTab = locale
  }

  // A class's own editor (name/label/Fields/View Layout) opens as a real
  // tab, not the inline expand-in-place list it used to be - matching
  // openObject()'s own placeholder-id convention: ClassSettingsCard.vue's
  // "+ New class" mints a client-side `new:<uuid>` id for a not-yet-saved
  // class, same as ObjectsView.vue's handleCreate() does for objects.
  function openClass(classId: string) {
    const id = classTabId(classId)
    if (findIndex(id) === -1) {
      tabs.value.push({ id, type: 'item', itemKind: 'class', itemId: classId })
    }
    activeTabId.value = id
  }

  function closeClassTab(classId: string) {
    closeTab(classTabId(classId))
  }

  // Opens (or focuses) a tab showing objects filtered to one class - each
  // class gets its own tab so users can keep multiple class lists open.
  function openClassList(classId: string, className: string) {
    const id = classListTabId(classId)
    if (findIndex(id) === -1) {
      tabs.value.push({ id, type: 'item', itemKind: 'classList', classListClassId: classId, label: className })
    }
    activeTabId.value = id
  }

  function closeClassListTab(classId: string) {
    closeTab(classListTabId(classId))
  }

  function openWebsite(websiteId: string, subTab: WebsiteSubTab = 'settings') {
    const id = websiteTabId(websiteId)
    if (findIndex(id) === -1) {
      tabs.value.push({ id, type: 'item', itemKind: 'website', itemId: websiteId, websiteSubTab: subTab })
    }
    activeTabId.value = id
  }

  function setWebsiteSubTab(websiteId: string, subTab: WebsiteSubTab) {
    const tab = tabs.value.find((t) => t.id === websiteTabId(websiteId))
    if (tab) tab.websiteSubTab = subTab
  }

  function closeWebsiteTab(websiteId: string) {
    closeTab(websiteTabId(websiteId))
  }

  // An API client's editor: `clientId` is the client's id, or `new:<uuid>` for one that does not exist yet.
  // `apiClientsRevision` goes up whenever a client is saved, so the list refreshes itself.
  const apiClientsRevision = ref(0)
  // The "Integration import" tab (a class made from what an Integration route returns): one at a time.
  function openIntegrationImport() {
    const id = 'item:integrationImport'
    if (findIndex(id) === -1) tabs.value.push({ id, type: 'item', itemKind: 'integrationImport', itemId: 'integrationImport' })
    activeTabId.value = id
  }

  function openApiClient(clientId?: string) {
    const itemId = clientId ?? `new:${crypto.randomUUID()}`
    const id = apiClientTabId(itemId)
    if (findIndex(id) === -1) tabs.value.push({ id, type: 'item', itemKind: 'apiClient', itemId })
    activeTabId.value = id
  }

  function openDocsSite(websiteId: string, subTab: DocsSiteSubTab = 'documents') {
    const id = docsSiteTabId(websiteId)
    const existing = tabs.value.find((t) => t.id === id)
    if (existing) existing.docsSubTab = subTab
    else tabs.value.push({ id, type: 'item', itemKind: 'docsSite', itemId: websiteId, docsSubTab: subTab })
    activeTabId.value = id
  }

  function setDocsSubTab(websiteId: string, subTab: DocsSiteSubTab) {
    const tab = tabs.value.find((t) => t.id === docsSiteTabId(websiteId))
    if (tab) tab.docsSubTab = subTab
  }

  /** A document of a documentation site opens in a tab of its own (one per document); `initialText` is for a document not saved yet. */
  function openDocsDocument(websiteId: string, path: string, initialText?: string) {
    const id = docsDocTabId(websiteId, path)
    if (findIndex(id) === -1) {
      tabs.value.push({ id, type: 'item', itemKind: 'docsDoc', itemId: websiteId, docsPath: path, docsInitialText: initialText })
    }
    activeTabId.value = id
  }

  /** Closes without asking (the document was deleted, or saved elsewhere). */
  function forceCloseDocsDocument(websiteId: string, path: string) {
    const id = docsDocTabId(websiteId, path)
    const tab = tabs.value.find((t) => t.id === id)
    if (tab) tab.dirty = false
    closeTab(id)
  }

  function setDirty(id: string, dirty: boolean) {
    const tab = tabs.value.find((t) => t.id === id)
    if (tab) tab.dirty = dirty
  }

  function setTabLabel(id: string, label: string) {
    const tab = tabs.value.find((t) => t.id === id)
    if (tab) tab.label = label
  }

  function closeTab(id: string) {
    const idx = findIndex(id)
    if (idx === -1) return
    if (tabs.value[idx].dirty && !confirm('This tab has unsaved changes. Close it and lose them?')) return
    tabs.value.splice(idx, 1)

    if (activeTabId.value !== id) return

    const fallback = tabs.value[idx - 1] || tabs.value[0]
    // No more tabs left - fall back to the empty state (DashboardLayout.vue
    // renders OverviewView directly for this), not a forced Overview tab.
    activeTabId.value = fallback ? fallback.id : null
  }

  function closeAllTabs() {
    if (tabs.value.some((t) => t.dirty) && !confirm('Some tabs have unsaved changes. Close them all and lose the changes?')) return
    tabs.value.splice(0, tabs.value.length)
    activeTabId.value = null
  }

  function closeOtherTabs(id: string) {
    if (tabs.value.some((t) => t.id !== id && t.dirty) && !confirm('Some tabs have unsaved changes. Close them and lose the changes?')) return
    const keep = tabs.value.filter((t) => t.id === id)
    tabs.value.splice(0, tabs.value.length, ...keep)
    activeTabId.value = id
  }

  function closeAssetTab(assetId: string) {
    closeTab(assetTabId(assetId))
  }

  function closeDocumentTab(documentId: string) {
    closeTab(documentTabId(documentId))
  }

  function closeObjectTab(translationGroupId: string) {
    closeTab(objectTabId(translationGroupId))
  }

  return {
    tabs,
    activeTabId,
    openSection, openPublish, publishWebsiteId,
    openSettingsSubSection,
    openAiSubSection,
    openAsset,
    setAssetSubTab,
    openDocument,
    setDocumentSubTab,
    openPage,
    setPageSubTab,
    openPagePreview,
    openSnippet,
    openObject,
    setObjectSubTab,
    openClass,
    setTabLabel,
    closeTab,
    openDocsSite,
    setDocsSubTab,
    openDocsDocument,
    forceCloseDocsDocument,
    setDirty,
    closeAllTabs,
    closeOtherTabs,
    closeAssetTab,
    closeDocumentTab,
    closeObjectTab,
    closeClassTab,
    openClassList,
    closeClassListTab,
    openApiClient, apiClientsRevision,
    openIntegrationImport,
    openWebsite,
    setWebsiteSubTab,
    closeWebsiteTab
  }
})

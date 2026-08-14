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

export type SectionKind = 'overview' | 'websites' | 'objects' | 'assets' | 'documents' | 'pages' | 'settings'
export type MasterItemKind = 'asset' | 'document' | 'page' | 'object' | 'class' | 'website'
export type AssetSubTab = 'preview' | 'editor' | 'metadata' | 'thumbnails'
export type DocumentSubTab = 'editor' | 'preview'
export type PageSubTab = 'editor' | 'settings' | 'preview'
export type WebsiteSubTab = 'settings' | 'paths'
// A fixed, known-upfront set (docs/plans/UI/settings-ui-plan.md) - unlike
// objectSubTab's free-form string (which varies per class's locales),
// this is a real enum, matching AssetSubTab/DocumentSubTab's own pattern.
export type SettingsSubSection = 'general' | 'dam' | 'classes' | 'components' | 'roles' | 'security' | 'workflows' | 'mail' | 'ai'

export interface MainTab {
  id: string
  type: 'section' | 'item'
  section?: SectionKind
  itemKind?: MasterItemKind
  itemId?: string
  assetSubTab?: AssetSubTab
  documentSubTab?: DocumentSubTab
  pageSubTab?: PageSubTab
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
  // The owning data class, captured at open time - MasterObjectTab.vue
  // needs it as a prop and can't reliably derive it from a shared list
  // store (same reasoning as `label` below: the record may be brand new,
  // or the list's class filter may have moved on while this tab stayed
  // open).
  objectClassId?: string
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

export function objectTabId(translationGroupId: string): string {
  return `item:object:${translationGroupId}`
}

export function classTabId(classId: string): string {
  return `item:class:${classId}`
}

export function websiteTabId(websiteId: string): string {
  return `item:website:${websiteId}`
}

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<MainTab[]>([{ id: sectionTabId('overview'), type: 'section', section: 'overview' }])
  const activeTabId = ref<string>(sectionTabId('overview'))

  function findIndex(id: string): number {
    return tabs.value.findIndex((t) => t.id === id)
  }

  function openSection(section: SectionKind) {
    const id = sectionTabId(section)
    if (findIndex(id) === -1) {
      tabs.value.push({ id, type: 'section', section, settingsSubSection: section === 'settings' ? 'general' : undefined })
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
  function openPage(pageId: string, subTab?: PageSubTab) {
    const id = pageTabId(pageId)
    if (findIndex(id) === -1) {
      tabs.value.push({ id, type: 'item', itemKind: 'page', itemId: pageId, pageSubTab: subTab ?? 'editor' })
    }
    activeTabId.value = id
  }

  function setPageSubTab(pageId: string, subTab: PageSubTab) {
    const tab = tabs.value.find((t) => t.id === pageTabId(pageId))
    if (tab) tab.pageSubTab = subTab
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

  function setTabLabel(id: string, label: string) {
    const tab = tabs.value.find((t) => t.id === id)
    if (tab) tab.label = label
  }

  function closeTab(id: string) {
    const idx = findIndex(id)
    if (idx === -1) return
    tabs.value.splice(idx, 1)

    if (activeTabId.value !== id) return

    const fallback = tabs.value[idx - 1] || tabs.value[0]
    if (fallback) {
      activeTabId.value = fallback.id
    } else {
      openSection('overview')
    }
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
    openSection,
    openSettingsSubSection,
    openAsset,
    setAssetSubTab,
    openDocument,
    setDocumentSubTab,
    openPage,
    setPageSubTab,
    openPagePreview,
    openObject,
    setObjectSubTab,
    openClass,
    setTabLabel,
    closeTab,
    closeAssetTab,
    closeDocumentTab,
    closeObjectTab,
    closeClassTab,
    openWebsite,
    setWebsiteSubTab,
    closeWebsiteTab
  }
})

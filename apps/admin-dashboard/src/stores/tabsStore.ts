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

export type SectionKind = 'overview' | 'objects' | 'assets' | 'documents' | 'pages' | 'settings'
export type MasterItemKind = 'asset' | 'document' | 'page'
export type AssetSubTab = 'preview' | 'editor' | 'metadata' | 'thumbnails'
export type DocumentSubTab = 'editor' | 'preview'

export interface MainTab {
  id: string
  type: 'section' | 'item'
  section?: SectionKind
  itemKind?: MasterItemKind
  itemId?: string
  assetSubTab?: AssetSubTab
  documentSubTab?: DocumentSubTab
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

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<MainTab[]>([{ id: sectionTabId('overview'), type: 'section', section: 'overview' }])
  const activeTabId = ref<string>(sectionTabId('overview'))

  function findIndex(id: string): number {
    return tabs.value.findIndex((t) => t.id === id)
  }

  function openSection(section: SectionKind) {
    const id = sectionTabId(section)
    if (findIndex(id) === -1) {
      tabs.value.push({ id, type: 'section', section })
    }
    activeTabId.value = id
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
  function openPage(pageId: string) {
    const id = pageTabId(pageId)
    if (findIndex(id) === -1) {
      tabs.value.push({ id, type: 'item', itemKind: 'page', itemId: pageId })
    }
    activeTabId.value = id
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

  return {
    tabs,
    activeTabId,
    openSection,
    openAsset,
    setAssetSubTab,
    openDocument,
    setDocumentSubTab,
    openPage,
    closeTab,
    closeAssetTab,
    closeDocumentTab
  }
})

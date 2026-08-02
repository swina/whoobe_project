import { defineStore } from 'pinia'
import { ref } from 'vue'

// Global main-tab system (Pimcore-style): the sidebar's sections (Overview,
// Data Objects, Assets, Documents, Settings) and any opened master item
// (an asset, and later a document/object) each get exactly one tab in a
// single flat strip. Item-specific views (an asset's Preview/Editor/
// Metadata) are NOT separate main tabs - they are a sub-tab subsystem
// nested inside that one master-item tab (see MasterAssetTab.vue).

export type SectionKind = 'overview' | 'objects' | 'assets' | 'documents' | 'settings'
export type MasterItemKind = 'asset'
export type AssetSubTab = 'preview' | 'editor' | 'metadata' | 'thumbnails'

export interface MainTab {
  id: string
  type: 'section' | 'item'
  section?: SectionKind
  itemKind?: MasterItemKind
  itemId?: string
  assetSubTab?: AssetSubTab
}

export function sectionTabId(section: SectionKind): string {
  return `section:${section}`
}

export function assetTabId(assetId: string): string {
  return `item:asset:${assetId}`
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

  return {
    tabs,
    activeTabId,
    openSection,
    openAsset,
    setAssetSubTab,
    closeTab,
    closeAssetTab
  }
})

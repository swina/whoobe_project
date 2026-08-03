// Pinia port of whoobe-one-studio's store/modules/datastore.js. The source
// module is largely vestigial even in the original (its `dataset`/`fields`/
// `add_media` mutations assume a remote-data-source shape - `dataset.media`,
// per-table fields - that nothing in this client-only fork actually
// populates; the `dataset` action's `categories`-specific branch is the one
// piece of real logic, building a components-gallery category list). Ported
// faithfully anyway (Phase 1 scope is the state/data layer, not judging
// which parts of it get used later) - not yet consumed by anything in this
// spike.
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface DatasetPayload {
  table: string
  data: any
}

export interface ComponentCategory {
  label: string
  icon: string
  component: string
  path: string
  filter: string
}

export const useDatastoreStore = defineStore('datastore', () => {
  const workspace = ref<any>(null)
  const preloaded = ref<any[]>([])
  const tables = ref<any>(null)
  const fields = ref<Record<string, any>>({})
  const dataset = ref<Record<string, any>>({})
  const componentsCategories = ref<ComponentCategory[]>([])
  const currentArticle = ref<any>(null)
  const currentProduct = ref<any>(null)
  const selectedCategories = ref<Record<string, any>>({})
  const whoobeStore = ref<any>(null)
  const shopify = ref<any>(null)

  function setWorkspace(v: any) { workspace.value = v }
  function setTables(v: any) { tables.value = v }

  function setDataset(payload: DatasetPayload) {
    if (payload.table === 'categories') {
      const sorted = [...payload.data].sort((a, b) => a.name - b.name)
      componentsCategories.value = sorted
        .filter((category: any) => category.type === 'block')
        .map((cat: any) => ({
          label: cat.name,
          icon: 'widgets',
          component: 'Blocks',
          path: 'blocks/blocks',
          filter: cat.name,
        }))
    }
    dataset.value[payload.table] = payload.data
  }

  function setFields(payload: { table: string; fields: any }) {
    fields.value[payload.table] = payload.fields
  }

  function addMedia(payload: any) {
    dataset.value.media?.unshift(payload)
  }

  function setComponentsCategories(v: ComponentCategory[]) { componentsCategories.value = v }
  function setCurrentArticle(v: any) { currentArticle.value = v }
  function setCurrentProduct(v: any) { currentProduct.value = v }
  function setSelectedCategories(v: Record<string, any>) { selectedCategories.value = v }
  function setWhoobeStore(v: any) { whoobeStore.value = v }
  function setShopifyClient(v: any) { shopify.value = v }

  return {
    workspace, preloaded, tables, fields, dataset, componentsCategories,
    currentArticle, currentProduct, selectedCategories, whoobeStore, shopify,
    setWorkspace, setTables, setDataset, setFields, addMedia,
    setComponentsCategories, setCurrentArticle, setCurrentProduct,
    setSelectedCategories, setWhoobeStore, setShopifyClient,
  }
})

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getDefaultCoreApiUrl } from '../utils/auth-api'
import { fetchDocsSiteTree, type DocsSiteTree } from '../utils/docs-sites-api'

// The documentation sites open in the dashboard: one tree (documents, index, files, warnings) per website, shared by the site's tab
// and the tabs of its documents, so a save in one is seen by the others.
export const useDocsSitesStore = defineStore('docsSites', () => {
  const trees = ref<Record<string, DocsSiteTree>>({})
  const loading = ref<Record<string, boolean>>({})
  const errors = ref<Record<string, string>>({})

  async function load(websiteId: string): Promise<DocsSiteTree | null> {
    loading.value = { ...loading.value, [websiteId]: true }
    errors.value = { ...errors.value, [websiteId]: '' }
    try {
      const tree = await fetchDocsSiteTree(getDefaultCoreApiUrl(), websiteId)
      trees.value = { ...trees.value, [websiteId]: tree }
      return tree
    } catch (e: any) {
      const { [websiteId]: _gone, ...rest } = trees.value
      trees.value = rest
      errors.value = { ...errors.value, [websiteId]: e?.message || 'Could not load the documentation site' }
      return null
    } finally {
      loading.value = { ...loading.value, [websiteId]: false }
    }
  }

  return { trees, loading, errors, load }
})

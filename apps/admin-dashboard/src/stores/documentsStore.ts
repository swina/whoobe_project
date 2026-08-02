import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchDocuments, fetchDocumentById, updateDocumentContent, type CmsDocumentRecord } from '../utils/documents-api'
import type { WhoobeBlockNode } from '@pimcore-custom/core'
import { useAuthStore } from './authStore'

export const useDocumentsStore = defineStore('documents', () => {
  const documents = ref<CmsDocumentRecord[]>([])
  const isLoading = ref(false)

  async function refreshDocuments(): Promise<void> {
    const authStore = useAuthStore()
    isLoading.value = true
    try {
      documents.value = await fetchDocuments(authStore.config.coreApiUrl)
    } catch (e) {
      console.warn('Could not load documents:', e)
    } finally {
      isLoading.value = false
    }
  }

  // Detail fetches (full rootBlock tree) aren't kept in `documents` - the
  // list view only needs summary fields, and re-fetching on open picks up
  // any change made since the list was last refreshed.
  async function getDocument(id: string): Promise<CmsDocumentRecord> {
    const authStore = useAuthStore()
    return fetchDocumentById(authStore.config.coreApiUrl, id)
  }

  async function updateDocument(id: string, title: string, rootBlock: WhoobeBlockNode): Promise<CmsDocumentRecord> {
    const authStore = useAuthStore()
    const updated = await updateDocumentContent(authStore.config.coreApiUrl, id, { title, rootBlock })
    const index = documents.value.findIndex((d) => d.id === id)
    if (index >= 0) documents.value[index] = updated
    return updated
  }

  refreshDocuments()

  return {
    documents,
    isLoading,
    refreshDocuments,
    getDocument,
    updateDocument,
  }
})

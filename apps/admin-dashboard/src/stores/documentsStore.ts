import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchDocuments, fetchDocumentById, updateDocumentContent, type CmsDocumentRecord } from '../utils/documents-api'
import type { WhoobeBlockNode } from '@whoobe-cms/core'
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

  // Explicit Save as Draft/Save and Publish actions (MasterDocumentTab.vue) -
  // distinct from updateDocument's autosave path, which never sends status
  // so a keystroke can't accidentally flip a published document back to
  // draft (or vice versa). Resends the current title/rootBlock alongside
  // status since the PATCH route requires both on every call.
  async function setDocumentStatus(
    id: string,
    title: string,
    rootBlock: WhoobeBlockNode,
    status: string
  ): Promise<CmsDocumentRecord> {
    const authStore = useAuthStore()
    const updated = await updateDocumentContent(authStore.config.coreApiUrl, id, { title, rootBlock, status })
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
    setDocumentStatus,
  }
})

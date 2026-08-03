// Pinia port of whoobe-one-studio's store/modules/generator.js - confirmed
// unused/vestigial in the source too (port plan survey: no dispatch of
// `website`/`addPage` found anywhere else in the codebase). Ported for
// state-layer parity, not because anything consumes it.
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useGeneratorStore = defineStore('generator', () => {
  const website = ref<any>(null)
  const pages = ref<any[]>([])

  function setWebsite(v: any) { website.value = v }
  function setPages(v: any[]) { pages.value = v }
  function addPage(page: any) { pages.value.push(page) }

  return { website, pages, setWebsite, setPages, addPage }
})

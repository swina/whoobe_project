// Pinia port of whoobe-one-studio's store/modules/desktop.js - open-tabs/
// dashboard-shell state. One thing carried forward deliberately, not
// dropped: the source's `currentTab` mutation writes to localStorage as a
// side effect (`whoobe-desktop`) - a pre-existing anti-pattern (impure
// mutations, flagged in the port plan §1.4) but harmless and out of scope
// to redesign here; kept as-is in `setCurrentTab` below.
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface DesktopTab {
  label: string
  object: any
  type?: string
}

export const useDesktopStore = defineStore('desktop', () => {
  const mode = ref<string>('full')
  const message = ref<string>('')
  const filter = ref<string>('')
  const tabs = ref<DesktopTab[]>([])
  const galleryFilter = ref<string | null>(null)
  const dbmode = ref<boolean>(true)
  const library = ref<any>(null)
  const uikits = ref<any[]>([])
  const component = ref<any>(null)
  const cloudinaryImage = ref<any>(null)
  const error = ref<any>(null)
  const currentTab = ref<number>(0)
  const loading = ref<boolean>(false)
  const project = ref<any>(null)
  const confirm = ref<boolean>(false)
  const confirmAction = ref<any>(null)
  const toolbar = ref<any>(null)
  const menuResponsive = ref<boolean>(false)

  function setMode(v: string) { mode.value = v }
  function setMessage(v: string) { message.value = v }
  function setFilter(v: string) { filter.value = v }
  function setTabs(v: DesktopTab[]) { tabs.value = v }

  function addTab(payload: DesktopTab) {
    const existingIndex = tabs.value.findIndex((tab) => tab.label === payload.label)
    if (existingIndex >= 0) {
      currentTab.value = existingIndex
      return
    }
    tabs.value.push(payload)
    currentTab.value = tabs.value.length - 1
  }

  function removeTab(index: number) {
    tabs.value.splice(index, 1)
  }

  function setGalleryFilter(v: string | null) { galleryFilter.value = v }
  function setDbmode(v: boolean) { dbmode.value = v }
  function setLibrary(v: any) { library.value = v }

  function addUikit(payload: { name: string }) {
    const exists = uikits.value.some((kit) => kit.name === payload.name)
    if (!exists) uikits.value.push(payload)
  }

  function setUikits(v: any[]) { uikits.value = v }
  function setCloudinaryImage(v: any) { cloudinaryImage.value = v }
  function setError(v: any) { error.value = v }

  function setCurrentTab(v: number) {
    currentTab.value = v
    window.localStorage.setItem('whoobe-desktop', JSON.stringify(tabs.value))
  }

  function setComponent(v: any) { component.value = v }
  function setLoading(v: boolean) { loading.value = !!v }
  function setProject(v: any) { project.value = v }
  function setConfirm(v: boolean) { confirm.value = v }
  function setConfirmAction(v: any) { confirmAction.value = v }
  function setToolbar(v: any) { toolbar.value = v }
  function toggleMenuResponsive() { menuResponsive.value = !menuResponsive.value }

  return {
    mode, message, filter, tabs, galleryFilter, dbmode, library, uikits,
    component, cloudinaryImage, error, currentTab, loading, project, confirm,
    confirmAction, toolbar, menuResponsive,
    setMode, setMessage, setFilter, setTabs, addTab, removeTab,
    setGalleryFilter, setDbmode, setLibrary, addUikit, setUikits,
    setCloudinaryImage, setError, setCurrentTab, setComponent, setLoading,
    setProject, setConfirm, setConfirmAction, setToolbar, toggleMenuResponsive,
  }
})

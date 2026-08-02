import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as apiLogin, logout as apiLogout, fetchCurrentUser, getDefaultCoreApiUrl, type AuthenticatedUser } from '../utils/auth-api'

const CONFIG_STORAGE_KEY = 'whoobe_custom_auth_config'

interface AuthConfigState {
  coreApiUrl: string
}

function loadInitialConfig(): AuthConfigState {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (typeof parsed.coreApiUrl === 'string' && parsed.coreApiUrl) {
        return { coreApiUrl: parsed.coreApiUrl }
      }
    }
  } catch (e) {
    console.error('Failed to load auth config:', e)
  }
  return { coreApiUrl: import.meta.env.VITE_CORE_API_URL || getDefaultCoreApiUrl() }
}

export const useAuthStore = defineStore('auth', () => {
  const config = ref<AuthConfigState>(loadInitialConfig())
  const currentUser = ref<AuthenticatedUser | null>(null)
  // Starts true: App.vue holds the login/dashboard decision until the
  // initial /auth/me check resolves, so a valid existing session doesn't
  // flash a login screen before redirecting into the app.
  const isLoading = ref(true)
  const errorMessage = ref('')

  const permissions = computed(() => new Set(currentUser.value?.permissions ?? []))

  function can(permissionKey: string): boolean {
    return permissions.value.has(permissionKey)
  }

  async function fetchMe(): Promise<void> {
    isLoading.value = true
    try {
      currentUser.value = await fetchCurrentUser(config.value.coreApiUrl)
    } catch (e) {
      console.warn('Could not reach core-api to check session:', e)
      currentUser.value = null
    } finally {
      isLoading.value = false
    }
  }

  async function login(email: string, password: string): Promise<void> {
    errorMessage.value = ''
    try {
      currentUser.value = await apiLogin(config.value.coreApiUrl, email, password)
    } catch (e: any) {
      errorMessage.value = e?.message || 'Login failed'
      throw e
    }
  }

  async function logout(): Promise<void> {
    try {
      await apiLogout(config.value.coreApiUrl)
    } catch (e) {
      console.warn('Logout request failed:', e)
    } finally {
      currentUser.value = null
    }
  }

  return {
    config,
    currentUser,
    isLoading,
    errorMessage,
    permissions,
    can,
    fetchMe,
    login,
    logout,
  }
})

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  login as apiLogin,
  logout as apiLogout,
  fetchCurrentUser,
  mfaChallenge as apiMfaChallenge,
  startMfaEnrolment as apiStartMfaEnrolment,
  verifyMfaEnrolment as apiVerifyMfaEnrolment,
  getDefaultCoreApiUrl,
  type AuthenticatedUser,
  type MfaRequired,
  type MfaEnrolmentRequired,
  type MfaSetupResponse,
} from '../utils/auth-api'
import { isStaleLocalhostUrl } from '../utils/stale-localhost'

function isMfaRequired(result: AuthenticatedUser | MfaRequired | MfaEnrolmentRequired): result is MfaRequired {
  return (result as MfaRequired).mfaRequired === true
}

function isEnrolmentRequired(result: AuthenticatedUser | MfaRequired | MfaEnrolmentRequired): result is MfaEnrolmentRequired {
  return (result as MfaEnrolmentRequired).mfaEnrolmentRequired === true
}

const CONFIG_STORAGE_KEY = 'whoobe_custom_auth_config'

interface AuthConfigState {
  coreApiUrl: string
}

function loadInitialConfig(): AuthConfigState {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Same stale-localhost guard as damStore: a persisted localhost URL
      // can never be reachable (nor carry the session cookie) once the
      // page is loaded from a LAN hostname - drop it for the default.
      if (typeof parsed.coreApiUrl === 'string' && parsed.coreApiUrl && !isStaleLocalhostUrl(parsed.coreApiUrl)) {
        return { coreApiUrl: parsed.coreApiUrl }
      }
    }
  } catch (e) {
    console.error('Failed to load auth config:', e)
  }
  return { coreApiUrl: getDefaultCoreApiUrl() }
}

export const useAuthStore = defineStore('auth', () => {
  const config = ref<AuthConfigState>(loadInitialConfig())
  const currentUser = ref<AuthenticatedUser | null>(null)
  // Starts true: App.vue holds the login/dashboard decision until the
  // initial /auth/me check resolves, so a valid existing session doesn't
  // flash a login screen before redirecting into the app.
  const isLoading = ref(true)
  const errorMessage = ref('')
  // Set when login() gets `mfaRequired` back instead of a session - a
  // password was already verified, LoginView.vue switches to its "enter
  // your code" step while this is non-null, and verifyMfa() below is what
  // actually completes the login.
  const mfaToken = ref<string | null>(null)
  // Set when login() gets `mfaEnrolmentRequired`: the settings require a second factor and the account has none. No session
  // exists until enrolment is proven; the user it opens is held in `enrolledUser` until the recovery codes were shown, so the
  // app does not replace the screen that carries them.
  const enrolToken = ref<string | null>(null)
  const enrolledUser = ref<AuthenticatedUser | null>(null)
  const recoveryCodes = ref<string[]>([])

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

  // 'mfa' = the code step is next, 'enrol' = the forced enrolment step is next, 'done' = login is already complete.
  async function login(email: string, password: string): Promise<'mfa' | 'enrol' | 'done'> {
    errorMessage.value = ''
    try {
      const result = await apiLogin(config.value.coreApiUrl, email, password)
      if (isMfaRequired(result)) {
        mfaToken.value = result.mfaToken
        return 'mfa'
      }
      if (isEnrolmentRequired(result)) {
        enrolToken.value = result.enrolToken
        return 'enrol'
      }
      currentUser.value = result
      return 'done'
    } catch (e: any) {
      errorMessage.value = e?.message || 'Login failed'
      throw e
    }
  }

  async function verifyMfa(credentials: { code?: string; recoveryCode?: string }): Promise<void> {
    errorMessage.value = ''
    if (!mfaToken.value) {
      errorMessage.value = 'MFA challenge expired - please log in again'
      throw new Error(errorMessage.value)
    }
    try {
      currentUser.value = await apiMfaChallenge(config.value.coreApiUrl, mfaToken.value, credentials)
      mfaToken.value = null
    } catch (e: any) {
      errorMessage.value = e?.message || 'Invalid code'
      throw e
    }
  }

  // Abandon the in-progress MFA step and go back to the email/password
  // form - the server-side challenge just expires unused (see core-api's
  // own MFA_CHALLENGE_TTL_MS), nothing to explicitly revoke here.
  function cancelMfa(): void {
    mfaToken.value = null
    errorMessage.value = ''
  }

  async function startEnrolment(): Promise<MfaSetupResponse> {
    errorMessage.value = ''
    if (!enrolToken.value) {
      errorMessage.value = 'Enrolment expired - please log in again'
      throw new Error(errorMessage.value)
    }
    try {
      return await apiStartMfaEnrolment(config.value.coreApiUrl, enrolToken.value)
    } catch (e: any) {
      errorMessage.value = e?.message || 'Failed to start MFA setup'
      throw e
    }
  }

  // The session is open after this, but the app only takes over in finishEnrolment(): the recovery codes are shown once.
  async function verifyEnrolment(code: string): Promise<void> {
    errorMessage.value = ''
    if (!enrolToken.value) {
      errorMessage.value = 'Enrolment expired - please log in again'
      throw new Error(errorMessage.value)
    }
    try {
      const { recoveryCodes: codes, ...user } = await apiVerifyMfaEnrolment(config.value.coreApiUrl, enrolToken.value, code)
      enrolledUser.value = user
      recoveryCodes.value = codes
      enrolToken.value = null
    } catch (e: any) {
      errorMessage.value = e?.message || 'Invalid code'
      throw e
    }
  }

  function finishEnrolment(): void {
    currentUser.value = enrolledUser.value
    enrolledUser.value = null
    recoveryCodes.value = []
  }

  function cancelEnrolment(): void {
    enrolToken.value = null
    errorMessage.value = ''
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
    mfaToken,
    enrolToken,
    recoveryCodes,
    permissions,
    can,
    fetchMe,
    login,
    verifyMfa,
    cancelMfa,
    startEnrolment,
    verifyEnrolment,
    finishEnrolment,
    cancelEnrolment,
    logout,
  }
})

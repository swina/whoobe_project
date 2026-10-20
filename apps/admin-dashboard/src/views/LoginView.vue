<template>
  <div class="min-h-screen bg-slate-950 light:bg-slate-50 flex items-center justify-center p-4">
    <div class="w-full max-w-sm space-y-6">
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white font-bold shadow-lg shadow-indigo-500/20">
          <Layers class="w-6 h-6" />
        </div>
        <div>
          <h1 class="font-bold text-xl text-slate-100 light:text-slate-900">Whoobe</h1>
          <p class="text-xs text-slate-500">Sign in to continue</p>
        </div>
      </div>

      <form v-if="step === 'credentials'" @submit.prevent="submitCredentials" class="space-y-4 p-6 rounded-2xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 shadow-xl">
        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Email</label>
          <input
            v-model="email"
            type="email"
            autocomplete="username"
            required
            class="field w-full"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Password</label>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            class="field w-full"
          />
        </div>

        <div v-if="authStore.errorMessage" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
          {{ authStore.errorMessage }}
        </div>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="btn btn-primary w-full flex items-center justify-center gap-2"
        >
          <span v-if="isSubmitting" class="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
          <span>{{ isSubmitting ? 'Signing in...' : 'Sign In' }}</span>
        </button>

        <p class="text-center text-xs text-slate-500">
          <router-link to="/forgot-password" class="text-indigo-400 hover:text-indigo-300">Forgot password?</router-link>
        </p>
      </form>

      <!-- Single sign-on, when an administrator has set it up (Security > SSO). A full page navigation: the provider answers with a redirect. -->
      <template v-if="step === 'credentials'">
      <div v-if="sso?.enabled" class="space-y-2">
        <div v-if="ssoError" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs" data-testid="sso-error">{{ ssoError }}</div>
        <a :href="oidcLoginUrl(authStore.config.coreApiUrl)" class="btn btn-secondary w-full flex items-center justify-center gap-2" data-testid="sso-button">
          <span>Sign in with {{ sso.label }}</span>
        </a>
        <p v-if="sso.localLogin === 'admins'" class="text-center text-xs text-slate-500">The password form is for administrators.</p>
      </div>
      <div v-else-if="ssoError" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs" data-testid="sso-error">{{ ssoError }}</div>
      </template>

      <!-- Step 2: password already verified (that's what mfaToken proves) -
           only the authenticator code, or a one-time recovery code, is
           still needed. -->
      <form v-if="step === 'mfa'" @submit.prevent="submitMfa" class="space-y-4 p-6 rounded-2xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 shadow-xl">
        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">
            {{ useRecoveryCode ? 'Recovery code' : 'Authenticator code' }}
          </label>
          <input
            v-model="code"
            type="text"
            :inputmode="useRecoveryCode ? 'text' : 'numeric'"
            :placeholder="useRecoveryCode ? 'xxxxx-xxxxx' : '123456'"
            autocomplete="one-time-code"
            autofocus
            required
            class="field w-full tracking-widest"
          />
        </div>

        <div v-if="authStore.errorMessage" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
          {{ authStore.errorMessage }}
        </div>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="btn btn-primary w-full flex items-center justify-center gap-2"
        >
          <span v-if="isSubmitting" class="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
          <span>{{ isSubmitting ? 'Verifying...' : 'Verify' }}</span>
        </button>

        <div class="flex items-center justify-between text-xs">
          <button type="button" class="btn btn-link-muted" @click="toggleRecoveryMode">
            {{ useRecoveryCode ? 'Use authenticator code instead' : "Use a recovery code instead" }}
          </button>
          <button type="button" class="btn btn-link-muted" @click="backToCredentials">Cancel</button>
        </div>
      </form>

      <!-- Forced enrolment: the settings require a second factor of this account and it has none. Nothing is open yet; the
           code below is what opens the session. -->
      <form v-else-if="step === 'enrol'" @submit.prevent="submitEnrol" class="space-y-4 p-6 rounded-2xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 shadow-xl">
        <p class="text-xs text-slate-400 light:text-slate-600">
          Your role requires two-factor authentication. Scan this with an authenticator app (Google Authenticator, Authy, 1Password, ...), then enter the 6-digit code it shows.
        </p>
        <div v-if="enrolSetup" class="flex items-start gap-4">
          <img :src="enrolSetup.qrCodeDataUrl" alt="MFA QR code" class="w-32 h-32 rounded-lg bg-white p-1" />
          <div class="text-xs text-slate-500 space-y-1">
            <div>Can't scan? Enter this key manually:</div>
            <code class="block px-2 py-1 rounded bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-300 light:text-slate-700 tracking-wider break-all">{{ enrolSetup.secret }}</code>
          </div>
        </div>
        <input
          v-model="code"
          type="text"
          inputmode="numeric"
          placeholder="123456"
          autocomplete="one-time-code"
          required
          class="field w-full tracking-widest"
        />

        <div v-if="authStore.errorMessage" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
          {{ authStore.errorMessage }}
        </div>

        <button type="submit" :disabled="isSubmitting || !enrolSetup" class="btn btn-primary w-full flex items-center justify-center gap-2">
          <span v-if="isSubmitting" class="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
          <span>{{ isSubmitting ? 'Verifying...' : 'Confirm and sign in' }}</span>
        </button>
        <div class="text-right text-xs">
          <button type="button" class="btn btn-link-muted" @click="backToCredentials">Cancel</button>
        </div>
      </form>

      <!-- The factor is enabled and the session is open; the app takes over when the codes are acknowledged. -->
      <div v-else-if="step === 'recovery'" class="space-y-4 p-6 rounded-2xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 shadow-xl" data-testid="recovery-codes">
        <p class="text-xs text-slate-400 light:text-slate-600">
          Save these recovery codes somewhere safe. Each one can be used once to sign in if you lose access to your authenticator app - they will not be shown again.
        </p>
        <div class="grid grid-cols-2 gap-2">
          <code v-for="rc in authStore.recoveryCodes" :key="rc" class="px-2 py-1 rounded bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-300 light:text-slate-700 text-center text-xs tracking-wider">
            {{ rc }}
          </code>
        </div>
        <button class="btn btn-primary w-full" @click="authStore.finishEnrolment()">I've saved these codes</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Layers } from '@lucide/vue'
import { useAuthStore } from '../stores/authStore'
import type { MfaSetupResponse } from '../utils/auth-api'
import { fetchOidcPublicConfig, oidcLoginUrl, OIDC_ERROR_TEXT, type OidcPublicConfig } from '../utils/oidc-settings-api'

const authStore = useAuthStore()
const email = ref('')
const password = ref('')
const code = ref('')
const useRecoveryCode = ref(false)
const step = ref<'credentials' | 'mfa' | 'enrol' | 'recovery'>('credentials')
const enrolSetup = ref<MfaSetupResponse | null>(null)

// Single sign-on: the button appears when it is set up; a failed sign-in lands back here with ?sso_error=<code>.
const sso = ref<OidcPublicConfig | null>(null)
const ssoError = ref('')
onMounted(async () => {
  const code = new URLSearchParams(window.location.search).get('sso_error')
  if (code) {
    ssoError.value = OIDC_ERROR_TEXT[code] ?? 'The sign-in did not complete.'
    // the code has been read: take it out of the address bar so a reload does not show it again
    window.history.replaceState(null, '', window.location.pathname)
  }
  try { sso.value = await fetchOidcPublicConfig(authStore.config.coreApiUrl) } catch { /* no button: the password form still works */ }
})
const isSubmitting = ref(false)

async function submitCredentials() {
  isSubmitting.value = true
  try {
    const next = await authStore.login(email.value, password.value)
    if (next === 'mfa') step.value = 'mfa'
    if (next === 'enrol') {
      step.value = 'enrol'
      enrolSetup.value = await authStore.startEnrolment()
    }
  } catch {
    // errorMessage is already set on the store; nothing else to do here.
  } finally {
    isSubmitting.value = false
  }
}

async function submitMfa() {
  isSubmitting.value = true
  try {
    await authStore.verifyMfa(useRecoveryCode.value ? { recoveryCode: code.value } : { code: code.value })
  } catch {
    // errorMessage is already set on the store; nothing else to do here.
  } finally {
    isSubmitting.value = false
  }
}

async function submitEnrol() {
  isSubmitting.value = true
  try {
    await authStore.verifyEnrolment(code.value)
    enrolSetup.value = null
    code.value = ''
    step.value = 'recovery'
  } catch {
    // errorMessage is already set on the store; nothing else to do here.
  } finally {
    isSubmitting.value = false
  }
}

function toggleRecoveryMode() {
  useRecoveryCode.value = !useRecoveryCode.value
  code.value = ''
  authStore.errorMessage = ''
}

function backToCredentials() {
  authStore.cancelMfa()
  authStore.cancelEnrolment()
  enrolSetup.value = null
  step.value = 'credentials'
  code.value = ''
  useRecoveryCode.value = false
}
</script>

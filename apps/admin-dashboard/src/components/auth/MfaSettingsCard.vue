<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Two-Factor Authentication</h3>
      <p class="text-xs text-slate-500 mt-1">Require a code from an authenticator app (Google Authenticator, Authy, 1Password, ...) in addition to your password.</p>
    </div>

    <div v-if="loading" class="text-xs text-slate-500">Loading...</div>

    <!-- Enabled, no action pending -->
    <div v-else-if="phase === 'enabled'" class="flex items-center justify-between py-2">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
        <span class="text-sm text-slate-200 light:text-slate-800">Enabled</span>
      </div>
      <button
        class="btn btn-secondary"
        @click="phase = 'confirmDisable'"
      >
        Disable
      </button>
    </div>

    <!-- Disabling: needs the current password to confirm -->
    <form v-else-if="phase === 'confirmDisable'" @submit.prevent="submitDisable" class="space-y-3">
      <p class="text-xs text-slate-400 light:text-slate-600">Enter your password to disable two-factor authentication.</p>
      <input
        v-model="disablePassword"
        type="password"
        autocomplete="current-password"
        required
        class="field w-full"
      />
      <div v-if="error" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{{ error }}</div>
      <div class="flex gap-2">
        <button
          type="submit"
          :disabled="submitting"
          class="btn btn-danger"
        >
          {{ submitting ? 'Disabling...' : 'Confirm disable' }}
        </button>
        <button type="button" class="btn btn-secondary" @click="resetToStatus">
          Cancel
        </button>
      </div>
    </form>

    <!-- Not enabled yet, nothing in progress -->
    <div v-else-if="phase === 'disabled'" class="flex items-center justify-between py-2">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-slate-600 light:bg-slate-300"></span>
        <span class="text-sm text-slate-200 light:text-slate-800">Not enabled</span>
      </div>
      <button
        class="btn btn-primary"
        @click="beginSetup"
      >
        Enable
      </button>
    </div>

    <!-- Setup step 1: scan QR / enter secret, then confirm a live code -->
    <form v-else-if="phase === 'setup'" @submit.prevent="submitVerifySetup" class="space-y-3">
      <p class="text-xs text-slate-400 light:text-slate-600">Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
      <div class="flex items-start gap-4">
        <img v-if="setup" :src="setup.qrCodeDataUrl" alt="MFA QR code" class="w-32 h-32 rounded-lg bg-white p-1" />
        <div class="text-xs text-slate-500 space-y-1">
          <div>Can't scan? Enter this key manually:</div>
          <code class="block px-2 py-1 rounded bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-300 light:text-slate-700 tracking-wider break-all">{{ setup?.secret }}</code>
        </div>
      </div>
      <input
        v-model="setupCode"
        type="text"
        inputmode="numeric"
        placeholder="123456"
        autocomplete="one-time-code"
        required
        class="field w-full tracking-widest"
      />
      <div v-if="error" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{{ error }}</div>
      <div class="flex gap-2">
        <button
          type="submit"
          :disabled="submitting"
          class="btn btn-primary"
        >
          {{ submitting ? 'Verifying...' : 'Confirm' }}
        </button>
        <button type="button" class="btn btn-secondary" @click="resetToStatus">
          Cancel
        </button>
      </div>
    </form>

    <!-- Setup step 2: recovery codes, shown exactly once -->
    <div v-else-if="phase === 'recoveryCodes'" class="space-y-3">
      <p class="text-xs text-slate-400 light:text-slate-600">
        Save these recovery codes somewhere safe. Each one can be used once to sign in if you lose access to your authenticator app - they will not be shown again.
      </p>
      <div class="grid grid-cols-2 gap-2">
        <code v-for="rc in recoveryCodes" :key="rc" class="px-2 py-1 rounded bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-300 light:text-slate-700 text-center text-xs tracking-wider">
          {{ rc }}
        </code>
      </div>
      <button
        class="btn btn-primary"
        @click="acknowledgeRecoveryCodes"
      >
        I've saved these codes
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  fetchMfaStatus,
  startMfaSetup,
  verifyMfaSetup,
  disableMfa,
  type MfaSetupResponse,
} from '../../utils/auth-api'
import { useAuthStore } from '../../stores/authStore'

const authStore = useAuthStore()

type Phase = 'disabled' | 'setup' | 'recoveryCodes' | 'enabled' | 'confirmDisable'

const loading = ref(true)
const phase = ref<Phase>('disabled')
const error = ref('')
const submitting = ref(false)

const setup = ref<MfaSetupResponse | null>(null)
const setupCode = ref('')
const recoveryCodes = ref<string[]>([])
const disablePassword = ref('')

async function loadStatus() {
  loading.value = true
  try {
    const { enabled } = await fetchMfaStatus(authStore.config.coreApiUrl)
    phase.value = enabled ? 'enabled' : 'disabled'
  } catch (e: any) {
    error.value = e?.message || 'Failed to load MFA status'
  } finally {
    loading.value = false
  }
}

async function beginSetup() {
  error.value = ''
  try {
    setup.value = await startMfaSetup(authStore.config.coreApiUrl)
    phase.value = 'setup'
  } catch (e: any) {
    error.value = e?.message || 'Failed to start MFA setup'
  }
}

async function submitVerifySetup() {
  error.value = ''
  submitting.value = true
  try {
    const result = await verifyMfaSetup(authStore.config.coreApiUrl, setupCode.value)
    recoveryCodes.value = result.recoveryCodes
    phase.value = 'recoveryCodes'
  } catch (e: any) {
    error.value = e?.message || 'Invalid code'
  } finally {
    submitting.value = false
  }
}

function acknowledgeRecoveryCodes() {
  recoveryCodes.value = []
  setup.value = null
  setupCode.value = ''
  phase.value = 'enabled'
}

async function submitDisable() {
  error.value = ''
  submitting.value = true
  try {
    await disableMfa(authStore.config.coreApiUrl, disablePassword.value)
    disablePassword.value = ''
    phase.value = 'disabled'
  } catch (e: any) {
    error.value = e?.message || 'Invalid password'
  } finally {
    submitting.value = false
  }
}

function resetToStatus() {
  error.value = ''
  setup.value = null
  setupCode.value = ''
  disablePassword.value = ''
  loadStatus()
}

onMounted(loadStatus)
</script>

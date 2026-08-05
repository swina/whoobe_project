<template>
  <div class="min-h-screen bg-slate-950 light:bg-slate-50 flex items-center justify-center p-4">
    <div class="w-full max-w-sm space-y-6">
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white font-bold shadow-lg shadow-indigo-500/20">
          <Layers class="w-6 h-6" />
        </div>
        <div>
          <h1 class="font-bold text-xl text-slate-100 light:text-slate-900">Whoobe CMS</h1>
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
            class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Password</label>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div v-if="authStore.errorMessage" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
          {{ authStore.errorMessage }}
        </div>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full px-4 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <span v-if="isSubmitting" class="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
          <span>{{ isSubmitting ? 'Signing in...' : 'Sign In' }}</span>
        </button>
      </form>

      <!-- Step 2: password already verified (that's what mfaToken proves) -
           only the authenticator code, or a one-time recovery code, is
           still needed. -->
      <form v-else @submit.prevent="submitMfa" class="space-y-4 p-6 rounded-2xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 shadow-xl">
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
            class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 tracking-widest"
          />
        </div>

        <div v-if="authStore.errorMessage" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
          {{ authStore.errorMessage }}
        </div>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full px-4 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <span v-if="isSubmitting" class="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
          <span>{{ isSubmitting ? 'Verifying...' : 'Verify' }}</span>
        </button>

        <div class="flex items-center justify-between text-xs">
          <button type="button" class="text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800" @click="toggleRecoveryMode">
            {{ useRecoveryCode ? 'Use authenticator code instead' : "Use a recovery code instead" }}
          </button>
          <button type="button" class="text-slate-500 hover:text-slate-300 light:text-slate-700" @click="backToCredentials">Cancel</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Layers } from '@lucide/vue'
import { useAuthStore } from '../stores/authStore'

const authStore = useAuthStore()
const email = ref('')
const password = ref('')
const code = ref('')
const useRecoveryCode = ref(false)
const step = ref<'credentials' | 'mfa'>('credentials')
const isSubmitting = ref(false)

async function submitCredentials() {
  isSubmitting.value = true
  try {
    const mfaRequired = await authStore.login(email.value, password.value)
    if (mfaRequired) step.value = 'mfa'
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

function toggleRecoveryMode() {
  useRecoveryCode.value = !useRecoveryCode.value
  code.value = ''
  authStore.errorMessage = ''
}

function backToCredentials() {
  authStore.cancelMfa()
  step.value = 'credentials'
  code.value = ''
  useRecoveryCode.value = false
}
</script>

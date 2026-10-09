<template>
  <div class="min-h-screen bg-slate-950 light:bg-slate-50 flex items-center justify-center p-4">
    <div class="w-full max-w-sm space-y-6">
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white font-bold shadow-lg shadow-indigo-500/20">
          <KeyRound class="w-6 h-6" />
        </div>
        <div>
          <h1 class="font-bold text-xl text-slate-100 light:text-slate-900">Reset Password</h1>
          <p class="text-xs text-slate-500">Enter your email to receive a reset link</p>
        </div>
      </div>

      <form v-if="!sent" @submit.prevent="submitEmail" class="space-y-4 p-6 rounded-2xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 shadow-xl">
        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Email</label>
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            required
            class="field w-full"
          />
        </div>

        <div v-if="errorMessage" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
          {{ errorMessage }}
        </div>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="btn btn-primary w-full flex items-center justify-center gap-2"
        >
          <span v-if="isSubmitting" class="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
          <span>{{ isSubmitting ? 'Sending...' : 'Send Reset Link' }}</span>
        </button>

        <p class="text-center text-xs text-slate-500">
          <router-link to="/" class="text-indigo-400 hover:text-indigo-300">Back to Sign In</router-link>
        </p>
      </form>

      <div v-else class="space-y-4 p-6 rounded-2xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 shadow-xl text-center">
        <div class="text-sm text-slate-300 light:text-slate-700">
          If an account with that email exists, a password reset link has been sent. Check your inbox.
        </div>
        <router-link to="/" class="inline-block text-xs text-indigo-400 hover:text-indigo-300">Back to Sign In</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { KeyRound } from '@lucide/vue'
import { requestPasswordReset, getDefaultCoreApiUrl } from '../utils/auth-api'

const email = ref('')
const sent = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')

async function submitEmail() {
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    await requestPasswordReset(getDefaultCoreApiUrl(), email.value)
    sent.value = true
  } catch (e: any) {
    errorMessage.value = e?.message || 'Failed to send reset email'
  } finally {
    isSubmitting.value = false
  }
}
</script>
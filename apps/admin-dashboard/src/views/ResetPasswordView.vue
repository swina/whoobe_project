<template>
  <div class="min-h-screen bg-slate-950 light:bg-slate-50 flex items-center justify-center p-4">
    <div class="w-full max-w-sm space-y-6">
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white font-bold shadow-lg shadow-indigo-500/20">
          <Lock class="w-6 h-6" />
        </div>
        <div>
          <h1 class="font-bold text-xl text-slate-100 light:text-slate-900">Set New Password</h1>
          <p class="text-xs text-slate-500">Enter your new password below</p>
        </div>
      </div>

      <form v-if="!resetComplete" @submit.prevent="submitReset" class="space-y-4 p-6 rounded-2xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 shadow-xl">
        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">New Password</label>
          <input
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            class="field w-full"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Confirm Password</label>
          <input
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
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
          <span>{{ isSubmitting ? 'Resetting...' : 'Reset Password' }}</span>
        </button>
      </form>

      <div v-else class="space-y-4 p-6 rounded-2xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 shadow-xl text-center">
        <div class="text-sm text-slate-300 light:text-slate-700">
          Your password has been reset successfully.
        </div>
        <router-link to="/" class="inline-block text-xs text-indigo-400 hover:text-indigo-300">Back to Sign In</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Lock } from '@lucide/vue'
import { resetPassword, getDefaultCoreApiUrl } from '../utils/auth-api'

const route = useRoute()
const password = ref('')
const confirmPassword = ref('')
const resetComplete = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')
const token = ref('')

onMounted(() => {
  const t = route.query.token
  if (typeof t === 'string' && t) {
    token.value = t
  } else {
    errorMessage.value = 'Invalid reset link. Please request a new one.'
  }
})

async function submitReset() {
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match'
    return
  }

  if (password.value.length < 8) {
    errorMessage.value = 'Password must be at least 8 characters'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''
  try {
    await resetPassword(getDefaultCoreApiUrl(), token.value, password.value)
    resetComplete.value = true
  } catch (e: any) {
    errorMessage.value = e?.message || 'Password reset failed'
  } finally {
    isSubmitting.value = false
  }
}
</script>
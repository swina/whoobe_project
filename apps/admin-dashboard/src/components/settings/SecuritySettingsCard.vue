<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-5">
    <div>
      <h3 class="font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Sign-in requirements</h3>
      <p class="text-xs text-slate-500 mt-1">Who must use a second factor, and the minimum a new password must satisfy.</p>
    </div>

    <div v-if="loading" class="text-xs text-slate-500">Loading...</div>

    <form v-else-if="settings" @submit.prevent="save" class="space-y-5">
      <fieldset class="space-y-2">
        <legend class="text-xs font-medium text-slate-300 light:text-slate-700">Roles that must use two-factor authentication</legend>
        <label v-for="role in settings.roles ?? []" :key="role.id" class="flex items-center gap-2 text-sm text-slate-200 light:text-slate-800">
          <input type="checkbox" :value="role.id" v-model="roleIds" />
          <span>{{ role.name }}</span>
        </label>
        <p class="text-xs text-slate-500">
          A user of a ticked role without a second factor is led to enrolment at the next sign-in and gets no session until it is done; they cannot turn it off afterwards.
          Sessions already open keep working until they end. None ticked = nobody is required.
        </p>
      </fieldset>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Minimum password length</label>
          <input v-model.number="minLength" type="number" min="8" max="128" step="1" required class="field w-full" />
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-200 light:text-slate-800 sm:mt-6">
          <input type="checkbox" v-model="requireClasses" />
          <span>Require three of: lowercase, uppercase, digit, symbol</span>
        </label>
      </div>
      <p class="text-xs text-slate-500">
        Applies where a password is set (new user, password reset). A password can never be the e-mail address. Existing passwords are not re-checked.
      </p>

      <div v-if="error" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{{ error }}</div>
      <div v-if="saved" class="px-3 py-2 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs">Saved.</div>

      <button type="submit" :disabled="saving" class="btn btn-primary">{{ saving ? 'Saving...' : 'Save' }}</button>
    </form>

    <div v-else-if="error" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchSecuritySettings, saveSecuritySettings, type SecuritySettings } from '../../utils/security-settings-api'
import { useAuthStore } from '../../stores/authStore'

const authStore = useAuthStore()

const loading = ref(true)
const saving = ref(false)
const saved = ref(false)
const error = ref('')
const settings = ref<SecuritySettings | null>(null)
const roleIds = ref<string[]>([])
const minLength = ref(8)
const requireClasses = ref(false)

function fill(s: SecuritySettings) {
  settings.value = s
  roleIds.value = [...s.requireMfaRoleIds]
  minLength.value = s.passwordPolicy.minLength
  requireClasses.value = s.passwordPolicy.requireClasses
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    fill(await fetchSecuritySettings(authStore.config.coreApiUrl))
  } catch (e: any) {
    error.value = e?.message || 'Failed to load the security settings'
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  saved.value = false
  error.value = ''
  try {
    const roles = settings.value?.roles
    fill({
      ...(await saveSecuritySettings(authStore.config.coreApiUrl, {
        requireMfaRoleIds: roleIds.value,
        passwordMinLength: minLength.value,
        passwordRequireClasses: requireClasses.value,
      })),
      roles,
    })
    saved.value = true
  } catch (e: any) {
    error.value = e?.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

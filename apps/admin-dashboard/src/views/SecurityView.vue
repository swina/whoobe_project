<template>
  <div class="h-full flex flex-col" data-testid="security-view">
    <SystemLogsView v-if="allowed && activeKey === 'system-logs'" />
    <AuditLogView v-else-if="allowed && activeKey === 'audit-log'" />

    <div v-else class="flex-1 min-h-0 overflow-y-auto">
      <div class="space-y-6 max-w-4xl">
        <div>
          <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">{{ current?.title }}</h2>
          <p class="text-xs text-slate-400 light:text-slate-600">{{ current?.description }}</p>
        </div>

        <div v-if="!allowed" class="rounded-2xl border border-slate-800 light:border-slate-200 p-6 text-sm text-slate-400" data-testid="security-denied">
          Your role does not give access to this page.
        </div>

        <template v-else-if="activeKey === 'access'">
          <div class="flex items-center gap-2 pb-1 border-b border-slate-800 light:border-slate-200">
            <button
              v-for="tab in rolesSubTabs" :key="tab.key"
              @click="setRolesSubTab(tab.key)"
              :class="['px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5', rolesActiveTab === tab.key ? 'bg-slate-800 light:bg-slate-200 text-slate-100 light:text-slate-900' : 'text-slate-500 light:text-slate-600 hover:text-slate-300 light:hover:text-slate-700']"
            >
              <component :is="tab.icon" class="w-3.5 h-3.5" />
              <span>{{ tab.name }}</span>
            </button>
          </div>
          <UsersView v-if="rolesActiveTab === 'users'" />
          <RolesView v-else-if="rolesActiveTab === 'roles'" />
        </template>

        <MfaSettingsCard v-else-if="activeKey === 'two-factor'" />
        <SecuritySettingsCard v-else-if="activeKey === 'sign-in'" />
        <OidcSettingsCard v-else-if="activeKey === 'sso'" />
        <DataSubjectCard v-else-if="activeKey === 'data-subject'" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { KeyRound, UserRound } from '@lucide/vue'
import { useAuthStore } from '../stores/authStore'
import { sectionTabId, useTabsStore } from '../stores/tabsStore'
import { securityNavItem } from '../utils/security-nav'
import MfaSettingsCard from '../components/auth/MfaSettingsCard.vue'
import SecuritySettingsCard from '../components/settings/SecuritySettingsCard.vue'
import OidcSettingsCard from '../components/settings/OidcSettingsCard.vue'
import DataSubjectCard from '../components/settings/DataSubjectCard.vue'
import SystemLogsView from './SystemLogsView.vue'
import AuditLogView from './AuditLogView.vue'
import UsersView from './UsersView.vue'
import RolesView from './RolesView.vue'

const authStore = useAuthStore()
const tabsStore = useTabsStore()

const activeKey = computed(() => tabsStore.tabs.find((t) => t.id === sectionTabId('security'))?.securitySubSection ?? 'two-factor')
const current = computed(() => securityNavItem(activeKey.value))
// a page kept in a stored tab may be one this user cannot open (another role signed in on this browser): say so, and show nothing of it
const allowed = computed(() => !!current.value && (current.value.permission === null || authStore.can(current.value.permission)))

const ROLES_SUB_KEY = 'whoobe:settings-roles-subtab'
type RolesSubTab = 'users' | 'roles'
const rolesActiveTab = ref<RolesSubTab>('users')
try {
  const saved = localStorage.getItem(ROLES_SUB_KEY) as RolesSubTab | null
  if (saved === 'users' || saved === 'roles') rolesActiveTab.value = saved
} catch { /* ignore */ }

const rolesSubTabs: { key: RolesSubTab; name: string; icon: any }[] = [
  { key: 'users', name: 'Users', icon: UserRound },
  { key: 'roles', name: 'Roles', icon: KeyRound },
]

function setRolesSubTab(key: RolesSubTab) {
  rolesActiveTab.value = key
  try { localStorage.setItem(ROLES_SUB_KEY, key) } catch { /* ignore */ }
}
</script>

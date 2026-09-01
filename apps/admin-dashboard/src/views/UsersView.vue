<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800">Users</h3>
        <p class="text-xs text-slate-500">{{ users.length }} user(s)</p>
      </div>
      <button @click="openCreate" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5">
        <Plus class="w-3.5 h-3.5" />
        Add User
      </button>
    </div>

    <div class="overflow-x-auto rounded-2xl border border-slate-800 light:border-slate-200">
      <table class="w-full text-xs">
        <thead>
          <tr class="bg-slate-900/80 light:bg-slate-100/80">
            <th class="text-left px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Email</th>
            <th class="text-left px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Name</th>
            <th class="text-left px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Roles</th>
            <th class="text-left px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Status</th>
            <th class="text-left px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Last Login</th>
            <th class="text-right px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id" class="border-t border-slate-800 light:border-slate-200 hover:bg-slate-800/40 light:hover:bg-slate-100/40">
            <td class="px-4 py-3 text-slate-200 light:text-slate-800">{{ user.email }}</td>
            <td class="px-4 py-3 text-slate-300 light:text-slate-700">{{ user.displayName }}</td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="roleName in user.roleNames"
                  :key="roleName"
                  :class="['px-2 py-0.5 rounded-full text-xs font-medium', roleBadgeClass(roleName)]"
                >{{ roleName }}</span>
              </div>
            </td>
            <td class="px-4 py-3">
              <span
                :class="user.isActive ? 'text-emerald-400' : 'text-rose-400'"
              >{{ user.isActive ? 'Active' : 'Inactive' }}</span>
            </td>
            <td class="px-4 py-3 text-slate-500">{{ user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—' }}</td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                <button @click="openEdit(user)" class="text-indigo-400 hover:text-indigo-300 transition" title="Edit">
                  <Pencil class="w-3.5 h-3.5" />
                </button>
                <button @click="confirmResetPassword(user)" class="text-amber-400 hover:text-amber-300 transition" title="Reset Password">
                  <KeyRound class="w-3.5 h-3.5" />
                </button>
                <button @click="confirmDelete(user)" class="text-rose-400 hover:text-rose-300 transition" title="Delete">
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!users.length" class="text-center py-12 text-slate-500 text-xs">No users found.</div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="closeModal">
      <div class="w-full max-w-lg p-6 rounded-2xl bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 shadow-2xl space-y-4">
        <h3 class="text-sm font-bold text-slate-100 light:text-slate-900">{{ isEditing ? 'Edit User' : 'Add User' }}</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Email</label>
            <input v-model="form.email" type="email" required class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Display Name</label>
            <input v-model="form.displayName" type="text" required class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div v-if="isEditing">
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Active</label>
            <label class="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" v-model="form.isActive" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200" />
              {{ form.isActive ? 'Active' : 'Inactive' }}
            </label>
          </div>
          <div v-if="!isEditing">
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Password</label>
            <input v-model="form.password" type="password" required minlength="8" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Roles</label>
            <div class="flex flex-wrap gap-2">
              <label v-for="role in roles" :key="role.id" class="flex items-center gap-1.5 text-xs text-slate-300 light:text-slate-700 cursor-pointer">
                <input type="checkbox" :value="role.id" v-model="form.roleIds" class="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200" />
                {{ role.name }}
              </label>
            </div>
          </div>
        </div>
        <div v-if="errorMessage" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{{ errorMessage }}</div>
        <div class="flex justify-end gap-2">
          <button @click="closeModal" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 light:bg-slate-200 text-slate-300 light:text-slate-700 hover:bg-slate-700 light:hover:bg-slate-300 transition">Cancel</button>
          <button @click="saveUser" :disabled="isSubmitting" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50">
            {{ isSubmitting ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Pencil, KeyRound, Trash2 } from '@lucide/vue'
import { listUsers, createUser, updateUser, deleteUser, adminResetPassword, listRoles, getDefaultCoreApiUrl, type UserAdmin, type RoleAdmin } from '../utils/auth-api'

const users = ref<UserAdmin[]>([])
const roles = ref<RoleAdmin[]>([])
const showModal = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const isSubmitting = ref(false)
const errorMessage = ref('')
const form = ref({ email: '', displayName: '', password: '', isActive: true, roleIds: [] as string[] })

async function load() {
  try {
    const [u, r] = await Promise.all([listUsers(getDefaultCoreApiUrl()), listRoles(getDefaultCoreApiUrl())])
    users.value = u
    roles.value = r
  } catch (e: any) {
    errorMessage.value = e?.message || 'Failed to load'
  }
}

function roleBadgeClass(name: string): string {
  const map: Record<string, string> = { admin: 'bg-red-950/60 text-red-300 border border-red-800', editor: 'bg-blue-950/60 text-blue-300 border border-blue-800', viewer: 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' }
  return map[name] || 'bg-slate-800 text-slate-400 border border-slate-700'
}

function openCreate() {
  isEditing.value = false
  editingId.value = null
  form.value = { email: '', displayName: '', password: '', isActive: true, roleIds: [] }
  errorMessage.value = ''
  showModal.value = true
}

function openEdit(user: UserAdmin) {
  isEditing.value = true
  editingId.value = user.id
  form.value = { email: user.email, displayName: user.displayName, password: '', isActive: user.isActive, roleIds: [...user.roleIds] }
  errorMessage.value = ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

async function saveUser() {
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    if (isEditing.value && editingId.value) {
      await updateUser(getDefaultCoreApiUrl(), editingId.value, { email: form.value.email, displayName: form.value.displayName, isActive: form.value.isActive, roleIds: form.value.roleIds })
    } else {
      await createUser(getDefaultCoreApiUrl(), { email: form.value.email, displayName: form.value.displayName, password: form.value.password, roleIds: form.value.roleIds })
    }
    closeModal()
    await load()
  } catch (e: any) {
    errorMessage.value = e?.message || 'Failed to save user'
  } finally {
    isSubmitting.value = false
  }
}

async function confirmDelete(user: UserAdmin) {
  if (!confirm(`Delete user "${user.email}"? This cannot be undone.`)) return
  try {
    await deleteUser(getDefaultCoreApiUrl(), user.id)
    await load()
  } catch (e: any) {
    errorMessage.value = e?.message || 'Failed to delete user'
  }
}

async function confirmResetPassword(user: UserAdmin) {
  if (!confirm(`Reset password for "${user.email}"? The reset link will be logged to the server console.`)) return
  try {
    const result = await adminResetPassword(getDefaultCoreApiUrl(), user.id)
    alert(`Reset link generated: ${result.resetUrl}`)
  } catch (e: any) {
    errorMessage.value = e?.message || 'Failed to reset password'
  }
}

onMounted(load)
</script>
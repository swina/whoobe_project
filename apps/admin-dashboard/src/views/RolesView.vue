<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800">Roles</h3>
        <p class="text-xs text-slate-500">{{ roles.length }} role(s)</p>
      </div>
      <button @click="openCreate" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5">
        <Plus class="w-3.5 h-3.5" />
        Add Role
      </button>
    </div>

    <div class="overflow-x-auto rounded-2xl border border-slate-800 light:border-slate-200">
      <table class="w-full text-xs">
        <thead>
          <tr class="bg-slate-900/80 light:bg-slate-100/80">
            <th class="text-left px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Name</th>
            <th class="text-left px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Description</th>
            <th class="text-left px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Permissions</th>
            <th class="text-left px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Users</th>
            <th class="text-right px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="role in roles" :key="role.id" class="border-t border-slate-800 light:border-slate-200 hover:bg-slate-800/40 light:hover:bg-slate-100/40">
            <td class="px-4 py-3">
              <span :class="['font-semibold', roleNameColor(role.name)]">{{ role.name }}</span>
            </td>
            <td class="px-4 py-3 text-slate-500">{{ role.description || '—' }}</td>
            <td class="px-4 py-3">
              <span class="text-slate-400">{{ role.permissionKeys.length }} permission(s)</span>
            </td>
            <td class="px-4 py-3 text-slate-400">{{ role.userCount }}</td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                <button @click="openEdit(role)" class="text-indigo-400 hover:text-indigo-300 transition" title="Edit">
                  <Pencil class="w-3.5 h-3.5" />
                </button>
                <button @click="confirmDelete(role)" class="text-rose-400 hover:text-rose-300 transition" title="Delete">
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/60" @click.self="closeModal">
      <div class="w-full max-w-2xl p-6 rounded-2xl bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 shadow-2xl space-y-4 max-h-[80vh] overflow-y-auto">
        <h3 class="text-sm font-bold text-slate-100 light:text-slate-900">{{ isEditing ? 'Edit Role' : 'Add Role' }}</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Name</label>
            <input v-model="form.name" type="text" required class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Description</label>
            <input v-model="form.description" type="text" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>

          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-2">Permissions</label>
            <div class="space-y-4">
              <div v-for="group in groupedPermissions" :key="group.context" class="border border-slate-800 light:border-slate-200 rounded-xl p-3">
                <div class="text-xs font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider mb-2">{{ group.context }}</div>
                <div class="flex flex-wrap gap-2">
                  <label
                    v-for="perm in group.permissions"
                    :key="perm.key"
                    class="flex items-center gap-1.5 text-xs text-slate-300 light:text-slate-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      :value="perm.key"
                      v-model="form.permissionKeys"
                      class="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200"
                    />
                    {{ perm.action }}
                  </label>
                </div>
              </div>
              <div v-if="systemPermissions.length > 0" class="border border-slate-800 light:border-slate-200 rounded-xl p-3">
                <div class="text-xs font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider mb-2">System</div>
                <div class="flex flex-wrap gap-2">
                  <label
                    v-for="perm in systemPermissions"
                    :key="perm.key"
                    class="flex items-center gap-1.5 text-xs text-slate-300 light:text-slate-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      :value="perm.key"
                      v-model="form.permissionKeys"
                      class="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200"
                    />
                    {{ perm.key }}
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="errorMessage" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{{ errorMessage }}</div>
        <div class="flex justify-end gap-2">
          <button @click="closeModal" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 light:bg-slate-200 text-slate-300 light:text-slate-700 hover:bg-slate-700 light:hover:bg-slate-300 transition">Cancel</button>
          <button @click="saveRole" :disabled="isSubmitting" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50">
            {{ isSubmitting ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Pencil, Trash2 } from '@lucide/vue'
import { listRoles, createRole, updateRole, deleteRole, listAllPermissions, getDefaultCoreApiUrl, type RoleAdmin, type PermissionItem } from '../utils/auth-api'

const roles = ref<RoleAdmin[]>([])
const allPermissions = ref<PermissionItem[]>([])
const showModal = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const isSubmitting = ref(false)
const errorMessage = ref('')
const form = ref({ name: '', description: '', permissionKeys: [] as string[] })

const CONTEXT_ORDER = ['websites', 'pages', 'snippets', 'assets', 'data_objects', 'themes', 'components', 'workflow']
const SYSTEM_KEYS = ['users:manage', 'settings:manage', 'objects:read', 'objects:write', 'objects:publish', 'objects:delete', 'assets:upload', 'assets:delete', 'workflows:manage']

function extractContext(key: string): string | null {
  const parts = key.split(':')
  if (parts.length === 2 && CONTEXT_ORDER.includes(parts[0])) return parts[0]
  return null
}

const groupedPermissions = computed(() => {
  const map = new Map<string, { key: string; action: string }[]>()
  for (const perm of allPermissions.value) {
    const ctx = extractContext(perm.key)
    if (ctx) {
      if (!map.has(ctx)) map.set(ctx, [])
      map.get(ctx)!.push({ key: perm.key, action: perm.key.split(':')[1] })
    }
  }
  return CONTEXT_ORDER.filter((ctx) => map.has(ctx)).map((ctx) => ({ context: ctx, permissions: map.get(ctx)! }))
})

const systemPermissions = computed(() => {
  return allPermissions.value.filter((p) => !extractContext(p.key))
})

async function load() {
  try {
    const [r, p] = await Promise.all([listRoles(getDefaultCoreApiUrl()), listAllPermissions(getDefaultCoreApiUrl())])
    roles.value = r
    allPermissions.value = p
  } catch (e: any) {
    errorMessage.value = e?.message || 'Failed to load'
  }
}

function roleNameColor(name: string): string {
  const map: Record<string, string> = { admin: 'text-red-300', editor: 'text-blue-300', viewer: 'text-emerald-300' }
  return map[name] || 'text-slate-200'
}

function openCreate() {
  isEditing.value = false
  editingId.value = null
  form.value = { name: '', description: '', permissionKeys: [] }
  errorMessage.value = ''
  showModal.value = true
}

function openEdit(role: RoleAdmin) {
  isEditing.value = true
  editingId.value = role.id
  form.value = { name: role.name, description: role.description || '', permissionKeys: [...role.permissionKeys] }
  errorMessage.value = ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

async function saveRole() {
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    if (isEditing.value && editingId.value) {
      await updateRole(getDefaultCoreApiUrl(), editingId.value, { name: form.value.name, description: form.value.description || null, permissionKeys: form.value.permissionKeys })
    } else {
      await createRole(getDefaultCoreApiUrl(), { name: form.value.name, description: form.value.description, permissionKeys: form.value.permissionKeys })
    }
    closeModal()
    await load()
  } catch (e: any) {
    errorMessage.value = e?.message || 'Failed to save role'
  } finally {
    isSubmitting.value = false
  }
}

async function confirmDelete(role: RoleAdmin) {
  if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return
  try {
    await deleteRole(getDefaultCoreApiUrl(), role.id)
    await load()
  } catch (e: any) {
    if (e?.message?.includes('assigned')) {
      errorMessage.value = e.message
    } else {
      errorMessage.value = e?.message || 'Failed to delete role'
    }
  }
}

onMounted(load)
</script>
<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-2 space-y-4">
    <!-- <div>
      <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Outgoing Mail</h3>
      <p class="text-xs text-slate-500 mt-1">
        SMTP config used for Form notification emails (docs/plans/forms/cms-forms.md). One global config, applied to every site.
      </p>
    </div> -->

    <div class="flex gap-1 border-b border-slate-800 light:border-slate-200">
      <button
        v-for="tab in tabs" :key="tab.key"
        type="button"
        class="px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition"
        :class="activeTab === tab.key ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-300 light:text-slate-700'"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="loading" class="text-xs text-slate-500 text-center py-4">Loading…</div>

    <template v-else>
      <!-- Settings -->
      <form v-show="activeTab === 'settings'" @submit.prevent="save" class="grid grid-cols-2 gap-4">
        <label class="col-span-2 flex flex-col gap-1 text-xs text-slate-400">
          Host
          <input v-model="form.host" type="text" required placeholder="smtp.example.com" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
        </label>

        <label class="flex flex-col gap-1 text-xs text-slate-400">
          Port
          <input v-model.number="form.port" type="number" required placeholder="587" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
        </label>

        <label class="flex items-center gap-2 text-xs text-slate-400 self-end pb-2">
          <input v-model="form.secure" type="checkbox" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200" />
          Use TLS (secure)
        </label>

        <label class="flex flex-col gap-1 text-xs text-slate-400">
          User (optional)
          <input v-model="form.user" type="text" placeholder="smtp username" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
        </label>

        <label class="flex flex-col gap-1 text-xs text-slate-400">
          Password {{ existing?.hasPassword ? '(leave blank to keep current)' : '(optional)' }}
          <input v-model="form.password" type="password" placeholder="••••••••" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
        </label>

        <label class="flex flex-col gap-1 text-xs text-slate-400">
          From address
          <input v-model="form.fromAddress" type="email" required placeholder="no-reply@example.com" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
        </label>

        <label class="flex flex-col gap-1 text-xs text-slate-400">
          From name (optional)
          <input v-model="form.fromName" type="text" placeholder="Whoobe CMS" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
        </label>

        <label class="col-span-2 flex items-center gap-2 text-xs text-slate-400">
          <input v-model="form.bccFromAddress" type="checkbox" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200" />
          BCC the from address on every outgoing email (keep a copy of all mail sent)
        </label>

        <div class="col-span-2 flex items-center gap-3 pt-2">
          <button type="submit" :disabled="saving" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
          <span v-if="savedAt" class="text-xs text-emerald-400">Saved.</span>
          <span v-if="error" class="text-xs text-rose-400">{{ error }}</span>
        </div>
      </form>

      <!-- Email Test -->
      <form v-show="activeTab === 'test'" @submit.prevent="sendTest" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <label class="flex flex-col gap-1 text-xs text-slate-400">
            From
            <input v-model="testForm.from" type="text" placeholder="no-reply@example.com" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
          </label>

          <label class="flex flex-col gap-1 text-xs text-slate-400">
            To
            <input v-model="testForm.to" type="text" required placeholder="recipient@example.com" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
          </label>

          <label class="flex flex-col gap-1 text-xs text-slate-400">
            CC
            <input v-model="testForm.cc" type="text" placeholder="cc@example.com" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
          </label>

          <label class="flex flex-col gap-1 text-xs text-slate-400">
            Subject
            <input v-model="testForm.subject" type="text" required placeholder="Test email" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
          </label>

          <label class="col-span-2 flex flex-col gap-1 text-xs text-slate-400">
            Body (text or HTML)
            <textarea v-model="testForm.body" rows="6" required placeholder="Hello, this is a test email…  or <strong>HTML</strong> content" class="w-full px-3 py-2 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800 resize-none font-mono"></textarea>
          </label>
        </div>

        <div class="flex items-center gap-3 pt-2">
          <button type="submit" :disabled="testSending" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white">
            {{ testSending ? 'Sending…' : 'Send Test Email' }}
          </button>
          <span v-if="testResult === 'ok'" class="text-xs text-emerald-400">Sent.</span>
          <span v-if="testError" class="text-xs text-rose-400">{{ testError }}</span>
        </div>
      </form>

      <!-- Mail Log -->
      <div v-show="activeTab === 'log'" class="space-y-4">
        <!-- Toolbar: search / status / order / page size / refresh / delete -->
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model="logSearch"
            type="text"
            placeholder="Search to, subject, status…"
            class="flex-1 min-w-[180px] px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-xs text-slate-200 light:text-slate-800 placeholder:text-slate-500"
          />
          <select v-model="logFilter" @change="resetAndLoad" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-xs text-slate-200 light:text-slate-800">
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
          <select v-model="logOrder" @change="resetAndLoad" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-xs text-slate-200 light:text-slate-800">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <select v-model="logPageSize" @change="resetAndLoad" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-xs text-slate-200 light:text-slate-800">
            <option :value="10">10 / page</option>
            <option :value="25">25 / page</option>
            <option :value="50">50 / page</option>
            <option :value="100">100 / page</option>
          </select>
          <button type="button" @click="loadLog" :disabled="logLoading" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white">
            {{ logLoading ? 'Loading…' : 'Refresh' }}
          </button>
          <button
            type="button"
            :disabled="selectedIds.size === 0 || deleting"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white"
            @click="deleteSelected"
          >
            {{ deleting ? 'Deleting…' : `Delete${selectedIds.size ? ` (${selectedIds.size})` : ''}` }}
          </button>
        </div>
        <div v-if="deleteError" class="text-xs text-rose-400">{{ deleteError }}</div>

        <div v-if="logLoading" class="text-xs text-slate-500 text-center py-4">Loading…</div>
        <div v-else-if="logError" class="text-xs text-rose-400">{{ logError }}</div>
        <div v-else-if="logEntries.length === 0" class="text-xs text-slate-500 text-center py-4">
          <template v-if="logTotal > 0">No results on this page.</template>
          <template v-else>No emails logged yet. Every sendMail() attempt is recorded here once one is made.</template>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-xs text-left">
            <thead class="text-slate-500 border-b border-slate-800 light:border-slate-200">
              <tr>
                <th class="py-2 pr-3">
                  <input
                    type="checkbox"
                    :checked="allPageSelected"
                    :indeterminate="somePageSelected && !allPageSelected"
                    @change="toggleSelectAll"
                    class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200"
                  />
                </th>
                <th class="py-2 pr-3 font-semibold whitespace-nowrap">Sent</th>
                <th class="py-2 pr-3 font-semibold">To</th>
                <th class="py-2 pr-3 font-semibold">Subject</th>
                <th class="py-2 pr-3 font-semibold">Status</th>
                <th class="py-2 pr-3 font-semibold">Detail</th>
                <th class="py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 light:divide-slate-200">
              <tr v-for="entry in logEntries" :key="entry.id">
                <td class="py-2 pr-3">
                  <input
                    type="checkbox"
                    :checked="selectedIds.has(entry.id)"
                    @change="toggleSelect(entry.id)"
                    class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200"
                  />
                </td>
                <td class="py-2 pr-3 text-slate-400 whitespace-nowrap">{{ formatLogTime(entry.sentAt) }}</td>
                <td class="py-2 pr-3 text-slate-300 light:text-slate-700">{{ entry.to }}</td>
                <td class="py-2 pr-3 text-slate-200 light:text-slate-800">{{ entry.subject }}</td>
                <td class="py-2 pr-3">
                  <span :class="entry.status === 'sent' ? 'text-emerald-400' : 'text-rose-400'">{{ entry.status }}</span>
                </td>
                <td class="py-2 pr-3 text-slate-500">{{ entry.error || '—' }}</td>
                <td class="py-2">
                  <button type="button" class="px-2 py-0.5 rounded text-[11px] font-semibold text-indigo-300 hover:bg-indigo-600/20" @click="openPreview(entry)">Preview</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination footer -->
        <div v-if="logTotal > 0" class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>{{ logPageStart }}–{{ logPageEnd }} of {{ logTotal }}</span>
          <div class="flex items-center gap-1">
            <button type="button" :disabled="logPage <= 1 || logLoading" class="px-2 py-1 rounded border border-slate-800 light:border-slate-200 hover:bg-slate-800 light:hover:bg-slate-100 disabled:opacity-40" @click="changePage(logPage - 1)">Prev</button>
            <span class="px-2">{{ logPage }} / {{ logTotalPages }}</span>
            <button type="button" :disabled="logPage >= logTotalPages || logLoading" class="px-2 py-1 rounded border border-slate-800 light:border-slate-200 hover:bg-slate-800 light:hover:bg-slate-100 disabled:opacity-40" @click="changePage(logPage + 1)">Next</button>
          </div>
        </div>
      </div>

      <!-- Mail Templates -->
      <div v-show="activeTab === 'templates'" class="space-y-4">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-slate-500">Reusable email templates referenced by Form notifications. Text templates edit inline; HTML templates open in the embedded Whoobe One editor.</p>
          <button type="button" @click="startNewTemplate" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shrink-0">
            New template
          </button>
        </div>

        <div v-if="templateLoading" class="text-xs text-slate-500 text-center py-4">Loading…</div>
        <div v-else-if="templateError" class="text-xs text-rose-400">{{ templateError }}</div>

        <!-- Edit panel -->
        <div v-else-if="editingId !== '' || creatingNew" class="rounded-xl border border-slate-800 light:border-slate-200 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-semibold text-slate-200 light:text-slate-800">{{ editingId ? 'Edit template' : 'New template' }}</h4>
            <button type="button" class="text-slate-500 hover:text-slate-300 text-lg leading-none" @click="closeTemplateEditor">×</button>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1 text-xs text-slate-400 col-span-2">
              Name
              <input v-model="templateForm.name" type="text" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
            </label>
            <label class="flex flex-col gap-1 text-xs text-slate-400">
              Kind
              <select v-model="templateForm.kind" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800">
                <option value="text">Text</option>
                <option value="html">HTML</option>
              </select>
            </label>
            <label class="flex flex-col gap-1 text-xs text-slate-400">
              Subject (supports {form.field} tokens)
              <input v-model="templateForm.subject" type="text" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" placeholder="New submission from {form.firstname}" />
            </label>
            <label class="flex flex-col gap-1 text-xs text-slate-400">
              To (optional, supports {form.field} tokens)
              <input v-model="templateForm.to" type="text" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" placeholder="{form.email} or team@example.com" />
            </label>
            <label class="flex flex-col gap-1 text-xs text-slate-400">
              BCC / CCN (optional, supports {form.field} tokens)
              <input v-model="templateForm.bcc" type="text" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" placeholder="archive@example.com or {form.email}" />
            </label>
            <label class="flex flex-col gap-1 text-xs text-slate-400 col-span-2">
              Description
              <input v-model="templateForm.description" type="text" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
            </label>
          </div>

          <div v-if="templateForm.kind === 'text'">
            <label class="flex flex-col gap-1 text-xs text-slate-400">
              Body (supports {form.field} tokens)
              <textarea v-model="templateForm.body" rows="8" class="w-full px-3 py-2 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800 resize-none font-mono" placeholder="Hello {form.firstname},&#10;&#10;thank you for contacting us."></textarea>
            </label>
          </div>

          <div v-else>
            <div v-if="!editingId" class="text-xs text-slate-500">Save this template first, then open it in the Whoobe One editor.</div>
            <div v-else class="flex flex-wrap items-center gap-3">
              <button type="button" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white" @click="editorFullscreen = true">Open full-screen editor</button>
              <span class="text-xs text-slate-500">Edit the HTML body in the Whoobe One page editor, then click Save inside the editor to persist it.</span>
            </div>
          </div>

          <div class="flex items-center gap-3 pt-1">
            <button type="button" :disabled="templateSaving" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white" @click="saveTemplate">
              {{ templateSaving ? 'Saving…' : 'Save' }}
            </button>
            <span v-if="templateSaveOk" class="text-xs text-emerald-400">Saved.</span>
            <span v-if="templateSaveError" class="text-xs text-rose-400">{{ templateSaveError }}</span>
          </div>
        </div>

        <!-- List -->
        <div v-else-if="templates.length === 0" class="text-xs text-slate-500 text-center py-4">
          No mail templates yet. Create one to reuse it in Form notifications.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-xs text-left">
            <thead class="text-slate-500 border-b border-slate-800 light:border-slate-200">
              <tr>
                <th class="py-2 pr-3 font-semibold">Name</th>
                <th class="py-2 pr-3 font-semibold">Kind</th>
                <th class="py-2 pr-3 font-semibold">Subject</th>
                <th class="py-2 pr-3 font-semibold">To</th>
                <th class="py-2 pr-3 font-semibold">BCC</th>
                <th class="py-2 pr-3 font-semibold">Updated</th>
                <th class="py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 light:divide-slate-200">
              <tr v-for="t in templates" :key="t.id">
                <td class="py-2 pr-3 text-slate-200 light:text-slate-800">{{ t.name }}</td>
                <td class="py-2 pr-3">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase" :class="t.kind === 'html' ? 'text-indigo-300 bg-indigo-600/20' : 'text-slate-300 bg-slate-700/40'">{{ t.kind }}</span>
                </td>
                <td class="py-2 pr-3 text-slate-300 light:text-slate-700">{{ t.subject || '—' }}</td>
                <td class="py-2 pr-3 text-slate-300 light:text-slate-700">{{ t.to || '—' }}</td>
                <td class="py-2 pr-3 text-slate-300 light:text-slate-700">{{ t.bcc || '—' }}</td>
                <td class="py-2 pr-3 text-slate-400 whitespace-nowrap">{{ formatLogTime(t.updatedAt) }}</td>
                <td class="py-2 flex items-center gap-2">
                  <button type="button" class="px-2 py-0.5 rounded text-[11px] font-semibold text-indigo-300 hover:bg-indigo-600/20" @click="editTemplate(t.id)">Edit</button>
                  <button type="button" class="px-2 py-0.5 rounded text-[11px] font-semibold text-rose-400 hover:bg-rose-600/20" @click="removeTemplate(t)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>

  <!-- Mail preview modal -->
  <div v-if="previewOpen" class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center p-4" @click.self="closePreview">
    <div class="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 light:bg-white border border-slate-700 light:border-slate-200 shadow-xl overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3 border-b border-slate-800 light:border-slate-200">
        <div class="min-w-0">
          <h4 class="text-sm font-semibold text-slate-100 light:text-slate-900 truncate">{{ previewEntry?.subject }}</h4>
          <p class="text-xs text-slate-500">{{ previewEntry?.status }} · {{ previewEntry ? formatLogTime(previewEntry.sentAt) : '' }}</p>
        </div>
        <button type="button" class="text-slate-500 hover:text-slate-300 text-lg leading-none" @click="closePreview">×</button>
      </div>

      <div v-if="previewLoading" class="text-xs text-slate-500 text-center py-10">Loading…</div>
      <div v-else-if="previewError" class="text-xs text-rose-400 text-center py-10">{{ previewError }}</div>
      <template v-else-if="previewEntry">
        <div class="px-5 py-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs border-b border-slate-800 light:border-slate-200">
          <div><span class="text-slate-500">To:</span> <span class="text-slate-200 light:text-slate-800">{{ previewEntry.to }}</span></div>
          <div><span class="text-slate-500">From:</span> <span class="text-slate-200 light:text-slate-800">{{ previewEntry.from || '—' }}</span></div>
          <div><span class="text-slate-500">CC:</span> <span class="text-slate-200 light:text-slate-800">{{ previewEntry.cc || '—' }}</span></div>
          <div><span class="text-slate-500">Status:</span> <span :class="previewEntry.status === 'sent' ? 'text-emerald-400' : 'text-rose-400'">{{ previewEntry.status }}</span></div>
        </div>
        <div v-if="previewEntry.error" class="px-5 py-2 text-xs text-rose-400 border-b border-slate-800 light:border-slate-200">{{ previewEntry.error }}</div>
        <div class="flex-1 min-h-0 overflow-auto bg-slate-950 light:bg-slate-50">
          <iframe v-if="previewEntry.html" :srcdoc="previewEntry.html" sandbox="" class="w-full h-96 bg-white border-0"></iframe>
          <pre v-else-if="previewEntry.text" class="whitespace-pre-wrap text-xs text-slate-200 light:text-slate-800 p-4 font-mono">{{ previewEntry.text }}</pre>
          <p v-else class="text-xs text-slate-500 p-4">No body stored for this entry.</p>
        </div>
        <div class="flex items-center gap-3 px-5 py-3 border-t border-slate-800 light:border-slate-200">
          <button type="button" :disabled="resending" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white" @click="resend">
            {{ resending ? 'Resending…' : 'Resend' }}
          </button>
          <span v-if="resendResult" class="text-xs text-emerald-400">{{ resendResult }}</span>
          <span v-if="resendError" class="text-xs text-rose-400">{{ resendError }}</span>
          <span class="flex-1"></span>
          <button type="button" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 light:bg-slate-200 text-slate-200 light:text-slate-800 hover:bg-slate-700 light:hover:bg-slate-300" @click="closePreview">Close</button>
        </div>
    </template>
  </div>
  </div>

  <!-- Full-screen Whoobe One editor for HTML mail templates -->
  <div v-if="editorFullscreen" class="fixed inset-0 z-[10000] bg-slate-950 flex flex-col">
    <div class="shrink-0 flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
      <span class="text-sm font-semibold text-slate-100">{{ templateForm.name || 'Mail template' }} — HTML editor</span>
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-500 hidden sm:inline">Save inside the editor, then close.</span>
        <button type="button" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white" @click="editorFullscreen = false">Close editor</button>
      </div>
    </div>
    <div class="flex-1 min-h-0">
      <MailTemplateEditorEmbed :template-id="editingId" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import { fetchMailSettings, saveMailSettings, sendTestMail, fetchMailLog, fetchMailLogEntry, resendMail, deleteMailLogEntries, type MailSettingsRecord, type MailLogEntry } from '../../utils/mail-settings-api'
import { fetchMailTemplates, fetchMailTemplate, createMailTemplate, updateMailTemplate, deleteMailTemplate, type MailTemplateSummary } from '../../utils/mail-templates-api'
import MailTemplateEditorEmbed from './MailTemplateEditorEmbed.vue'

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const savedAt = ref(false)
const existing = ref<MailSettingsRecord | null>(null)

const tabs: { key: 'settings' | 'test' | 'log' | 'templates'; label: string }[] = [
  { key: 'settings', label: 'Settings' },
  { key: 'test', label: 'Email Test' },
  { key: 'log', label: 'Mail Log' },
  { key: 'templates', label: 'Templates' },
]
const activeTab = ref<'settings' | 'test' | 'log' | 'templates'>('settings')

const logLoading = ref(false)
const logError = ref('')
const logFilter = ref<'sent' | 'failed' | ''>('')
const logOrder = ref<'newest' | 'oldest'>('newest')
const logSearch = ref('')
const logPageSize = ref(25)
const logPage = ref(1)
const logTotal = ref(0)
const logEntries = ref<MailLogEntry[]>([])
const selectedIds = ref<Set<string>>(new Set())
const deleting = ref(false)
const deleteError = ref('')

const logTotalPages = computed(() => Math.max(1, Math.ceil(logTotal.value / logPageSize.value)))
const logPageStart = computed(() => (logTotal.value === 0 ? 0 : (logPage.value - 1) * logPageSize.value + 1))
const logPageEnd = computed(() => Math.min(logTotal.value, logPage.value * logPageSize.value))
const allPageSelected = computed(() => logEntries.value.length > 0 && logEntries.value.every((e) => selectedIds.value.has(e.id)))
const somePageSelected = computed(() => logEntries.value.some((e) => selectedIds.value.has(e.id)))

async function loadLog() {
  logLoading.value = true
  logError.value = ''
  try {
    const result = await fetchMailLog(getDefaultCoreApiUrl(), {
      status: logFilter.value || undefined,
      search: logSearch.value.trim() || undefined,
      order: logOrder.value,
      limit: logPageSize.value,
      offset: (logPage.value - 1) * logPageSize.value,
    })
    logEntries.value = result.records
    logTotal.value = result.total
    // Drop selections for entries that no longer exist (deleted or
    // filtered out since they were picked).
    const next = new Set<string>()
    for (const id of selectedIds.value) {
      if (logEntries.value.some((e) => e.id === id)) next.add(id)
    }
    selectedIds.value = next
  } catch (e: any) {
    logError.value = e?.message || 'Failed to load mail log'
  } finally {
    logLoading.value = false
  }
}

function resetAndLoad() {
  logPage.value = 1
  loadLog()
}

function changePage(page: number) {
  const clamped = Math.min(Math.max(page, 1), logTotalPages.value)
  if (clamped === logPage.value) return
  logPage.value = clamped
  loadLog()
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleSelectAll() {
  const next = new Set(selectedIds.value)
  if (allPageSelected.value) {
    logEntries.value.forEach((e) => next.delete(e.id))
  } else {
    logEntries.value.forEach((e) => next.add(e.id))
  }
  selectedIds.value = next
}

async function deleteSelected() {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return
  const noun = ids.length === 1 ? 'entry' : 'entries'
  if (!window.confirm(`Delete ${ids.length} log ${noun}? This cannot be undone.`)) return
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteMailLogEntries(getDefaultCoreApiUrl(), ids)
    selectedIds.value = new Set()
    await loadLog()
    // If we just cleared the last page of results, step back one page.
    if (logEntries.value.length === 0 && logPage.value > 1 && logTotal.value > 0) {
      logPage.value -= 1
      await loadLog()
    }
  } catch (e: any) {
    deleteError.value = e?.message || 'Failed to delete log entries'
  } finally {
    deleting.value = false
  }
}

// Debounced server-side search across to/subject/status.
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(logSearch, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    logPage.value = 1
    loadLog()
  }, 300)
})

function formatLogTime(sentAt: string): string {
  return new Date(sentAt).toLocaleString()
}

const previewOpen = ref(false)
const previewLoading = ref(false)
const previewError = ref('')
const previewEntry = ref<MailLogEntry | null>(null)
const resending = ref(false)
const resendResult = ref('')
const resendError = ref('')

async function openPreview(entry: MailLogEntry) {
  previewOpen.value = true
  previewLoading.value = true
  previewError.value = ''
  previewEntry.value = null
  resendResult.value = ''
  resendError.value = ''
  try {
    previewEntry.value = await fetchMailLogEntry(getDefaultCoreApiUrl(), entry.id)
  } catch (e: any) {
    previewError.value = e?.message || 'Failed to load email'
  } finally {
    previewLoading.value = false
  }
}

function closePreview() {
  previewOpen.value = false
  previewEntry.value = null
}

async function resend() {
  if (!previewEntry.value) return
  resending.value = true
  resendResult.value = ''
  resendError.value = ''
  try {
    await resendMail(getDefaultCoreApiUrl(), previewEntry.value.id)
    resendResult.value = 'Re-sent. The resend is logged as its own entry.'
    loadLog()
  } catch (e: any) {
    resendError.value = e?.message || 'Failed to resend email'
  } finally {
    resending.value = false
  }
}

const testSending = ref(false)
const testResult = ref<'ok' | null>(null)
const testError = ref('')
const testForm = reactive({
  from: '',
  to: '',
  cc: '',
  subject: '',
  body: '',
})

const templates = ref<MailTemplateSummary[]>([])
const templateLoading = ref(false)
const templateError = ref('')
const editingId = ref('')
const creatingNew = ref(false)
const editorFullscreen = ref(false)
const templateSaving = ref(false)
const templateSaveOk = ref(false)
const templateSaveError = ref('')
const templateForm = reactive({
  name: '',
  kind: 'text' as 'text' | 'html',
  subject: '',
  to: '',
  bcc: '',
  description: '',
  body: '',
})

async function loadTemplates() {
  templateLoading.value = true
  templateError.value = ''
  try {
    templates.value = await fetchMailTemplates(getDefaultCoreApiUrl())
  } catch (e: any) {
    templateError.value = e?.message || 'Failed to load mail templates'
  } finally {
    templateLoading.value = false
  }
}

function startNewTemplate() {
  creatingNew.value = true
  editingId.value = ''
  templateSaveOk.value = false
  templateSaveError.value = ''
  templateForm.name = ''
  templateForm.kind = 'text'
  templateForm.subject = ''
  templateForm.to = ''
  templateForm.bcc = ''
  templateForm.description = ''
  templateForm.body = ''
}

async function editTemplate(id: string) {
  creatingNew.value = false
  templateSaveOk.value = false
  templateSaveError.value = ''
  try {
    const t = await fetchMailTemplate(getDefaultCoreApiUrl(), id)
    editingId.value = t.id
    templateForm.name = t.name
    templateForm.kind = t.kind
    templateForm.subject = t.subject ?? ''
    templateForm.to = t.to ?? ''
    templateForm.bcc = t.bcc ?? ''
    templateForm.description = t.description ?? ''
    templateForm.body = t.body ?? ''
  } catch (e: any) {
    templateError.value = e?.message || 'Failed to load mail template'
  }
}

function closeTemplateEditor() {
  editorFullscreen.value = false
  editingId.value = ''
  creatingNew.value = false
  loadTemplates()
}

async function saveTemplate() {
  if (!templateForm.name.trim()) {
    templateSaveError.value = 'Name is required'
    return
  }
  templateSaving.value = true
  templateSaveOk.value = false
  templateSaveError.value = ''
  try {
    const payload = {
      name: templateForm.name.trim(),
      kind: templateForm.kind,
      subject: templateForm.subject.trim() || null,
      to: templateForm.to.trim() || null,
      bcc: templateForm.bcc.trim() || null,
      description: templateForm.description.trim() || null,
    }
    if (editingId.value) {
      await updateMailTemplate(getDefaultCoreApiUrl(), editingId.value, {
        ...payload,
        body: templateForm.kind === 'text' ? templateForm.body : undefined,
      })
    } else {
      const created = await createMailTemplate(getDefaultCoreApiUrl(), {
        ...payload,
        body: templateForm.kind === 'text' ? templateForm.body : null,
      })
      editingId.value = created.id
      creatingNew.value = false
    }
    templateSaveOk.value = true
    loadTemplates()
  } catch (e: any) {
    templateSaveError.value = e?.message || 'Failed to save mail template'
  } finally {
    templateSaving.value = false
  }
}

async function removeTemplate(t: MailTemplateSummary) {
  if (!window.confirm(`Delete mail template "${t.name}"?`)) return
  try {
    await deleteMailTemplate(getDefaultCoreApiUrl(), t.id)
    if (editingId.value === t.id) {
      editingId.value = ''
      creatingNew.value = false
      editorFullscreen.value = false
    }
    loadTemplates()
  } catch (e: any) {
    templateError.value = e?.message || 'Failed to delete mail template'
  }
}

const form = reactive({
  host: '',
  port: 587,
  secure: false,
  user: '',
  password: '',
  fromAddress: '',
  fromName: '',
  bccFromAddress: false,
})

onMounted(async () => {
  try {
    const settings = await fetchMailSettings(getDefaultCoreApiUrl())
    existing.value = settings
    if (settings) {
      form.host = settings.host
      form.port = settings.port
      form.secure = settings.secure
      form.user = settings.user ?? ''
      form.fromAddress = settings.fromAddress
      form.fromName = settings.fromName ?? ''
      form.bccFromAddress = settings.bccFromAddress
      // Default the test sender to the configured from address.
      testForm.from = settings.fromAddress
    }
  } catch (e: any) {
    error.value = e?.message || 'Failed to load mail settings'
  } finally {
    loading.value = false
  }
  loadTemplates()
})

async function save() {
  saving.value = true
  error.value = ''
  savedAt.value = false
  try {
    const updated = await saveMailSettings(getDefaultCoreApiUrl(), {
      host: form.host,
      port: form.port,
      secure: form.secure,
      user: form.user || null,
      // Blank means "leave as-is" - the server never received the real
      // password back to resubmit, so an empty field must not be sent as
      // an intent to clear it.
      password: form.password || undefined,
      fromAddress: form.fromAddress,
      fromName: form.fromName || null,
      bccFromAddress: form.bccFromAddress,
    })
    existing.value = updated
    form.password = ''
    savedAt.value = true
  } catch (e: any) {
    error.value = e?.message || 'Failed to save mail settings'
  } finally {
    saving.value = false
  }
}

async function sendTest() {
  testSending.value = true
  testResult.value = null
  testError.value = ''
  try {
    const body = testForm.body.trim()
    if (!body) {
      testError.value = 'Body is required'
      return
    }
    // HTML-looking content goes as html, otherwise as plain text.
    const looksLikeHtml = /<[a-z/][^>]*>/i.test(body)
    await sendTestMail(getDefaultCoreApiUrl(), {
      from: testForm.from.trim() || undefined,
      to: testForm.to.trim(),
      cc: testForm.cc.trim() || undefined,
      subject: testForm.subject.trim(),
      html: looksLikeHtml ? body : undefined,
      text: looksLikeHtml ? undefined : body,
    })
    testResult.value = 'ok'
    loadLog()
  } catch (e: any) {
    testError.value = e?.message || 'Failed to send test email'
  } finally {
    testSending.value = false
  }
}
</script>

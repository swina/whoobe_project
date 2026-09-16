<template>
  <div class="space-y-6">
    <!-- Gateway Info Card -->
    <div class="rounded-2xl border border-slate-800 light:border-slate-200 bg-slate-900/40 light:bg-slate-50 p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800">API Gateway</h3>
          <span v-if="gatewayStatus === true" class="flex items-center gap-1 text-xs text-emerald-400">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span> Online
          </span>
          <span v-else-if="gatewayStatus === false" class="flex items-center gap-1 text-xs text-amber-400" title="Start the gateway with: pnpm --filter @whoobe-cms/gateway dev">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span> Unreachable
          </span>
          <span v-else class="text-xs text-slate-500">Checking ...</span>
        </div>
        <button @click="checkHealth" class="text-xs text-indigo-400 hover:text-indigo-300 transition" title="Check gateway health">
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': checkingHealth }" />
        </button>
      </div>
      <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        <div class="flex gap-2">
          <span class="text-slate-500">Gateway URL:</span>
          <span class="text-slate-300 light:text-slate-700 font-mono">{{ gatewayUrl }}</span>
        </div>
        <div class="flex gap-2">
          <span class="text-slate-500">Proxies to:</span>
          <span class="text-slate-300 light:text-slate-700 font-mono">{{ upstreamInfo.coreApi }}</span>
        </div>
        <div class="flex gap-2">
          <span class="text-slate-500">Default Rate Limit:</span>
          <span class="text-slate-300 light:text-slate-700">{{ defaultRateLimit }} req/s</span>
        </div>
        <div class="flex gap-2">
          <span class="text-slate-500">Internal Routes:</span>
          <span class="text-slate-300 light:text-slate-700"><code class="text-indigo-400">/api/internal/*</code> → core-api, <code class="text-indigo-400">/dam/*</code> → asset-processor, <code class="text-indigo-400">/public/*</code> → core-api (no auth)</span>
        </div>
      </div>
      <div v-if="healthInfo" class="text-xs text-slate-500 border-t border-slate-800/50 light:border-slate-200/50 pt-2 mt-1">
        Health: {{ healthInfo.status }} · Uptime: {{ Math.floor(healthInfo.uptimeSeconds) }}s · {{ healthInfo.timestamp }}
      </div>
    </div>

    <!-- Remote Endpoints -->
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800">Remote Endpoints</h3>
        <p class="text-xs text-slate-500">{{ endpoints.length }} endpoint(s) — each endpoint is an external API the gateway proxies to</p>
      </div>
      <div class="flex items-center gap-2">
        <button @click="loadAll" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 light:bg-slate-200 text-slate-300 light:text-slate-700 hover:bg-slate-700 light:hover:bg-slate-300 transition flex items-center gap-1.5">
          <RefreshCw class="w-3.5 h-3.5" />
          Refresh
        </button>
        <button @click="openCreate" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5">
          <Plus class="w-3.5 h-3.5" />
          Add Endpoint
        </button>
      </div>
    </div>

    <!-- Endpoints list -->
    <div class="space-y-3">
      <div v-for="ep in endpoints" :key="ep.id" class="rounded-2xl border border-slate-800 light:border-slate-200 overflow-hidden">
        <!-- Endpoint header row -->
        <div class="flex items-center justify-between px-4 py-3 bg-slate-900/60 light:bg-slate-50 cursor-pointer hover:bg-slate-800/60 light:hover:bg-slate-100/60 transition" @click="toggleExpand(ep.id)">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <ChevronRight class="w-4 h-4 text-slate-500 transition-transform" :class="{ 'rotate-90': expandedId === ep.id }" />
              <span class="text-sm font-medium text-slate-200 light:text-slate-800 truncate">{{ ep.name }}</span>
              <span :class="['px-2 py-0.5 rounded-full text-xs font-medium', authBadgeClass(ep.authType)]">{{ ep.authType }}</span>
              <span :class="[ep.isActive ? 'text-emerald-400' : 'text-rose-400', 'text-xs']">{{ ep.isActive ? 'Active' : 'Inactive' }}</span>
            </div>
          </div>
          <div class="flex items-center gap-2" @click.stop>
            <button @click="openEdit(ep)" class="text-indigo-400 hover:text-indigo-300 transition p-1" title="Edit">
              <Pencil class="w-3.5 h-3.5" />
            </button>
            <button @click="confirmDelete(ep)" class="text-rose-400 hover:text-rose-300 transition p-1" title="Delete">
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Endpoint details + routes (expandable) -->
        <div v-if="expandedId === ep.id" class="border-t border-slate-800 light:border-slate-200">
          <div class="px-4 py-3 bg-slate-950/40 light:bg-white/40 space-y-1.5 text-xs">
            <div class="flex gap-3">
              <span class="text-slate-500 w-16 shrink-0">URL:</span>
              <span class="text-slate-300 light:text-slate-700 break-all">{{ ep.baseUrl }}</span>
            </div>
            <div v-if="ep.description" class="flex gap-3">
              <span class="text-slate-500 w-16 shrink-0">Desc:</span>
              <span class="text-slate-400">{{ ep.description }}</span>
            </div>
            <div class="flex gap-3">
              <span class="text-slate-500 w-16 shrink-0">Rate Limit:</span>
              <span class="text-slate-400">{{ ep.rateLimitRps > 0 ? ep.rateLimitRps + ' req/s' : 'Unlimited' }}</span>
            </div>
            <div class="flex gap-2 pt-1">
              <button @click="openSendRequestForEndpoint(ep)" class="text-xs text-amber-400 hover:text-amber-300 transition flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/50 hover:bg-slate-800">
                <Send class="w-3 h-3" /> Send Request
              </button>
            </div>
          </div>

          <!-- Routes for this endpoint -->
          <div class="border-t border-slate-800 light:border-slate-200">
            <div class="px-4 py-2 flex items-center justify-between bg-slate-900/30 light:bg-slate-50/30">
              <span class="text-xs text-slate-500">Routes</span>
              <button @click="openCreateRoute(ep)" class="text-xs text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1">
                <Plus class="w-3 h-3" /> Add Route
              </button>
            </div>

            <div v-if="routesByEndpoint[ep.id]?.length" class="divide-y divide-slate-800/50 light:divide-slate-200/50">
              <div v-for="route in routesByEndpoint[ep.id]" :key="route.id" class="flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/30 light:hover:bg-slate-100/30">
                <div class="flex items-center gap-3 min-w-0">
                  <span :class="['px-2 py-0.5 rounded text-xs font-mono font-bold shrink-0', methodBadgeClass(route.method)]">{{ route.method }}</span>
                  <span class="text-xs font-mono text-slate-200 light:text-slate-800 truncate">{{ route.path }}</span>
                  <span v-if="route.description" class="text-xs text-slate-500 truncate hidden sm:inline">{{ route.description }}</span>
                  <span v-if="route.responseSchemaId" class="text-xs text-emerald-500 shrink-0">schema</span>
                  <span v-else class="text-xs text-slate-600 shrink-0">no schema</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button @click="testRoute(route)" :disabled="testingId === route.id" class="text-emerald-500 hover:text-emerald-400 transition p-1" title="Test & Infer Schema">
                    <TestTube v-if="testingId !== route.id" class="w-3.5 h-3.5" />
                    <Loader v-else class="w-3.5 h-3.5 animate-spin" />
                  </button>
                  <button @click="openSendRequest(ep, route)" class="text-amber-500 hover:text-amber-400 transition p-1" title="Send Request">
                    <Send class="w-3.5 h-3.5" />
                  </button>
                  <button @click="viewRouteSchema(route)" class="text-sky-400 hover:text-sky-300 transition p-1" title="View Schema">
                    <FileJson class="w-3.5 h-3.5" />
                  </button>
                  <button @click="editRoute(ep, route)" class="text-indigo-400 hover:text-indigo-300 transition p-1" title="Edit Route">
                    <Pencil class="w-3.5 h-3.5" />
                  </button>
                  <button @click="confirmDeleteRoute(route)" class="text-rose-400 hover:text-rose-300 transition p-1" title="Delete Route">
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="px-4 py-3 text-center text-xs text-slate-600">No routes configured. Add one to define the API path.</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!endpoints.length && !loading" class="text-center py-12 text-slate-500 text-xs">No endpoints configured. Add one to connect an external API.</div>

    <!-- Schema Viewer Modal -->
    <div v-if="showSchemaModal && schemaData" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="showSchemaModal = false">
      <div class="w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6 rounded-2xl bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 shadow-2xl space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-slate-100 light:text-slate-900">Inferred Schema</h3>
          <button @click="refreshRouteSchema(schemaRouteId)" class="text-xs text-emerald-400 hover:text-emerald-300 transition">Refresh</button>
        </div>
        <pre class="text-xs text-slate-300 light:text-slate-700 bg-slate-950 light:bg-slate-50 p-4 rounded-xl overflow-x-auto max-h-96 overflow-y-auto">{{ JSON.stringify(schemaData, null, 2) }}</pre>
        <div class="flex justify-end">
          <button @click="showSchemaModal = false" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 light:bg-slate-200 text-slate-300 light:text-slate-700 hover:bg-slate-700 light:hover:bg-slate-300 transition">Close</button>
        </div>
      </div>
    </div>

    <!-- Send Request Modal -->
    <div v-if="showSendModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="closeSendModal">
      <div class="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 shadow-2xl space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-slate-100 light:text-slate-900">Send Request to {{ sendEndpointName }}</h3>
          <button @click="closeSendModal" class="text-slate-400 hover:text-slate-300 transition"><X class="w-5 h-5" /></button>
        </div>

        <div v-if="sendRoutes.length === 0" class="px-3 py-4 rounded-lg bg-amber-950/40 border border-amber-800 text-amber-300 text-xs text-center">
          No routes configured for this endpoint. <button @click="closeSendModal" class="text-indigo-400 hover:text-indigo-300 underline">Add a route</button>, then send requests.
        </div>

        <template v-if="sendRoutes.length > 0">
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Route</label>
            <select v-model="sendSelectedRouteIndex" @change="onSendRouteChange; onParamValueChange()" class="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500">
              <option v-for="(r, i) in sendRoutes" :key="r.id" :value="i">
                {{ r.method }} {{ r.path }}{{ r.description ? ' — ' + r.description : '' }}
              </option>
            </select>
          </div>

          <div class="text-xs text-slate-400 bg-slate-950/60 light:bg-slate-50 px-3 py-2 rounded-lg break-all font-mono">{{ sendResolvedUrl }}</div>

          <!-- Dynamic params -->
          <div v-if="sendDynamicParams.length > 0" class="grid grid-cols-2 gap-3">
            <div v-for="param in sendDynamicParams" :key="param">
              <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">{{ param }}</label>
              <input v-model="sendParamValues[param]" type="text" @input="onParamValueChange" :placeholder="'Value for {' + param + '}'" class="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          <div v-if="sendMethod !== 'GET'">
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Request Body (JSON)</label>
            <textarea v-model="sendBodyText" rows="6" class="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" placeholder='{ "key": "value" }'></textarea>
          </div>

          <div v-if="sendError" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{{ sendError }}</div>

          <div class="flex justify-end gap-2">
            <button @click="closeSendModal" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 light:bg-slate-200 text-slate-300 light:text-slate-700 hover:bg-slate-700 light:hover:bg-slate-300 transition">Close</button>
            <button @click="sendRequest" :disabled="sendingRequest || !sendRouteId" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-1.5 disabled:opacity-50">
              <Send class="w-3.5 h-3.5" />
              {{ sendingRequest ? 'Sending...' : 'Send' }}
            </button>
          </div>

          <!-- Response -->
          <div v-if="sendResponse" class="border-t border-slate-800 light:border-slate-200 pt-4 space-y-3">
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-2">
                <h4 class="text-xs font-semibold text-slate-300 light:text-slate-700">Response</h4>
                <span v-if="sendResponse.error" class="text-rose-400 text-xs">(gateway error)</span>
              </div>
              <span :class="['px-2 py-0.5 rounded text-xs font-mono font-bold', statusBadgeClass(sendResponse.upstreamStatus)]">{{ sendResponse.upstreamStatus || 'ERR' }}</span>
              <span class="text-xs text-slate-500">{{ formatTime }}ms</span>
            </div>
            <div v-if="sendResponse.headers && Object.keys(sendResponse.headers).length" class="space-y-0.5">
              <span class="text-xs text-slate-500 font-medium">Headers</span>
              <div class="text-xs text-slate-400 font-mono bg-slate-950 light:bg-slate-50 p-2 rounded-lg max-h-32 overflow-y-auto">
                <div v-for="(v, k) in sendResponse.headers" :key="k" class="truncate"><span class="text-indigo-400">{{ k }}</span>: {{ v }}</div>
              </div>
            </div>
            <div>
              <span class="text-xs text-slate-500 font-medium">Body</span>
              <pre class="text-xs text-slate-300 light:text-slate-700 bg-slate-950 light:bg-slate-50 p-3 rounded-xl overflow-x-auto max-h-64 overflow-y-auto mt-1">{{ formatBody(sendResponse.body) }}</pre>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Create/Edit Endpoint Modal -->
    <div v-if="showEndpointModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="closeEndpointModal">
      <div class="w-full max-w-lg p-6 rounded-2xl bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 shadow-2xl space-y-4">
        <h3 class="text-sm font-bold text-slate-100 light:text-slate-900">{{ isEditingEndpoint ? 'Edit Endpoint' : 'Add Endpoint' }}</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Name</label>
            <input v-model="epForm.name" type="text" required class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Description</label>
            <input v-model="epForm.description" type="text" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Base URL</label>
            <input v-model="epForm.baseUrl" type="url" placeholder="https://api.example.com/v1" required class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Auth Type</label>
            <select v-model="epForm.authType" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500">
              <option value="none">None</option>
              <option value="api-key">API Key</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth</option>
            </select>
            <p v-if="isEditingEndpoint && epForm.authType !== 'none'" class="text-[11px] text-slate-500 mt-1">
              Stored credentials aren't shown here - leave a field blank to keep its current value, or fill it in to replace it.
            </p>
          </div>
          <div v-if="epForm.authType === 'api-key'">
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">API Key Header</label>
            <input v-model="epForm.authConfig.keyHeader" type="text" placeholder="X-API-Key" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1 mt-2">API Key Value</label>
            <input v-model="epForm.authConfig.keyValue" type="password" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div v-if="epForm.authType === 'bearer'">
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Bearer Token</label>
            <input v-model="epForm.authConfig.token" type="password" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div v-if="epForm.authType === 'basic'">
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Username</label>
            <input v-model="epForm.authConfig.username" type="text" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1 mt-2">Password</label>
            <input v-model="epForm.authConfig.password" type="password" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Rate Limit (requests/sec)</label>
            <input v-model.number="epForm.rateLimitRps" type="number" min="0" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <label class="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input type="checkbox" v-model="epForm.isActive" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200" />
            Active
          </label>
        </div>
        <div v-if="errorMsg" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{{ errorMsg }}</div>
        <div class="flex justify-end gap-2">
          <button @click="closeEndpointModal" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 light:bg-slate-200 text-slate-300 light:text-slate-700 hover:bg-slate-700 light:hover:bg-slate-300 transition">Cancel</button>
          <button @click="saveEndpoint" :disabled="epSubmitting" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50">
            {{ epSubmitting ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Create/Edit Route Modal -->
    <div v-if="showRouteModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="closeRouteModal">
      <div class="w-full max-w-lg p-6 rounded-2xl bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 shadow-2xl space-y-4">
        <h3 class="text-sm font-bold text-slate-100 light:text-slate-900">{{ isEditingRoute ? 'Edit Route' : 'Add Route' }}</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Method</label>
            <select v-model="routeForm.method" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500">
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Path</label>
            <input v-model="routeForm.path" type="text" placeholder="products.json" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Description</label>
            <input v-model="routeForm.description" type="text" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <label class="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input type="checkbox" v-model="routeForm.autoUpdateSchema" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200" />
            Auto-update schema on each request
          </label>
        </div>
        <div v-if="routeError" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{{ routeError }}</div>
        <div class="flex justify-end gap-2">
          <button @click="closeRouteModal" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 light:bg-slate-200 text-slate-300 light:text-slate-700 hover:bg-slate-700 light:hover:bg-slate-300 transition">Cancel</button>
          <button @click="saveRoute" :disabled="routeSubmitting" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50">
            {{ routeSubmitting ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Plus, Pencil, Trash2, ChevronRight, RefreshCw, TestTube, Loader, FileJson, Send, X } from '@lucide/vue'
import {
  listEndpoints, getEndpoint, createEndpoint, updateEndpoint, deleteEndpoint,
  listRoutes, createRoute, updateRoute, deleteRoute,
  testRoute as testRouteApi, getRouteSchema, refreshSchema,
  getDefaultGatewayUrl, getDefaultGatewayUpstreams, getDefaultGatewayRateLimit,
  executeRoute,
  type GatewayEndpoint, type GatewayRoute,
} from '../utils/gateway-api'

// Gateway info
const gatewayUrl = getDefaultGatewayUrl()
const defaultRateLimit = getDefaultGatewayRateLimit()
const upstreamInfo = getDefaultGatewayUpstreams()
const gatewayStatus = ref<boolean | null>(null)
const healthInfo = ref<{ status: string; uptimeSeconds: number; timestamp: string } | null>(null)
const checkingHealth = ref(false)

async function checkHealth() {
  checkingHealth.value = true
  try {
    const res = await fetch(`${gatewayUrl}/health`)
    const data = await res.json()
    gatewayStatus.value = data.status === 'ok'
    healthInfo.value = data
  } catch {
    gatewayStatus.value = false
    healthInfo.value = null
  } finally {
    checkingHealth.value = false
  }
}

const endpoints = ref<GatewayEndpoint[]>([])
const loading = ref(false)
const errorMsg = ref('')
const routeError = ref('')

const expandedId = ref<string | null>(null)
const routesByEndpoint = ref<Record<string, GatewayRoute[]>>({})
const testingId = ref<string | null>(null)

const showSchemaModal = ref(false)
const schemaData = ref<any>(null)
const schemaRouteId = ref<string>('')

// Send request modal
const showSendModal = ref(false)
const sendEndpointId = ref('')
const sendEndpointName = ref('')
const sendEndpointBaseUrl = ref('')
const sendRoutes = ref<GatewayRoute[]>([])
const sendSelectedRouteIndex = ref(0)
const sendRouteId = ref('')
const sendMethod = ref('GET')
const sendPath = ref('')
const sendUrl = ref('')
const sendBodyText = ref('{}')
const sendError = ref('')
const sendingRequest = ref(false)
const sendResponse = ref<{ error: boolean; upstreamStatus: number; headers: Record<string, string>; body: unknown } | null>(null)
const sendStartTime = ref(0)
const formatTime = ref(0)
const sendDynamicParams = ref<string[]>([])
const sendParamValues = ref<Record<string, string>>({})
const sendResolvedUrl = ref('')

function extractParams(path: string): string[] {
  const params: string[] = []
  const regex = /\{(\w+)\}/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(path)) !== null) params.push(m[1])
  return params
}

function resolveUrl(baseUrl: string, path: string, params: Record<string, string>): string {
  let resolved = `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\//, '')}`
  for (const [k, v] of Object.entries(params)) {
    resolved = resolved.replace(`{${k}}`, encodeURIComponent(v || ''))
  }
  return resolved
}

function applySendRoute(route: GatewayRoute) {
  sendRouteId.value = route.id
  sendMethod.value = route.method
  sendPath.value = route.path
  const extracted = extractParams(route.path)
  sendDynamicParams.value = extracted
  if (extracted.length > 0) {
    const vals: Record<string, string> = {}
    for (const p of extracted) vals[p] = sendParamValues.value[p] || ''
    sendParamValues.value = vals
  } else {
    sendParamValues.value = {}
  }
  sendUrl.value = resolveUrl(sendEndpointBaseUrl.value, route.path, sendParamValues.value)
  sendResolvedUrl.value = sendUrl.value
}

function openSendRequest(ep: GatewayEndpoint, route: GatewayRoute) {
  sendEndpointId.value = ep.id
  sendEndpointName.value = ep.name
  sendEndpointBaseUrl.value = ep.baseUrl
  sendRoutes.value = [route]
  sendSelectedRouteIndex.value = 0
  applySendRoute(route)
  sendBodyText.value = route.method === 'GET' ? '' : '{}'
  sendError.value = ''
  sendResponse.value = null
  showSendModal.value = true
}

function onSendRouteChange() {
  const idx = sendSelectedRouteIndex.value
  if (idx >= 0 && idx < sendRoutes.value.length) {
    const prevMethod = sendMethod.value
    applySendRoute(sendRoutes.value[idx])
    if (sendMethod.value === 'GET' && prevMethod !== 'GET') {
      sendBodyText.value = ''
    } else if (sendMethod.value !== 'GET' && prevMethod === 'GET') {
      sendBodyText.value = '{}'
    }
  }
}

function onParamValueChange() {
  sendResolvedUrl.value = resolveUrl(sendEndpointBaseUrl.value, sendPath.value, sendParamValues.value)
}

function closeSendModal() {
  showSendModal.value = false
  sendResponse.value = null
}

function formatBody(body: unknown): string {
  if (typeof body === 'string') return body
  return JSON.stringify(body, null, 2)
}

function statusBadgeClass(status: number): string {
  if (status >= 200 && status < 300) return 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
  if (status >= 300 && status < 400) return 'bg-blue-950/60 text-blue-300 border border-blue-800'
  if (status >= 400 && status < 500) return 'bg-amber-950/60 text-amber-300 border border-amber-800'
  return 'bg-rose-950/60 text-rose-300 border border-rose-800'
}

async function sendRequest() {
  if (!sendRouteId.value) {
    sendError.value = 'No route selected. Add a route to this endpoint first.'
    return
  }
  sendingRequest.value = true
  sendError.value = ''
  sendResponse.value = null
  sendStartTime.value = Date.now()
  let body: unknown = undefined
  if (sendMethod.value !== 'GET' && sendBodyText.value.trim()) {
    try {
      body = JSON.parse(sendBodyText.value)
    } catch {
      sendError.value = 'Invalid JSON in request body'
      sendingRequest.value = false
      return
    }
  }
  try {
    const params = sendDynamicParams.value.length > 0 ? { ...sendParamValues.value } : undefined
    const result = await executeRoute(sendRouteId.value, body, params)
    sendResponse.value = result
    formatTime.value = Date.now() - sendStartTime.value
  } catch (e: any) {
    sendResponse.value = { error: true, upstreamStatus: 0, headers: {}, body: e?.message || 'Network error' }
    formatTime.value = Date.now() - sendStartTime.value
  } finally {
    sendingRequest.value = false
  }
}

async function openSendRequestForEndpoint(ep: GatewayEndpoint) {
  sendError.value = ''
  sendResponse.value = null
  let routes: GatewayRoute[]
  try {
    routes = await listRoutes(ep.id)
  } catch {
    routes = []
  }
  sendEndpointId.value = ep.id
  sendEndpointName.value = ep.name
  sendEndpointBaseUrl.value = ep.baseUrl
  sendRoutes.value = routes
  sendSelectedRouteIndex.value = 0
  if (routes.length > 0) {
    applySendRoute(routes[0])
    sendBodyText.value = routes[0].method === 'GET' ? '' : '{}'
  } else {
    sendRouteId.value = ''
    sendMethod.value = 'GET'
    sendPath.value = ''
    sendUrl.value = ''
    sendBodyText.value = ''
  }
  routesByEndpoint.value[ep.id] = routes
  showSendModal.value = true
}

// Endpoint form
const showEndpointModal = ref(false)
const isEditingEndpoint = ref(false)
const editingEndpointId = ref<string | null>(null)
const epSubmitting = ref(false)
const epForm = reactive({
  name: '', description: '', baseUrl: '', authType: 'none' as 'none' | 'api-key' | 'bearer' | 'basic',
  authConfig: {} as Record<string, any>, rateLimitRps: 0, isActive: true,
})

// Route form
const showRouteModal = ref(false)
const isEditingRoute = ref(false)
const editingRouteId = ref<string | null>(null)
const routeEndpointId = ref<string>('')
const routeSubmitting = ref(false)
const routeForm = reactive({ method: 'GET', path: '', description: '', autoUpdateSchema: false })

function authBadgeClass(type: string): string {
  const map: Record<string, string> = {
    'none': 'bg-slate-800 text-slate-400 border border-slate-700',
    'api-key': 'bg-amber-950/60 text-amber-300 border border-amber-800',
    'bearer': 'bg-violet-950/60 text-violet-300 border border-violet-800',
    'basic': 'bg-blue-950/60 text-blue-300 border border-blue-800',
  }
  return map[type] || 'bg-slate-800 text-slate-400 border border-slate-700'
}

function methodBadgeClass(method: string): string {
  const map: Record<string, string> = {
    GET: 'bg-emerald-950/60 text-emerald-300 border border-emerald-800',
    POST: 'bg-blue-950/60 text-blue-300 border border-blue-800',
    PUT: 'bg-amber-950/60 text-amber-300 border border-amber-800',
    PATCH: 'bg-violet-950/60 text-violet-300 border border-violet-800',
    DELETE: 'bg-rose-950/60 text-rose-300 border border-rose-800',
  }
  return map[method] || 'bg-slate-800 text-slate-400 border border-slate-700'
}

async function loadAll() {
  loading.value = true
  errorMsg.value = ''
  try {
    endpoints.value = await listEndpoints()
  } catch (e: any) {
    errorMsg.value = e?.message || 'Failed to load endpoints'
  } finally {
    loading.value = false
  }
}

async function toggleExpand(id: string) {
  if (expandedId.value === id) {
    expandedId.value = null
    return
  }
  expandedId.value = id
  if (!routesByEndpoint.value[id]) {
    try {
      routesByEndpoint.value[id] = await listRoutes(id)
    } catch {
      routesByEndpoint.value[id] = []
    }
  }
}

// --- Endpoint CRUD ---

function openCreate() {
  isEditingEndpoint.value = false
  editingEndpointId.value = null
  epForm.name = ''; epForm.description = ''; epForm.baseUrl = ''
  epForm.authType = 'none'; epForm.authConfig = {}
  epForm.rateLimitRps = 0; epForm.isActive = true
  showEndpointModal.value = true
}

function openEdit(ep: GatewayEndpoint) {
  isEditingEndpoint.value = true
  editingEndpointId.value = ep.id
  epForm.name = ep.name; epForm.description = ep.description; epForm.baseUrl = ep.baseUrl
  // The API never returns stored credentials (see gateway-api.ts's
  // GatewayEndpoint.authConfig comment), so these fields start blank -
  // leaving them blank on save keeps the existing stored credentials.
  epForm.authType = ep.authType; epForm.authConfig = {}
  epForm.rateLimitRps = ep.rateLimitRps; epForm.isActive = ep.isActive
  showEndpointModal.value = true
}

function closeEndpointModal() { showEndpointModal.value = false }

async function saveEndpoint() {
  epSubmitting.value = true
  errorMsg.value = ''
  try {
    const payload = {
      name: epForm.name, description: epForm.description, baseUrl: epForm.baseUrl,
      authType: epForm.authType, authConfig: epForm.authConfig,
      rateLimitRps: epForm.rateLimitRps, isActive: epForm.isActive,
    }
    if (isEditingEndpoint.value && editingEndpointId.value) {
      await updateEndpoint(editingEndpointId.value, payload)
    } else {
      await createEndpoint(payload)
    }
    closeEndpointModal()
    await loadAll()
  } catch (e: any) {
    errorMsg.value = e?.message || 'Failed to save endpoint'
  } finally {
    epSubmitting.value = false
  }
}

async function confirmDelete(ep: GatewayEndpoint) {
  if (!confirm(`Delete endpoint "${ep.name}"?`)) return
  try {
    await deleteEndpoint(ep.id)
    delete routesByEndpoint.value[ep.id]
    if (expandedId.value === ep.id) expandedId.value = null
    await loadAll()
  } catch (e: any) {
    errorMsg.value = e?.message || 'Failed to delete endpoint'
  }
}

// --- Route CRUD ---

function openCreateRoute(ep: GatewayEndpoint) {
  isEditingRoute.value = false
  editingRouteId.value = null
  routeEndpointId.value = ep.id
  routeForm.method = 'GET'; routeForm.path = ''; routeForm.description = ''; routeForm.autoUpdateSchema = false
  showRouteModal.value = true
}

function editRoute(ep: GatewayEndpoint, route: GatewayRoute) {
  isEditingRoute.value = true
  editingRouteId.value = route.id
  routeEndpointId.value = ep.id
  routeForm.method = route.method; routeForm.path = route.path
  routeForm.description = route.description; routeForm.autoUpdateSchema = route.autoUpdateSchema
  showRouteModal.value = true
}

function closeRouteModal() { showRouteModal.value = false }

async function saveRoute() {
  routeSubmitting.value = true
  routeError.value = ''
  try {
    const payload = { method: routeForm.method, path: routeForm.path, description: routeForm.description, autoUpdateSchema: routeForm.autoUpdateSchema }
    if (isEditingRoute.value && editingRouteId.value) {
      await updateRoute(editingRouteId.value, payload)
    } else {
      await createRoute({ ...payload, endpointId: routeEndpointId.value })
    }
    closeRouteModal()
    routesByEndpoint.value[routeEndpointId.value] = await listRoutes(routeEndpointId.value)
  } catch (e: any) {
    routeError.value = e?.message || 'Failed to save route'
  } finally {
    routeSubmitting.value = false
  }
}

async function confirmDeleteRoute(route: GatewayRoute) {
  if (!confirm(`Delete route "${route.method} ${route.path}"?`)) return
  try {
    await deleteRoute(route.id)
    const epId = route.endpointId
    routesByEndpoint.value[epId] = (routesByEndpoint.value[epId] || []).filter(r => r.id !== route.id)
  } catch (e: any) {
    errorMsg.value = e?.message || 'Failed to delete route'
  }
}

// --- Schema ---

async function testRoute(route: GatewayRoute) {
  testingId.value = route.id
  try {
    const result = await testRouteApi(route.id)
    schemaData.value = result.schema
    schemaRouteId.value = route.id
    showSchemaModal.value = true
    const epId = route.endpointId
    routesByEndpoint.value[epId] = await listRoutes(epId)
  } catch (e: any) {
    errorMsg.value = e?.message || 'Test failed'
  } finally {
    testingId.value = null
  }
}

async function viewRouteSchema(route: GatewayRoute) {
  try {
    const result = await getRouteSchema(route.id)
    schemaData.value = result.schema
    schemaRouteId.value = route.id
    showSchemaModal.value = true
  } catch {
    errorMsg.value = 'No schema yet. Test the route first.'
  }
}

async function refreshRouteSchema(routeId: string) {
  try {
    const result = await refreshSchema(routeId)
    schemaData.value = result.schema
  } catch (e: any) {
    errorMsg.value = e?.message || 'Refresh failed'
  }
}

onMounted(() => {
  loadAll()
  checkHealth()
})
</script>
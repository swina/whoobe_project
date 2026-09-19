<template>
  <div class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center p-4" @click.self="$emit('close')">
    <div class="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 light:bg-white border border-slate-700 light:border-slate-200 shadow-xl overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3 border-b border-slate-800 light:border-slate-200">
        <div class="min-w-0">
          <h4 class="text-sm font-semibold text-slate-100 light:text-slate-900 truncate">Send as Brevo campaign</h4>
          <p class="text-xs text-slate-500 truncate">{{ sourceKindLabel }} · {{ props.sourceLabel }}</p>
        </div>
        <button type="button" class="text-slate-500 hover:text-slate-300 text-lg leading-none" @click="$emit('close')">×</button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3 text-xs">
        <p class="text-slate-500">
          Renders this {{ sourceKindLabel.toLowerCase() }}'s HTML (images resolved, Tailwind inlined - the same
          pipeline a Form notification's own send uses) and creates it as a <strong>draft</strong> campaign in Brevo.
          Nothing is sent from here - finish and send the draft in Brevo once you're happy with it.
        </p>

        <div v-if="loadingEndpoints" class="text-slate-500 text-center py-4">Loading Gateway endpoints…</div>
        <div v-else-if="endpoints.length === 0" class="px-3 py-2 rounded-lg bg-amber-900/30 border border-amber-700/40 text-amber-300">
          No Gateway endpoints configured yet. Add a Brevo endpoint under Integrations first (the Brevo preset already
          includes the campaign routes this needs).
        </div>
        <template v-else>
          <label class="flex flex-col gap-1 text-slate-400">
            Gateway endpoint
            <select v-model="selectedEndpointId" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800">
              <option value="" disabled>Choose an endpoint…</option>
              <option v-for="ep in endpoints" :key="ep.id" :value="ep.id">{{ ep.name }}</option>
            </select>
          </label>

          <div v-if="loadingRoutes" class="text-slate-500">Loading routes…</div>
          <label v-else-if="selectedEndpointId" class="flex flex-col gap-1 text-slate-400">
            Create-campaign route
            <select v-model="selectedRouteId" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800">
              <option value="" disabled>Choose a route…</option>
              <option v-for="r in routes" :key="r.id" :value="r.id">{{ r.method }} {{ r.path }}</option>
            </select>
            <span v-if="routes.length === 0" class="text-amber-400">
              No routes on this endpoint yet - add "POST emailCampaigns" (from the Brevo preset's starter routes, or
              manually) under Integrations first.
            </span>
          </label>

          <label class="flex flex-col gap-1 text-slate-400">
            Campaign name <span class="text-slate-600">(Brevo's internal reference, not shown to recipients)</span>
            <input v-model="campaignName" type="text" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
          </label>
          <label class="flex flex-col gap-1 text-slate-400">
            Subject line
            <input v-model="subject" type="text" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1 text-slate-400">
              Sender name
              <input v-model="senderName" type="text" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
            </label>
            <label class="flex flex-col gap-1 text-slate-400">
              Sender email
              <input v-model="senderEmail" type="email" class="px-2 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" placeholder="Must be a verified sender in Brevo" />
            </label>
          </div>

          <div class="flex flex-col gap-1 text-slate-400">
            <span>Recipient lists <span class="text-slate-600">(optional - leave empty to pick recipients later in Brevo)</span></span>
            <div v-if="loadingLists" class="text-slate-500">Loading contact lists…</div>
            <div v-else-if="listsError" class="text-amber-400">{{ listsError }}</div>
            <div v-else-if="selectedEndpointId && !loadingRoutes && !listsRouteId" class="text-amber-400">
              No "GET contacts/lists" route on this endpoint - add it (from the Brevo preset's starter routes) to pick
              lists here.
            </div>
            <div v-else-if="lists.length > 0" class="max-h-32 overflow-y-auto rounded-lg border border-slate-800 light:border-slate-200 divide-y divide-slate-800/60 light:divide-slate-200">
              <label v-for="l in lists" :key="l.id" class="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-800/40 light:hover:bg-slate-100">
                <input type="checkbox" :value="l.id" v-model="selectedListIds" class="rounded border-slate-600" />
                <span class="text-slate-200 light:text-slate-800">{{ l.name }}</span>
                <span v-if="l.totalSubscribers != null" class="text-slate-500 ml-auto">{{ l.totalSubscribers }} subscribers</span>
              </label>
            </div>
          </div>

          <label class="flex items-start gap-2 text-slate-400 pt-1">
            <input type="checkbox" v-model="embedImages" class="mt-0.5 rounded border-slate-600" />
            <span>
              Embed images directly (base64) instead of linking to this install's DAM - required if the DAM isn't
              publicly reachable (e.g. a local/dev environment), otherwise images just won't load for Brevo/recipients.
              Uncheck only if you know the DAM is public and want a smaller draft.
            </span>
          </label>

          <label class="flex items-start gap-2 text-slate-400 pt-1">
            <input type="checkbox" v-model="autoAddUnsubscribeLink" class="mt-0.5 rounded border-slate-600" />
            <span>
              Auto-add an unsubscribe footer if the template doesn't already include one - Brevo rejects a campaign
              with no <code class="text-slate-300">{unsubscribe}</code> link.
            </span>
          </label>
        </template>

        <div v-if="error" class="px-3 py-2 rounded-lg bg-rose-900/30 border border-rose-700/40 text-rose-300 whitespace-pre-wrap">{{ error }}</div>
        <div v-if="createdCampaignId" class="px-3 py-2 rounded-lg bg-emerald-900/30 border border-emerald-700/40 text-emerald-300">
          Draft campaign created in Brevo (id {{ createdCampaignId }}). Finish setting it up (recipients, scheduling) in Brevo.
        </div>
      </div>

      <div class="flex items-center gap-3 px-5 py-3 border-t border-slate-800 light:border-slate-200">
        <button
          type="button"
          :disabled="!canSubmit || submitting"
          class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
          @click="submit"
        >
          {{ submitting ? 'Creating draft…' : 'Create draft in Brevo' }}
        </button>
        <span class="flex-1"></span>
        <button type="button" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 light:bg-slate-200 text-slate-200 light:text-slate-800 hover:bg-slate-700 light:hover:bg-slate-300" @click="$emit('close')">
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Whoobe → Brevo campaign integration: turns an HTML mail template, a
// snippet, or a page into a Brevo draft campaign - three content sources,
// one modal, since they all boil down to "render this Element tree to
// static HTML" (core-api has one render endpoint per source: /mail-
// templates/:id/render, /whoobe-one/snippets/:id/render, /whoobe-one/
// pages/:id/render - same renderStaticHtml() pipeline underneath each).
// Deliberately thin beyond that dispatch - it reuses the Gateway's
// already-generic, already-authenticated POST /routes/:id/execute (the
// exact function GatewayEndpointsView.vue's own "Test" action already
// calls) rather than adding any Brevo-specific server code - the Brevo
// preset (gateway-presets.ts) is what actually knows the endpoint shape.
//
// Phase 2 additions on top of Phase 1's bare "create a nameless draft":
// a recipient-list picker (GET contacts/lists) and auto-injecting Brevo's
// required {unsubscribe} tag when the source doesn't already include one.
// Still only ever creates a draft - send/schedule and a campaign-tracking
// table are later phases, so nothing here can accidentally email anyone.
import { computed, onMounted, ref, watch } from 'vue'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import { renderMailTemplate } from '../../utils/mail-templates-api'
import { renderSnippet } from '../../utils/snippets-api'
import { renderPageContent } from '../../utils/pages-api'
import { listEndpoints, listRoutes, executeRoute, type GatewayEndpoint, type GatewayRoute } from '../../utils/gateway-api'

export type CampaignSourceKind = 'mail-template' | 'snippet' | 'page'

const props = defineProps<{
  sourceKind: CampaignSourceKind
  sourceId: string
  sourceLabel: string
  /** Only a mail template has one of its own; a snippet/page just starts
   *  the subject field blank for the user to fill in. */
  sourceSubject?: string | null
}>()

defineEmits<{ (e: 'close'): void }>()

const SOURCE_KIND_LABELS: Record<CampaignSourceKind, string> = {
  'mail-template': 'Mail template',
  snippet: 'Snippet',
  page: 'Page',
}
const sourceKindLabel = computed(() => SOURCE_KIND_LABELS[props.sourceKind])

// Dispatches to the one render endpoint that matches this source - each
// returns `{ html, text }` (a mail template's alone also returns
// `subject`, already captured into sourceSubject/the `subject` ref below
// rather than re-read here).
async function renderSource(): Promise<{ html: string; text: string }> {
  const baseUrl = getDefaultCoreApiUrl()
  if (props.sourceKind === 'mail-template') return renderMailTemplate(baseUrl, props.sourceId, embedImages.value)
  if (props.sourceKind === 'snippet') return renderSnippet(baseUrl, props.sourceId, embedImages.value)
  return renderPageContent(baseUrl, props.sourceId, embedImages.value)
}

interface BrevoContactList {
  id: number
  name: string
  totalSubscribers?: number
}

const endpoints = ref<GatewayEndpoint[]>([])
const routes = ref<GatewayRoute[]>([])
const loadingEndpoints = ref(true)
const loadingRoutes = ref(false)
const selectedEndpointId = ref('')
const selectedRouteId = ref('')

const listsRouteId = ref('')
const lists = ref<BrevoContactList[]>([])
const selectedListIds = ref<number[]>([])
const loadingLists = ref(false)
const listsError = ref('')

const campaignName = ref(props.sourceLabel)
const subject = ref(props.sourceSubject || '')
const senderName = ref('')
const senderEmail = ref('')
const autoAddUnsubscribeLink = ref(true)
// Defaults on: base64-embedding is the only option that works when this
// install's own DAM isn't publicly reachable (a local/dev environment) -
// see renderSource()'s own call sites and mail-image-urls.ts's
// resolveMailImageDataUris() for the full reasoning. Left switchable for a
// real deployment with a genuinely public DAM, where proxy URLs give a
// smaller payload instead.
const embedImages = ref(true)

const submitting = ref(false)
const error = ref('')
const createdCampaignId = ref<string | number | null>(null)

const canSubmit = computed(
  () => !!selectedRouteId.value && !!campaignName.value.trim() && !!subject.value.trim() && !!senderName.value.trim() && !!senderEmail.value.trim(),
)

// A path like 'emailCampaigns/{campaignId}/sendNow' isn't the create
// route - only an exact, param-free 'emailCampaigns' POST is what this
// modal can call (it never asks for a campaignId), so auto-select stays
// narrow instead of guessing at the "closest" match.
function isCreateCampaignRoute(route: GatewayRoute): boolean {
  return route.method === 'POST' && route.path.replace(/^\/+|\/+$/g, '') === 'emailCampaigns'
}

function isContactListsRoute(route: GatewayRoute): boolean {
  return route.method === 'GET' && route.path.replace(/^\/+|\/+$/g, '') === 'contacts/lists'
}

async function loadLists(routeId: string) {
  loadingLists.value = true
  listsError.value = ''
  lists.value = []
  selectedListIds.value = []
  try {
    const result = await executeRoute(routeId)
    if (result.error || result.upstreamStatus < 200 || result.upstreamStatus >= 300) {
      listsError.value = 'Failed to load contact lists from Brevo - check the route/credentials under Integrations.'
      return
    }
    const body = result.body as { lists?: { id: number; name: string; totalSubscribers?: number }[] }
    lists.value = (body?.lists ?? []).map((l) => ({ id: l.id, name: l.name, totalSubscribers: l.totalSubscribers }))
  } catch (e: any) {
    listsError.value = e?.message || 'Failed to load contact lists'
  } finally {
    loadingLists.value = false
  }
}

async function loadRoutes(endpointId: string) {
  loadingRoutes.value = true
  selectedRouteId.value = ''
  listsRouteId.value = ''
  lists.value = []
  selectedListIds.value = []
  try {
    routes.value = await listRoutes(endpointId)
    const createMatch = routes.value.find(isCreateCampaignRoute)
    if (createMatch) selectedRouteId.value = createMatch.id
    const listsMatch = routes.value.find(isContactListsRoute)
    if (listsMatch) {
      listsRouteId.value = listsMatch.id
      loadLists(listsMatch.id)
    }
  } catch (e: any) {
    error.value = e?.message || 'Failed to load routes for this endpoint'
    routes.value = []
  } finally {
    loadingRoutes.value = false
  }
}

watch(selectedEndpointId, (id) => {
  if (id) loadRoutes(id)
  else routes.value = []
})

onMounted(async () => {
  try {
    endpoints.value = await listEndpoints()
    // A Brevo-shaped baseUrl is a convenience default, not a hard filter -
    // any endpoint can be picked (a self-hosted proxy in front of Brevo,
    // multiple Brevo accounts under different endpoint names, etc.).
    const brevoLike = endpoints.value.find((ep) => ep.baseUrl.includes('brevo.com'))
    if (brevoLike) selectedEndpointId.value = brevoLike.id
  } catch (e: any) {
    error.value = e?.message || 'Failed to load Gateway endpoints'
  } finally {
    loadingEndpoints.value = false
  }
})

const UNSUBSCRIBE_TAG = '{unsubscribe}'

// Brevo rejects a campaign whose content has no {unsubscribe} tag - rather
// than blocking submission on it, append a plain footer with one when the
// template doesn't already include its own (e.g. a template built before
// campaigns were a use case, or one that only ever went through
// transactional/form-notification sends where no such requirement exists).
function ensureUnsubscribeLink(html: string): string {
  if (html.includes(UNSUBSCRIBE_TAG)) return html
  const footer = `<div style="text-align:center;padding:16px;font-family:sans-serif;font-size:12px;color:#94a3b8;"><a href="${UNSUBSCRIBE_TAG}" style="color:#94a3b8;">Unsubscribe</a></div>`
  // The render endpoints now return a full <!DOCTYPE html>...<body>...
  // </body></html> document (buildMailDocument()) - insert before </body>
  // so the footer lands inside it, not appended after </html> where it'd
  // sit outside the document entirely. Falls back to a plain append for
  // any bare fragment (no <body> tag at all).
  if (html.includes('</body>')) return html.replace('</body>', `${footer}</body>`)
  return `${html}${footer}`
}

async function submit() {
  error.value = ''
  createdCampaignId.value = null
  submitting.value = true
  try {
    const rendered = await renderSource()
    const html = autoAddUnsubscribeLink.value ? ensureUnsubscribeLink(rendered.html) : rendered.html
    const requestBody = {
      name: campaignName.value.trim(),
      subject: subject.value.trim(),
      sender: { name: senderName.value.trim(), email: senderEmail.value.trim() },
      htmlContent: html,
      // Optional on Brevo's own API (it can derive a plain-text part from
      // htmlContent) - only sent when the naive converter produced
      // something, rather than an empty string overriding Brevo's own.
      ...(rendered.text ? { textContent: rendered.text } : {}),
      // Omitted entirely (rather than sent as an empty array) when no list
      // is picked - Brevo still creates the draft, just untargeted, so a
      // missing recipients block is a valid "decide later in Brevo" state,
      // not an error.
      ...(selectedListIds.value.length ? { recipients: { listIds: selectedListIds.value } } : {}),
    }
    const result = await executeRoute(selectedRouteId.value, requestBody)
    if (result.error || result.upstreamStatus < 200 || result.upstreamStatus >= 300) {
      const body = result.body as any
      error.value = `Brevo rejected the campaign (status ${result.upstreamStatus}): ${body?.message || body?.error || JSON.stringify(body)}`
      return
    }
    createdCampaignId.value = (result.body as any)?.id ?? null
  } catch (e: any) {
    error.value = e?.message || 'Failed to create the campaign'
  } finally {
    submitting.value = false
  }
}
</script>

// Pure logic of the "Connect a flow" wizard of Object events (no Vue, no network except through the injected `WizardApi`), so it is unit-tested in
// scripts/security/unit. Plan: docs/plans/automations/object-events-connect-wizard.md. Whoobe prefers no engine: the texts here name none as better.
import type { ObjectEventType } from './object-events-api'

// ---- 1. the webhook URL the engine shows ----

export type Engine = 'activepieces' | 'n8n' | 'generic'
/** `test`: the engine listens only while its editor waits for a sample; `live`: the published flow; `single`: no second mode exists. */
export type WebhookMode = 'live' | 'test' | 'single'

export interface ParsedWebhook {
  engine: Engine
  /** Origin plus the part of the path common to every flow of the engine: the Integrations endpoint's base URL. */
  baseUrl: string
  /** Fixed path of the route, starting with "/". */
  path: string
  mode: WebhookMode
  /** The path of the other mode when the engine has one by convention (Activepieces `/test`, n8n `webhook-test`), otherwise null. */
  otherPath: string | null
  host: string
  port: string
}

export type Parsed = { ok: true; value: ParsedWebhook } | { ok: false; error: string }

/** What the engine shows (a URL to POST to) as the pieces Integrations needs. Query and fragment are dropped; a URL with a password is refused. */
export function parseWebhookUrl(input: string): Parsed {
  const text = (input ?? '').trim()
  if (!text) return { ok: false, error: 'Paste the webhook URL of the flow' }
  let u: URL
  try { u = new URL(text) } catch { return { ok: false, error: 'This is not a URL (it should start with http:// or https://)' } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'The URL must start with http:// or https://' }
  if (u.username || u.password) return { ok: false, error: 'Remove the user name and password from the URL: credentials belong to the Integrations endpoint' }
  const path = u.pathname.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1')
  if (/[{}]|%7[Bb]|%7[Dd]/.test(path)) return { ok: false, error: 'The path has {parameters}: an event route needs a fixed path' }
  if (path === '/' || path === '') return { ok: false, error: 'The URL has no path: paste the full webhook URL of the flow' }
  const origin = u.origin
  const common = { host: u.hostname, port: u.port }

  const ap = path.match(/^(.*\/api\/v1\/webhooks)\/([A-Za-z0-9_-]+)(\/test|\/sync)?$/)
  if (ap) {
    const [, prefix, id, suffix] = ap
    const baseUrl = origin + prefix
    if (suffix === '/test') return { ok: true, value: { engine: 'activepieces', baseUrl, path: `/${id}/test`, mode: 'test', otherPath: `/${id}`, ...common } }
    if (suffix === '/sync') return { ok: true, value: { engine: 'activepieces', baseUrl, path: `/${id}/sync`, mode: 'single', otherPath: null, ...common } }
    return { ok: true, value: { engine: 'activepieces', baseUrl, path: `/${id}`, mode: 'live', otherPath: `/${id}/test`, ...common } }
  }
  const n8 = path.match(/^(.*)\/(webhook-test|webhook)\/(.+)$/)
  if (n8) {
    const [, prefix, kind, rest] = n8
    const baseUrl = origin + prefix
    return kind === 'webhook-test'
      ? { ok: true, value: { engine: 'n8n', baseUrl, path: `/webhook-test/${rest}`, mode: 'test', otherPath: `/webhook/${rest}`, ...common } }
      : { ok: true, value: { engine: 'n8n', baseUrl, path: `/webhook/${rest}`, mode: 'live', otherPath: `/webhook-test/${rest}`, ...common } }
  }
  return { ok: true, value: { engine: 'generic', baseUrl: origin, path, mode: 'single', otherPath: null, ...common } }
}

export const ENGINE_LABEL: Record<Engine, string> = { activepieces: 'Activepieces', n8n: 'n8n', generic: 'a webhook' }

/** The route paths to create, in a fixed order (the one the person pasted first), and which mode each one is. */
export function routesOf(w: ParsedWebhook, other?: ParsedWebhook | null): { mode: 'live' | 'test' | 'single'; path: string }[] {
  const first: 'live' | 'test' = w.mode === 'test' ? 'test' : 'live'
  const second: 'live' | 'test' = first === 'live' ? 'test' : 'live'
  if (other && other.baseUrl === w.baseUrl && other.path !== w.path) return [{ mode: first, path: w.path }, { mode: second, path: other.path }]
  if (w.otherPath) return [{ mode: w.mode as 'live' | 'test', path: w.path }, { mode: second, path: w.otherPath }]
  return [{ mode: 'single', path: w.path }]
}

/** The address of the engine seen from a container is not the one seen from the host: a hint for when the pasted host is the machine itself. */
export function reachabilityHint(w: Pick<ParsedWebhook, 'host'>): string {
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(w.host)
  return local
    ? 'This address points at the machine itself. It works if the Gateway runs on the same machine, outside Docker. If the Gateway runs in a container, use an address it can reach (the host\'s Docker address or the engine\'s network name); in production the Gateway also needs OUTBOUND_ALLOW_HOSTS for this host.'
    : ''
}

// ---- 2. what happens in Whoobe: presets of events ----

export type PresetKey = 'created' | 'changed' | 'published'
export const PRESETS: { key: PresetKey; label: string; hint: string; events: ObjectEventType[] }[] = [
  { key: 'created', label: 'A record is created', hint: 'when someone adds a record', events: ['object.created'] },
  { key: 'changed', label: 'A record is changed', hint: 'when a field changes. Saving without a change, or only publishing, does not count', events: ['object.updated'] },
  { key: 'published', label: 'A record is published or taken down', hint: 'when it goes live or back to draft', events: ['object.published', 'object.unpublished'] },
]

export function eventsOfPresets(keys: PresetKey[], extra: ObjectEventType[] = []): ObjectEventType[] {
  const out = new Set<ObjectEventType>(extra)
  for (const p of PRESETS) if (keys.includes(p.key)) for (const e of p.events) out.add(e)
  return [...out]
}

// ---- 3. the plan: which resources exist already, which are created ----

export interface ExistingEndpoint { id: string; name: string; baseUrl: string }
export interface ExistingRoute { id: string; method: string; path: string }

export interface WizardAnswers {
  name: string
  classId: string | null
  className: string
  events: ObjectEventType[]
  webhook: ParsedWebhook
  /** An optional second URL (the other mode) when it cannot be derived from the first. */
  otherWebhook?: ParsedWebhook | null
  startMode: 'test' | 'live'
  writeBack: boolean
}

export interface ConnectionPlan {
  endpoint: { reuseId: string } | { create: { name: string; baseUrl: string; authType: 'none' } }
  routes: { mode: 'live' | 'test' | 'single'; path: string; reuseId: string | null }[]
  client: { name: string; scopes: string[] } | null
  subscription: { name: string; classId: string | null; events: ObjectEventType[]; startRoute: 'live' | 'test' | 'single' }
}

const trimUrl = (u: string) => u.trim().replace(/\/+$/, '').toLowerCase()

/** A free endpoint name that carries no ":" (it would be refused in a client's scopes): the engine, then the host with its port, then a number. */
export function endpointNameFor(w: ParsedWebhook, taken: string[]): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  const base = clean(w.engine === 'generic' ? w.host : w.engine) || 'webhook'
  const used = new Set(taken.map((t) => t.toLowerCase()))
  const candidates = [base, clean(`${base}-${w.port || w.host}`)]
  for (const c of candidates) if (c && !used.has(c.toLowerCase())) return c
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`.toLowerCase())) return `${base}-${i}`
}

export type PlanResult = { ok: true; plan: ConnectionPlan } | { ok: false; error: string }

/** An API client name nobody has yet ("Orders (flow)", then "Orders (flow) 2"...): client names are unique. */
export function clientNameFor(base: string, taken: string[]): string {
  const used = new Set(taken.map((t) => t.toLowerCase()))
  if (!used.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) if (!used.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
}

export function planConnection(a: WizardAnswers, endpoints: ExistingEndpoint[], routesOfEndpoint: (endpointId: string) => ExistingRoute[], existingClientNames: string[] = []): PlanResult {
  const name = a.name.trim()
  if (!name) return { ok: false, error: 'Give the connection a name' }
  if (!a.events.length) return { ok: false, error: 'Choose at least one thing that triggers the flow' }
  if (a.writeBack && (!a.classId || !a.className)) return { ok: false, error: 'To let the flow write back, choose one class' }
  if (a.writeBack && a.className.includes(':')) return { ok: false, error: 'The class name contains ":": rename it before an API client can be given access to it' }
  if (a.otherWebhook && a.otherWebhook.baseUrl !== a.webhook.baseUrl) return { ok: false, error: 'The two URLs belong to different servers: use one connection for each' }

  const existing = endpoints.find((e) => trimUrl(e.baseUrl) === trimUrl(a.webhook.baseUrl))
  const endpoint: ConnectionPlan['endpoint'] = existing
    ? { reuseId: existing.id }
    : { create: { name: endpointNameFor(a.webhook, endpoints.map((e) => e.name)), baseUrl: a.webhook.baseUrl, authType: 'none' } }
  const known = existing ? routesOfEndpoint(existing.id) : []
  const routes = routesOf(a.webhook, a.otherWebhook).map((r) => ({
    ...r, reuseId: known.find((k) => k.method.toUpperCase() === 'POST' && k.path === r.path)?.id ?? null,
  }))
  const startRoute = routes.find((r) => r.mode === a.startMode)?.mode ?? routes[0].mode
  return {
    ok: true,
    plan: {
      endpoint, routes,
      client: a.writeBack ? { name: clientNameFor(`${name} (flow)`, existingClientNames), scopes: [`data:read:${a.className}`, `data:write:${a.className}`] } : null,
      subscription: { name, classId: a.classId, events: a.events, startRoute },
    },
  }
}

// ---- 3b. the Test / Live switch of a subscription ----

/** For a subscription's route and the routes of its endpoint: whether it is the test or the live one of a pair (Activepieces `/id` and `/id/test`, n8n
 * `/webhook/x` and `/webhook-test/x`) and the other route of the pair when it exists. A route with no pair has no switch. */
export function modeSwitch(current: { path: string }, siblings: { id: string; method: string; path: string }[]): { mode: 'live' | 'test'; other: { id: string; path: string } } | null {
  const candidates: { mode: 'live' | 'test'; other: string }[] = []
  let m: RegExpMatchArray | null
  if ((m = current.path.match(/^\/webhook-test\/(.+)$/))) candidates.push({ mode: 'test', other: `/webhook/${m[1]}` })
  else if ((m = current.path.match(/^\/webhook\/(.+)$/))) candidates.push({ mode: 'live', other: `/webhook-test/${m[1]}` })
  if ((m = current.path.match(/^(\/.+)\/test$/))) candidates.push({ mode: 'test', other: m[1] })
  else candidates.push({ mode: 'live', other: `${current.path}/test` })
  for (const c of candidates) {
    const found = siblings.find((r) => r.path === c.other && ['POST', 'PUT', 'PATCH'].includes(r.method.toUpperCase()))
    if (found) return { mode: c.mode, other: { id: found.id, path: found.path } }
  }
  return null
}

// ---- 4. running the plan, with a rollback ----

export interface WizardApi {
  createEndpoint(i: { name: string; baseUrl: string; authType: 'none' }): Promise<{ id: string }>
  createRoute(i: { endpointId: string; path: string; method: 'POST' }): Promise<{ id: string }>
  createClient(i: { name: string; scopes: string[] }): Promise<{ id: string; key: string | null }>
  createSubscription(i: { name: string; enabled: boolean; classId: string | null; events: ObjectEventType[]; endpointId: string; routeId: string; ignoreActors: string[]; signingSecretRef: null }): Promise<{ id: string }>
  deleteEndpoint(id: string): Promise<void>
  deleteRoute(id: string): Promise<void>
  deleteClient(id: string): Promise<void>
  deleteSubscription(id: string): Promise<void>
}

export interface ConnectionResult {
  endpointId: string
  routeIds: { mode: 'live' | 'test' | 'single'; id: string }[]
  client: { id: string; key: string | null } | null
  subscriptionId: string
}

export class ConnectionError extends Error {
  constructor(message: string, readonly rolledBack: string[], readonly notRemoved: string[]) { super(message) }
}

/** Creates what the plan says, in the order endpoint, routes, client, subscription. If a call fails, what THIS run created is removed in the reverse order
 * (a reused endpoint or route is never touched) and a `ConnectionError` says what failed and whether the clean-up was complete. */
export async function runPlan(plan: ConnectionPlan, api: WizardApi): Promise<ConnectionResult> {
  const undo: { label: string; run: () => Promise<void> }[] = []
  try {
    let endpointId: string
    if ('reuseId' in plan.endpoint) endpointId = plan.endpoint.reuseId
    else {
      const e = await api.createEndpoint(plan.endpoint.create)
      endpointId = e.id
      undo.push({ label: 'endpoint', run: () => api.deleteEndpoint(e.id) })
    }
    const routeIds: ConnectionResult['routeIds'] = []
    for (const r of plan.routes) {
      if (r.reuseId) { routeIds.push({ mode: r.mode, id: r.reuseId }); continue }
      const created = await api.createRoute({ endpointId, path: r.path, method: 'POST' })
      routeIds.push({ mode: r.mode, id: created.id })
      undo.push({ label: `route ${r.path}`, run: () => api.deleteRoute(created.id) })
    }
    let client: ConnectionResult['client'] = null
    if (plan.client) {
      const c = await api.createClient(plan.client)
      client = { id: c.id, key: c.key }
      undo.push({ label: 'API client', run: () => api.deleteClient(c.id) })
    }
    const startRouteId = routeIds.find((r) => r.mode === plan.subscription.startRoute)?.id ?? routeIds[0].id
    const sub = await api.createSubscription({
      name: plan.subscription.name, enabled: true, classId: plan.subscription.classId, events: plan.subscription.events,
      endpointId, routeId: startRouteId, ignoreActors: client ? [client.id] : [], signingSecretRef: null,
    })
    return { endpointId, routeIds, client, subscriptionId: sub.id }
  } catch (e) {
    const rolledBack: string[] = []
    const notRemoved: string[] = []
    for (const step of undo.reverse()) {
      try { await step.run(); rolledBack.push(step.label) } catch { notRemoved.push(step.label) }
    }
    const reason = (e as Error)?.message || 'unknown error'
    throw new ConnectionError(reason, rolledBack, notRemoved)
  }
}

/** The sentence under a failed run: what failed, and whether Whoobe left anything behind. */
export function describeFailure(e: ConnectionError): string {
  const left = e.notRemoved.length ? ` Could not remove: ${e.notRemoved.join(', ')}. Remove it by hand in Integrations or API clients.` : ''
  const undone = e.rolledBack.length ? ` What this attempt had created was removed again (${e.rolledBack.join(', ')}).` : ''
  return `${e.message}.${undone}${left}`.replace(/\.\./g, '.')
}

// ---- 5. the test: what the delivery says, in words ----

export interface DeliveryFacts { status: 'pending' | 'delivered' | 'retrying' | 'dead'; lastError: string | null }

/** One sentence for a test delivery. `mode` tells which kind of route it went to. The engine's answer body is never stored, so this uses only the status and the problem text. */
export function describeDelivery(d: DeliveryFacts | null, mode: 'live' | 'test' | 'single', engine: Engine = 'generic'): { tone: 'ok' | 'wait' | 'problem'; text: string } {
  if (!d) return { tone: 'wait', text: 'The test event is queued; the delivery log will show it in a few seconds.' }
  if (d.status === 'delivered') return { tone: 'ok', text: 'The flow received the test event.' }
  if (d.status === 'pending') return { tone: 'wait', text: 'The test event is waiting to be sent.' }
  const err = d.lastError ?? ''
  const http = err.match(/HTTP (\d{3})/)
  if (http) {
    const code = Number(http[1])
    if (code === 404) {
      return mode === 'test'
        ? { tone: 'problem', text: `The engine is not listening on the test address.${engine === 'activepieces' ? ' In Activepieces click "Test trigger"' : engine === 'n8n' ? ' In n8n click "Listen for test event"' : ' Put the flow in its test mode'}, then send the test again.` }
        : { tone: 'problem', text: 'The engine answered 404: the flow is not published or active, or the URL is wrong.' }
    }
    if (code === 401 || code === 403) return { tone: 'problem', text: `The engine refused the call (HTTP ${code}). It may need a key or a signature on the webhook.` }
    if (code === 405) return { tone: 'problem', text: 'The engine does not accept this method on that address.' }
    if (code >= 500) return { tone: 'problem', text: `The engine failed while handling the call (HTTP ${code}). Look at its own run log.` }
    return { tone: 'problem', text: `The engine answered HTTP ${code}.` }
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(err)) return { tone: 'problem', text: 'The Gateway could not find that host name.' }
  if (/ECONNREFUSED|connection refused/i.test(err)) return { tone: 'problem', text: 'Nothing is listening at that address and port, seen from the Gateway.' }
  if (/timed? ?out|ETIMEDOUT|timeout|aborted/i.test(err)) return { tone: 'problem', text: 'The engine did not answer in time.' }
  if (/private|loopback|not allowed|blocked|OUTBOUND/i.test(err)) return { tone: 'problem', text: 'The Gateway refuses that address (outbound rules). In production allow the host with OUTBOUND_ALLOW_HOSTS.' }
  if (/removed|inactive/i.test(err)) return { tone: 'problem', text: err.charAt(0).toUpperCase() + err.slice(1) + '.' }
  return { tone: 'problem', text: d.status === 'dead' ? 'The delivery gave up.' + (err ? ` Last problem: ${err}` : '') : 'The delivery failed and will be tried again.' + (err ? ` Problem: ${err}` : '') }
}

// ---- 6. the block for the engine's HTTP step (write back) ----

export interface Snippet {
  method: 'PATCH'
  url: string
  headers: { name: string; value: string }[]
  body: string
  idToken: string
  notes: string[]
}

/** The token that stands for the record id inside the engine's own editor. */
export function idTokenFor(engine: Engine): string {
  if (engine === 'activepieces') return "{{trigger['body']['object']['id']}}"
  if (engine === 'n8n') return '{{ $json.body.object.id }}'
  return '<object.id of the event body>'
}

/** `clientBase` is Whoobe's client API (the Gateway's `/client/v1`). `key` is shown only when it is known (right after creating the client). */
export function engineSnippet(input: { engine: Engine; clientBase: string; className: string; key: string | null; engineInDocker?: boolean }): Snippet {
  const idToken = idTokenFor(input.engine)
  const base = input.clientBase.replace(/\/+$/, '')
  const notes = [
    'The API changes drafts only: on a published record it answers 409. Test on a draft.',
    'Put the key in one place only: the "Authorization" header, or the engine\'s Bearer token field (then without the word Bearer).',
  ]
  if (/\/\/(localhost|127\.0\.0\.1)[:/]/.test(base)) {
    notes.push('This address points at the Gateway as seen from this browser. If the engine runs in Docker, use an address of the host that the container can reach (not "localhost").')
  }
  return {
    method: 'PATCH',
    url: `${base}/data/${encodeURIComponent(input.className)}/${idToken}`,
    headers: [
      { name: 'Authorization', value: `Bearer ${input.key ?? '<the key of the API client>'}` },
      { name: 'Content-Type', value: 'application/json' },
    ],
    body: JSON.stringify({ attributes: { '<field>': '<new value>' } }, null, 2),
    idToken,
    notes,
  }
}

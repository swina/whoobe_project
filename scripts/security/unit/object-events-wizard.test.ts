// Pure logic of the "Connect a flow" wizard (apps/admin-dashboard/src/utils/object-events-wizard.ts).
import { describe, it, expect } from 'vitest'
import {
  ConnectionError, PRESETS, clientNameFor, describeDelivery, describeFailure, endpointNameFor, engineSnippet, eventsOfPresets, parseWebhookUrl, planConnection, reachabilityHint,
  modeSwitch, nodeRedSnippet, routesOf, runPlan, type ParsedWebhook, type WizardAnswers, type WizardApi,
} from '../../../apps/admin-dashboard/src/utils/object-events-wizard'
import { OBJECT_EVENT_TYPES } from '../../../packages/core/src/db/object-events'

const parse = (u: string): ParsedWebhook => {
  const r = parseWebhookUrl(u)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('parseWebhookUrl', () => {
  it('Activepieces live: base up to /webhooks, the flow id as the path, the test path as the other mode', () => {
    expect(parse('http://localhost:8090/api/v1/webhooks/3r8oL9yY58tBvaZ4mMScI')).toMatchObject({
      engine: 'activepieces', baseUrl: 'http://localhost:8090/api/v1/webhooks', path: '/3r8oL9yY58tBvaZ4mMScI', mode: 'live', otherPath: '/3r8oL9yY58tBvaZ4mMScI/test', host: 'localhost', port: '8090',
    })
  })
  it('Activepieces test: the live path is the other mode', () => {
    expect(parse('http://localhost:8090/api/v1/webhooks/abc123/test')).toMatchObject({ mode: 'test', path: '/abc123/test', otherPath: '/abc123' })
  })
  it('Activepieces /sync is its own flow: one route, no other mode', () => {
    expect(parse('http://localhost:8090/api/v1/webhooks/abc123/sync')).toMatchObject({ engine: 'activepieces', mode: 'single', path: '/abc123/sync', otherPath: null })
  })
  it('n8n: webhook and webhook-test are the two modes', () => {
    expect(parse('http://localhost:5678/webhook/orders')).toMatchObject({ engine: 'n8n', baseUrl: 'http://localhost:5678', path: '/webhook/orders', mode: 'live', otherPath: '/webhook-test/orders' })
    expect(parse('http://localhost:5678/webhook-test/a1b2/path')).toMatchObject({ engine: 'n8n', mode: 'test', path: '/webhook-test/a1b2/path', otherPath: '/webhook/a1b2/path' })
  })
  it('any other URL: origin as the base, the path as it is, one route', () => {
    expect(parse('https://hooks.example.com/in/events')).toMatchObject({ engine: 'generic', baseUrl: 'https://hooks.example.com', path: '/in/events', mode: 'single', otherPath: null })
  })
  it('drops the query and the fragment and a trailing slash; keeps a path prefix of the engine', () => {
    expect(parse('https://ap.example.com/prefix/api/v1/webhooks/xyz/?a=1#frag')).toMatchObject({ baseUrl: 'https://ap.example.com/prefix/api/v1/webhooks', path: '/xyz' })
  })
  it('refuses what cannot be a route, with a message a person can act on', () => {
    for (const [bad, re] of [
      ['', /Paste/], ['   ', /Paste/], ['not a url', /not a URL/], ['ftp://x.example.com/a', /http/], ['https://user:pw@x.example.com/a', /password/],
      ['https://x.example.com/', /no path/], ['https://x.example.com/a/{id}', /parameters/],
    ] as const) {
      const r = parseWebhookUrl(bad)
      expect(r.ok, bad).toBe(false)
      if (!r.ok) expect(r.error, bad).toMatch(re)
    }
  })
})

describe('routesOf', () => {
  it('derives the second route of Activepieces and n8n, the pasted one first', () => {
    expect(routesOf(parse('http://h:8090/api/v1/webhooks/f1'))).toEqual([{ mode: 'live', path: '/f1' }, { mode: 'test', path: '/f1/test' }])
    expect(routesOf(parse('http://h:8090/api/v1/webhooks/f1/test'))).toEqual([{ mode: 'test', path: '/f1/test' }, { mode: 'live', path: '/f1' }])
  })
  it('one route for a single / generic URL', () => {
    expect(routesOf(parse('https://x.example.com/in'))).toEqual([{ mode: 'single', path: '/in' }])
  })
  it('two generic URLs on the same server become live and test', () => {
    expect(routesOf(parse('https://x.example.com/in'), parse('https://x.example.com/in-test'))).toEqual([{ mode: 'live', path: '/in' }, { mode: 'test', path: '/in-test' }])
  })
  it('ignores a second URL from another server', () => {
    expect(routesOf(parse('https://x.example.com/in'), parse('https://y.example.com/in-test'))).toEqual([{ mode: 'single', path: '/in' }])
  })
})

describe('presets', () => {
  it('only name event types the server knows, and "changed" is object.updated alone', () => {
    for (const p of PRESETS) for (const e of p.events) expect(OBJECT_EVENT_TYPES).toContain(e)
    expect(eventsOfPresets(['changed'])).toEqual(['object.updated'])
  })
  it('joins the ticked presets once each, and keeps extra events', () => {
    expect(eventsOfPresets(['created', 'published'], ['object.deleted'])).toEqual(['object.deleted', 'object.created', 'object.published', 'object.unpublished'])
    expect(eventsOfPresets([])).toEqual([])
  })
})

describe('endpointNameFor', () => {
  it('uses the engine name, then the host and port, then a number; never a ":"', () => {
    const ap = parse('http://localhost:8090/api/v1/webhooks/f1')
    expect(endpointNameFor(ap, [])).toBe('activepieces')
    expect(endpointNameFor(ap, ['Activepieces'])).toBe('activepieces-8090')
    expect(endpointNameFor(ap, ['activepieces', 'activepieces-8090'])).toBe('activepieces-2')
    expect(endpointNameFor(parse('https://hooks.example.com/in'), [])).toBe('hooks.example.com')
    for (const n of [endpointNameFor(ap, ['activepieces']), endpointNameFor(parse('http://[::1]:9000/in'), [])]) expect(n).not.toContain(':')
  })
})

const answers = (over: Partial<WizardAnswers> = {}): WizardAnswers => ({
  name: 'New contacts', classId: 'class-1', className: 'Contact', events: ['object.created'],
  webhook: parse('http://localhost:8090/api/v1/webhooks/f1'), startMode: 'test', writeBack: false, ...over,
})

describe('planConnection', () => {
  it('creates the endpoint and both routes when nothing exists; starts on the test route', () => {
    const r = planConnection(answers(), [], () => [])
    expect(r).toEqual({
      ok: true,
      plan: {
        endpoint: { create: { name: 'activepieces', baseUrl: 'http://localhost:8090/api/v1/webhooks', authType: 'none' } },
        routes: [{ mode: 'live', path: '/f1', reuseId: null }, { mode: 'test', path: '/f1/test', reuseId: null }],
        client: null,
        subscription: { name: 'New contacts', classId: 'class-1', events: ['object.created'], startRoute: 'test' },
      },
    })
  })
  it('reuses an endpoint with the same base URL (case and trailing slash ignored) and a POST route with the same path', () => {
    const r = planConnection(answers({ startMode: 'live' }), [{ id: 'ep1', name: 'ap', baseUrl: 'HTTP://localhost:8090/api/v1/webhooks/' }], () => [
      { id: 'r-get', method: 'GET', path: '/f1' }, { id: 'r-post', method: 'post', path: '/f1' },
    ])
    expect(r.ok && r.plan.endpoint).toEqual({ reuseId: 'ep1' })
    expect(r.ok && r.plan.routes).toEqual([{ mode: 'live', path: '/f1', reuseId: 'r-post' }, { mode: 'test', path: '/f1/test', reuseId: null }])
    expect(r.ok && r.plan.subscription.startRoute).toBe('live')
  })
  it('does not reuse a PATCH or GET route: the wizard always makes POST routes', () => {
    const r = planConnection(answers(), [{ id: 'ep1', name: 'ap', baseUrl: 'http://localhost:8090/api/v1/webhooks' }], () => [{ id: 'g', method: 'GET', path: '/f1' }, { id: 'p', method: 'PATCH', path: '/f1/test' }])
    expect(r.ok && r.plan.routes.map((x) => x.reuseId)).toEqual([null, null])
  })
  it('write back: an API client with read and write on that class only', () => {
    const r = planConnection(answers({ writeBack: true }), [], () => [])
    expect(r.ok && r.plan.client).toEqual({ name: 'New contacts (flow)', scopes: ['data:read:Contact', 'data:write:Contact'] })
  })
  it('gives the API client a name nobody has yet, so a second run does not fail', () => {
    expect(clientNameFor('A (flow)', [])).toBe('A (flow)')
    expect(clientNameFor('A (flow)', ['a (flow)'])).toBe('A (flow) 2')
    expect(clientNameFor('A (flow)', ['A (flow)', 'A (flow) 2'])).toBe('A (flow) 3')
    const r = planConnection(answers({ writeBack: true }), [], () => [], ['New contacts (flow)'])
    expect(r.ok && r.plan.client?.name).toBe('New contacts (flow) 2')
  })
  it('says what is missing', () => {
    const msg = (a: WizardAnswers) => { const r = planConnection(a, [], () => []); return r.ok ? '' : r.error }
    expect(msg(answers({ name: ' ' }))).toMatch(/name/)
    expect(msg(answers({ events: [] }))).toMatch(/triggers/)
    expect(msg(answers({ writeBack: true, classId: null, className: '' }))).toMatch(/one class/)
    expect(msg(answers({ writeBack: true, className: 'a:b' }))).toMatch(/":"/)
    expect(msg(answers({ otherWebhook: parse('https://other.example.com/x') }))).toMatch(/different servers/)
  })
})

function fakeApi(failAt?: string) {
  const log: string[] = []
  let n = 0
  const maybe = (k: string) => { if (failAt === k) throw new Error(`${k} refused`) }
  const api: WizardApi = {
    async createEndpoint() { maybe('createEndpoint'); log.push('+endpoint'); return { id: `ep${++n}` } },
    async createRoute(i) { maybe('createRoute:' + i.path); log.push('+route' + i.path); return { id: `r${++n}` } },
    async createClient() { maybe('createClient'); log.push('+client'); return { id: `cl${++n}`, key: 'wbk_secret' } },
    async createSubscription(i) { maybe('createSubscription'); log.push('+sub'); void i; return { id: `s${++n}` } },
    async deleteEndpoint(id) { maybe('deleteEndpoint'); log.push('-endpoint ' + id) },
    async deleteRoute(id) { log.push('-route ' + id) },
    async deleteClient(id) { log.push('-client ' + id) },
    async deleteSubscription(id) { log.push('-sub ' + id) },
  }
  return { api, log }
}

describe('runPlan', () => {
  const plan = (writeBack = true) => {
    const r = planConnection(answers({ writeBack }), [], () => [])
    if (!r.ok) throw new Error(r.error)
    return r.plan
  }

  it('creates endpoint, routes, client, subscription in that order; the client is in ignoreActors and the subscription is on the chosen route', async () => {
    const { api, log } = fakeApi()
    let sent: any
    const spy = { ...api, createSubscription: async (i: any) => { sent = i; return api.createSubscription(i) } }
    const res = await runPlan(plan(), spy)
    expect(log).toEqual(['+endpoint', '+route/f1', '+route/f1/test', '+client', '+sub'])
    expect(res.client).toEqual({ id: 'cl4', key: 'wbk_secret' })
    expect(sent).toMatchObject({ endpointId: 'ep1', routeId: res.routeIds.find((r) => r.mode === 'test')!.id, ignoreActors: ['cl4'], enabled: true, signingSecretRef: null })
  })
  it('without write back: no client and an empty ignore list', async () => {
    const { api, log } = fakeApi()
    let sent: any
    const res = await runPlan(plan(false), { ...api, createSubscription: async (i) => { sent = i; return { id: 's' } } })
    expect(log).not.toContain('+client')
    expect(res.client).toBeNull()
    expect(sent.ignoreActors).toEqual([])
  })
  it('a reused endpoint and route are not created again', async () => {
    const { api, log } = fakeApi()
    const r = planConnection(answers(), [{ id: 'ep9', name: 'ap', baseUrl: 'http://localhost:8090/api/v1/webhooks' }], () => [{ id: 'r9', method: 'POST', path: '/f1' }])
    if (!r.ok) throw new Error(r.error)
    const res = await runPlan(r.plan, api)
    expect(res.endpointId).toBe('ep9')
    expect(log).toEqual(['+route/f1/test', '+sub'])
  })
  it('a failure removes only what this run created, in reverse order', async () => {
    const { api, log } = fakeApi('createSubscription')
    const err = await runPlan(plan(), api).catch((e) => e)
    expect(err).toBeInstanceOf(ConnectionError)
    expect(err.message).toBe('createSubscription refused')
    expect(log).toEqual(['+endpoint', '+route/f1', '+route/f1/test', '+client', '-client cl4', '-route r3', '-route r2', '-endpoint ep1'])
    expect(err.notRemoved).toEqual([])
  })
  it('a failure on the first call leaves nothing to remove', async () => {
    const { api, log } = fakeApi('createEndpoint')
    const err = await runPlan(plan(), api).catch((e) => e)
    expect(log).toEqual([])
    expect(err.rolledBack).toEqual([])
  })
  it('never deletes a reused endpoint when a later call fails', async () => {
    const { api, log } = fakeApi('createSubscription')
    const r = planConnection(answers(), [{ id: 'ep9', name: 'ap', baseUrl: 'http://localhost:8090/api/v1/webhooks' }], () => [])
    if (!r.ok) throw new Error(r.error)
    await runPlan(r.plan, api).catch(() => {})
    expect(log.filter((l) => l.startsWith('-endpoint'))).toEqual([])
    expect(log.filter((l) => l.startsWith('-route'))).toHaveLength(2)
  })
  it('says what it could not remove', async () => {
    const { api } = fakeApi('createSubscription')
    const err = await runPlan(plan(), { ...api, deleteClient: async () => { throw new Error('nope') } }).catch((e) => e)
    expect(err.notRemoved).toEqual(['API client'])
    expect(describeFailure(err)).toMatch(/Could not remove: API client/)
    expect(describeFailure(err)).toMatch(/removed again/)
  })
})

describe('describeDelivery', () => {
  const d = (status: any, lastError: string | null) => ({ status, lastError })
  it('delivered, waiting, none yet', () => {
    expect(describeDelivery(d('delivered', null), 'test')).toEqual({ tone: 'ok', text: 'The flow received the test event.' })
    expect(describeDelivery(d('pending', null), 'test').tone).toBe('wait')
    expect(describeDelivery(null, 'test').tone).toBe('wait')
  })
  it('404 on a test address tells to start the listening; on a live address, that the flow is not published', () => {
    expect(describeDelivery(d('retrying', 'the consumer answered HTTP 404'), 'test', 'activepieces').text).toMatch(/Test trigger/)
    expect(describeDelivery(d('retrying', 'the consumer answered HTTP 404'), 'test', 'n8n').text).toMatch(/Listen for test event/)
    expect(describeDelivery(d('retrying', 'the consumer answered HTTP 404'), 'live').text).toMatch(/not published/)
  })
  it('other statuses and network problems get a sentence each', () => {
    expect(describeDelivery(d('retrying', 'the consumer answered HTTP 401'), 'live').text).toMatch(/refused/)
    expect(describeDelivery(d('retrying', 'the consumer answered HTTP 405'), 'live').text).toMatch(/method/)
    expect(describeDelivery(d('retrying', 'the consumer answered HTTP 502'), 'live').text).toMatch(/failed while handling/)
    expect(describeDelivery(d('retrying', 'not delivered: getaddrinfo ENOTFOUND host.docker.internal'), 'live').text).toMatch(/find that host/)
    expect(describeDelivery(d('retrying', 'not delivered: connect ECONNREFUSED 127.0.0.1:8090'), 'live').text).toMatch(/Nothing is listening/)
    expect(describeDelivery(d('retrying', 'not delivered: The operation was aborted due to timeout'), 'live').text).toMatch(/in time/)
    expect(describeDelivery(d('dead', 'something odd'), 'live').text).toMatch(/gave up.*something odd/)
  })
  it('never invents a problem for a delivered one and never shows more than the stored problem text', () => {
    expect(describeDelivery(d('delivered', 'old error'), 'live').text).not.toMatch(/old error/)
  })
})

describe('engineSnippet', () => {
  it('Activepieces: the token of the editor, a PATCH to the client API of that class, the key in one header', () => {
    const s = engineSnippet({ engine: 'activepieces', clientBase: 'http://172.17.0.1:3001/client/v1/', className: 'Contact', key: 'wbk_abc' })
    expect(s.method).toBe('PATCH')
    expect(s.url).toBe("http://172.17.0.1:3001/client/v1/data/Contact/{{trigger['body']['object']['id']}}")
    expect(s.headers).toEqual([{ name: 'Authorization', value: 'Bearer wbk_abc' }, { name: 'Content-Type', value: 'application/json' }])
    expect(JSON.parse(s.body)).toEqual({ attributes: { '<field>': '<new value>' } })
    expect(s.notes.join(' ')).toMatch(/409/)
  })
  it('n8n has its own token; an unknown engine gets a description', () => {
    expect(engineSnippet({ engine: 'n8n', clientBase: 'http://gw/client/v1', className: 'Blog', key: null }).url).toBe('http://gw/client/v1/data/Blog/{{ $json.body.object.id }}')
    expect(engineSnippet({ engine: 'generic', clientBase: 'http://gw/client/v1', className: 'Blog', key: null }).idToken).toMatch(/object\.id/)
  })
  it('without the key it says where the key goes instead of inventing one', () => {
    expect(engineSnippet({ engine: 'generic', clientBase: 'http://gw/client/v1', className: 'Blog', key: null }).headers[0].value).toBe('Bearer <the key of the API client>')
  })
  it('warns about localhost seen from a container, not about a real address', () => {
    expect(engineSnippet({ engine: 'generic', clientBase: 'http://localhost:3001/client/v1', className: 'A', key: null }).notes.join(' ')).toMatch(/Docker/)
    expect(engineSnippet({ engine: 'generic', clientBase: 'https://gw.example.com/client/v1', className: 'A', key: null }).notes.join(' ')).not.toMatch(/Docker/)
  })
})

describe('reachabilityHint', () => {
  it('only for an address that points at the machine itself', () => {
    expect(reachabilityHint({ host: 'localhost' })).toMatch(/OUTBOUND_ALLOW_HOSTS/)
    expect(reachabilityHint({ host: '127.0.0.1' })).not.toBe('')
    expect(reachabilityHint({ host: 'ap.example.com' })).toBe('')
  })
})

describe('modeSwitch', () => {
  const routes = [
    { id: 'a', method: 'POST', path: '/f1' }, { id: 'b', method: 'POST', path: '/f1/test' }, { id: 'c', method: 'GET', path: '/g1/test' },
    { id: 'd', method: 'POST', path: '/webhook/x' }, { id: 'e', method: 'POST', path: '/webhook-test/x' }, { id: 'f', method: 'POST', path: '/lonely' },
  ]
  it('finds the pair of an Activepieces route in both directions', () => {
    expect(modeSwitch({ path: '/f1' }, routes)).toEqual({ mode: 'live', other: { id: 'b', path: '/f1/test' } })
    expect(modeSwitch({ path: '/f1/test' }, routes)).toEqual({ mode: 'test', other: { id: 'a', path: '/f1' } })
  })
  it('finds the pair of an n8n route in both directions', () => {
    expect(modeSwitch({ path: '/webhook/x' }, routes)).toEqual({ mode: 'live', other: { id: 'e', path: '/webhook-test/x' } })
    expect(modeSwitch({ path: '/webhook-test/x' }, routes)).toEqual({ mode: 'test', other: { id: 'd', path: '/webhook/x' } })
  })
  it('has no switch without a pair, or when the other route cannot receive an event', () => {
    expect(modeSwitch({ path: '/lonely' }, routes)).toBeNull()
    expect(modeSwitch({ path: '/g1' }, routes)).toBeNull()
  })
})

describe('Node-RED', () => {
  it('is chosen by the person, or guessed from its default port; "Other" keeps it a plain URL', () => {
    expect(parse('http://localhost:1880/whoobe-events')).toMatchObject({ engine: 'nodered', baseUrl: 'http://localhost:1880', path: '/whoobe-events', mode: 'single', otherPath: null })
    const chosen = parseWebhookUrl('http://localhost:3000/hooks/x', 'nodered')
    expect(chosen.ok && chosen.value.engine).toBe('nodered')
    const other = parseWebhookUrl('http://localhost:1880/whoobe-events', 'generic')
    expect(other.ok && other.value.engine).toBe('generic')
    expect(parse('http://localhost:3000/hooks/x').engine).toBe('generic')
  })
  it('one route, no test / live switch', () => {
    expect(routesOf(parse('http://localhost:1880/whoobe-events'))).toEqual([{ mode: 'single', path: '/whoobe-events' }])
  })
  it('reuses the route a preset made, with or without the leading slash', () => {
    const a = answers({ webhook: parse('http://localhost:1880/whoobe-events') })
    for (const stored of ['whoobe-events', '/whoobe-events']) {
      const r = planConnection(a, [{ id: 'ep', name: 'Node-RED (this machine only)', baseUrl: 'http://localhost:1880' }], () => [{ id: 'r1', method: 'POST', path: stored }])
      expect(r.ok && r.plan.routes).toEqual([{ mode: 'single', path: '/whoobe-events', reuseId: 'r1' }])
      expect(r.ok && r.plan.endpoint).toEqual({ reuseId: 'ep' })
    }
  })
  it('its hint says this machine is the right place, and warns about any other address', () => {
    expect(reachabilityHint({ host: 'localhost', engine: 'nodered' })).toMatch(/same machine/)
    expect(reachabilityHint({ host: 'localhost', engine: 'nodered' })).not.toMatch(/OUTBOUND/)
    expect(reachabilityHint({ host: 'nr.example.com', engine: 'nodered' })).toMatch(/not be exposed/)
  })
  it('a 404 points at the path of the "http in" node', () => {
    expect(describeDelivery({ status: 'retrying', lastError: 'the consumer answered HTTP 404' }, 'single', 'nodered').text).toMatch(/http in.*letter by letter/)
  })
  it('the script keeps the key and the address in the environment and leaves the field to the person', () => {
    const s = nodeRedSnippet({ clientBase: 'http://172.17.0.1:3001/client/v1/', key: 'wbk_abc' })
    expect(s.code).toContain("'<FIELD>'")
    expect(s.code).toContain("'<NEW VALUE>'")
    expect(s.code).toContain("env.get('WHOOBE_KEY')")
    expect(s.code).not.toContain('wbk_abc')
    expect(s.code).not.toContain('172.17.0.1')
    expect(s.env).toEqual([{ name: 'WHOOBE_CLIENT_URL', value: 'http://172.17.0.1:3001/client/v1' }, { name: 'WHOOBE_KEY', value: 'wbk_abc' }])
    expect(() => new Function('msg', 'env', 'flow', s.code.replace(/\nreturn msg;$/, '\nreturn msg;'))).not.toThrow()
  })
  it('the script runs: it builds the PATCH of the event\'s record and skips a test event', () => {
    const s = nodeRedSnippet({ clientBase: 'http://gw/client/v1', key: null })
    const run = (msg: any) => new Function('msg', 'env', s.code)(msg, { get: (n: string) => ({ WHOOBE_CLIENT_URL: 'http://gw/client/v1/', WHOOBE_KEY: 'k1' } as any)[n] })
    const out = run({ payload: { type: 'object.created', class: { name: 'Contact' }, object: { id: 'abc' } } })
    expect(out.method).toBe('PATCH')
    expect(out.url).toBe('http://gw/client/v1/data/Contact/abc')
    expect(out.headers.Authorization).toBe('Bearer k1')
    expect(out.payload).toEqual({ attributes: { '<FIELD>': '<NEW VALUE>' } })
    expect(run({ payload: { test: true } })).toBeNull()
  })
})

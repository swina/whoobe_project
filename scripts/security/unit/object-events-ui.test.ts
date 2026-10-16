// Pure helpers of the Object events view (apps/admin-dashboard/src/utils/object-events-ui.ts).
import { describe, it, expect } from 'vitest'
import {
  EVENT_CHOICES, emptyForm, formFromSubscription, formProblem, nextAttemptText, parseActors, relativeTime, statusTone, toInput, usableRoute,
} from '../../../apps/admin-dashboard/src/utils/object-events-ui'
import { OBJECT_EVENT_TYPES } from '../../../packages/core/src/db/object-events'

const ok = { ...emptyForm(), name: ' Orders ', endpointId: 'e', routeId: 'r' }

describe('event choices', () => {
  it('offer exactly the event types the server knows, once each', () => {
    expect(EVENT_CHOICES.map((c) => c.type).sort()).toEqual([...OBJECT_EVENT_TYPES].sort())
  })
})

describe('the subscription form', () => {
  it('starts with created and updated, active, no class', () => {
    expect(emptyForm()).toMatchObject({ enabled: true, classId: '', events: ['object.created', 'object.updated'] })
  })
  it('says what is missing, in the order a person fills it', () => {
    expect(formProblem(emptyForm())).toMatch(/name/)
    expect(formProblem({ ...ok, name: '  ' })).toMatch(/name/)
    expect(formProblem({ ...ok, events: [] })).toMatch(/event/)
    expect(formProblem({ ...ok, endpointId: '' })).toMatch(/endpoint/)
    expect(formProblem({ ...ok, routeId: '' })).toMatch(/route/)
    expect(formProblem(ok)).toBe('')
  })
  it('accepts a signing key name only with the OBJECT_EVENTS_SECRET_ prefix, like the server', () => {
    expect(formProblem({ ...ok, signingSecretRef: 'OBJECT_EVENTS_SECRET_CRM' })).toBe('')
    expect(formProblem({ ...ok, signingSecretRef: '  ' })).toBe('')
    for (const bad of ['DATABASE_URL', 'object_events_secret_x', 'OBJECT_EVENTS_SECRET_']) expect(formProblem({ ...ok, signingSecretRef: bad }), bad).toMatch(/signing key/)
  })
  it('builds the body: trimmed name, null for "every class" and for no key, events in the standard order, payload minimal by omission', () => {
    expect(toInput({ ...ok, events: ['object.deleted', 'object.created'], ignoreActors: 'a, b\nc a' })).toEqual({
      name: 'Orders', enabled: true, classId: null, events: ['object.created', 'object.deleted'], endpointId: 'e', routeId: 'r',
      ignoreActors: ['a', 'b', 'c'], signingSecretRef: null,
    })
    expect(toInput({ ...ok, classId: 'cls', signingSecretRef: ' OBJECT_EVENTS_SECRET_CRM ' })).toMatchObject({ classId: 'cls', signingSecretRef: 'OBJECT_EVENTS_SECRET_CRM' })
  })
  it('round-trips a stored subscription into the form and back', () => {
    const sub = { id: 'x', name: 'S', enabled: false, classId: 'c', events: ['object.bulk' as const], endpointId: 'e', routeId: 'r', payloadMode: 'minimal' as const,
      ignoreActors: ['u1', 'u2'], signingSecretRef: 'OBJECT_EVENTS_SECRET_A', createdAt: '', updatedAt: '' }
    const f = formFromSubscription(sub)
    expect(f).toMatchObject({ classId: 'c', ignoreActors: 'u1, u2', signingSecretRef: 'OBJECT_EVENTS_SECRET_A', enabled: false })
    expect(toInput(f)).toMatchObject({ name: 'S', enabled: false, classId: 'c', events: ['object.bulk'], ignoreActors: ['u1', 'u2'], signingSecretRef: 'OBJECT_EVENTS_SECRET_A' })
    expect(formFromSubscription({ ...sub, classId: null, endpointId: null, routeId: null, signingSecretRef: null })).toMatchObject({ classId: '', endpointId: '', routeId: '', signingSecretRef: '' })
  })
  it('parses the ignored actors from commas, spaces, semicolons and lines', () => {
    expect(parseActors('')).toEqual([])
    expect(parseActors(' a,,b ; c\n\nd  a ')).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('which routes can receive an event', () => {
  it('POST, PUT or PATCH with a fixed path', () => {
    expect(usableRoute({ method: 'POST', path: '/hooks/x' })).toBe(true)
    expect(usableRoute({ method: 'patch', path: '/a' })).toBe(true)
    expect(usableRoute({ method: 'GET', path: '/a' })).toBe(false)
    expect(usableRoute({ method: 'DELETE', path: '/a' })).toBe(false)
    expect(usableRoute({ method: 'POST', path: '/things/{id}' })).toBe(false)
  })
})

describe('the delivery log wording', () => {
  const now = new Date('2026-10-16T12:00:00Z').getTime()
  const at = (ms: number) => new Date(now + ms).toISOString()
  it('says how far a time is from now', () => {
    expect(relativeTime(at(10_000), now)).toBe('in a few seconds')
    expect(relativeTime(at(-10_000), now)).toBe('just now')
    expect(relativeTime(at(5 * 60_000), now)).toBe('in 5 min')
    expect(relativeTime(at(-30 * 60_000), now)).toBe('30 min ago')
    expect(relativeTime(at(-3 * 3_600_000), now)).toBe('3 h ago')
    expect(relativeTime(at(12 * 3_600_000), now)).toBe('in 12 h')
    expect(relativeTime(at(-3 * 86_400_000), now)).toBe('3 days ago')
  })
  it('shows a next attempt only for a delivery that will be tried again', () => {
    expect(nextAttemptText({ status: 'retrying', nextAttemptAt: at(60_000) }, now)).toBe('in 1 min')
    expect(nextAttemptText({ status: 'pending', nextAttemptAt: at(0) }, now)).toBe('just now')
    expect(nextAttemptText({ status: 'delivered', nextAttemptAt: at(60_000) }, now)).toBe('')
    expect(nextAttemptText({ status: 'dead', nextAttemptAt: at(60_000) }, now)).toBe('')
  })
  it('gives each status its own colour', () => {
    const tones = (['pending', 'delivered', 'retrying', 'dead'] as const).map(statusTone)
    expect(new Set(tones).size).toBe(4)
    expect(statusTone('dead')).toContain('rose')
    expect(statusTone('delivered')).toContain('emerald')
  })
})

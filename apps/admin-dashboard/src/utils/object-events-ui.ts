// Pure helpers of the Object events view (no Vue, no network), so they are unit-tested in scripts/security/unit.
import type { DeliveryStatus, ObjectEventSubscription, ObjectEventSubscriptionInput, ObjectEventType } from './object-events-api'

export const EVENT_CHOICES: { type: ObjectEventType; label: string; hint: string }[] = [
  { type: 'object.created', label: 'Created', hint: 'a record is inserted (one event per language row)' },
  { type: 'object.updated', label: 'Updated', hint: 'its fields, key, path or parent changed' },
  { type: 'object.published', label: 'Published', hint: 'it went from draft to published' },
  { type: 'object.unpublished', label: 'Unpublished', hint: 'it went from published to draft' },
  { type: 'object.transitioned', label: 'Workflow step', hint: 'its workflow state changed (the event says from and to)' },
  { type: 'object.deleted', label: 'Deleted', hint: 'a record is deleted' },
  { type: 'object.bulk', label: 'Bulk summary', hint: 'ONE event for an import, "Empty data" or a migration, never one per row' },
]

export const SECRET_PREFIX = 'OBJECT_EVENTS_SECRET_'

export interface SubscriptionForm {
  name: string
  enabled: boolean
  classId: string
  events: ObjectEventType[]
  endpointId: string
  routeId: string
  ignoreActors: string
  signingSecretRef: string
}

export function emptyForm(): SubscriptionForm {
  return { name: '', enabled: true, classId: '', events: ['object.created', 'object.updated'], endpointId: '', routeId: '', ignoreActors: '', signingSecretRef: '' }
}

export function formFromSubscription(s: ObjectEventSubscription): SubscriptionForm {
  return {
    name: s.name, enabled: s.enabled, classId: s.classId ?? '', events: [...s.events], endpointId: s.endpointId ?? '', routeId: s.routeId ?? '',
    ignoreActors: s.ignoreActors.join(', '), signingSecretRef: s.signingSecretRef ?? '',
  }
}

/** The ids typed in the "ignore actors" box: commas, spaces or new lines, no empty entry, no duplicate. */
export function parseActors(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))]
}

/** A message for what the form lacks, or '' when it can be sent (the server checks everything again). */
export function formProblem(f: SubscriptionForm): string {
  if (!f.name.trim()) return 'Give the subscription a name'
  if (!f.events.length) return 'Tick at least one event'
  if (!f.endpointId) return 'Choose the Integrations endpoint the events are sent to'
  if (!f.routeId) return 'Choose the route of that endpoint'
  const ref = f.signingSecretRef.trim()
  if (ref && !new RegExp(`^${SECRET_PREFIX}[A-Z0-9_]{1,48}$`).test(ref)) return `The signing key name must look like ${SECRET_PREFIX}ENGINE`
  return ''
}

export function toInput(f: SubscriptionForm): ObjectEventSubscriptionInput {
  return {
    name: f.name.trim(), enabled: f.enabled, classId: f.classId || null, events: EVENT_CHOICES.map((c) => c.type).filter((t) => f.events.includes(t)),
    endpointId: f.endpointId, routeId: f.routeId, ignoreActors: parseActors(f.ignoreActors), signingSecretRef: f.signingSecretRef.trim() || null,
  }
}

/** A route that can receive an event: POST, PUT or PATCH, and a fixed path (the server refuses the others). */
export function usableRoute(r: { method: string; path: string }): boolean {
  return ['POST', 'PUT', 'PATCH'].includes(r.method.toUpperCase()) && !r.path.includes('{')
}

export const STATUS_TEXT: Record<DeliveryStatus, string> = {
  pending: 'waiting', delivered: 'delivered', retrying: 'retrying', dead: 'gave up', stopped: 'stopped',
}

export function statusTone(s: DeliveryStatus): string {
  return s === 'delivered' ? 'bg-emerald-900/60 text-emerald-300' : s === 'dead' ? 'bg-rose-900/60 text-rose-300' : s === 'retrying' ? 'bg-amber-900/60 text-amber-300' : s === 'stopped' ? 'bg-violet-900/60 text-violet-300' : 'bg-slate-700 text-slate-300'
}

/** "in 5 min", "due now", "2 h ago": how far a time is from now. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now
  const abs = Math.abs(diff)
  if (abs < 45_000) return diff > 0 ? 'in a few seconds' : 'just now'
  const text = abs < 90 * 60_000 ? `${Math.round(abs / 60_000)} min` : abs < 36 * 3_600_000 ? `${Math.round(abs / 3_600_000)} h` : `${Math.round(abs / 86_400_000)} days`
  return diff > 0 ? `in ${text}` : `${text} ago`
}

/** What the log shows in the "next attempt" column: only a delivery that will be tried again has one. */
export function nextAttemptText(d: { status: DeliveryStatus; nextAttemptAt: string }, now: number = Date.now()): string {
  return d.status === 'pending' || d.status === 'retrying' ? relativeTime(d.nextAttemptAt, now) : ''
}

// Pure helpers of the Audit log view (apps/admin-dashboard/src/views/AuditLogView.vue): no network, no Vue.
import type { AuditEntry } from './audit-log-api'

/** The filter choices for the action: a prefix ending in "." matches the whole area (the server understands it). */
export const ACTION_CHOICES: { value: string; label: string }[] = [
  { value: '', label: 'Every action' },
  { value: 'user.', label: 'Users' },
  { value: 'role.', label: 'Roles' },
  { value: 'website.', label: 'Websites and publication' },
  { value: 'website_path.', label: 'Website menus' },
  { value: 'setting.', label: 'Settings' },
  { value: 'migration_source.', label: 'Migration sources' },
  { value: 'object_event_subscription.', label: 'Object event subscriptions' },
  { value: 'gateway_endpoint.', label: 'Gateway endpoints' },
  { value: 'gateway_route.', label: 'Gateway routes' },
  { value: 'audit.', label: 'The log itself (retention)' },
  { value: 'auth.', label: 'Failed sign-ins and second factors' },
  { value: 'access.', label: 'Refused permissions' },
  { value: 'api_client.', label: 'API clients (and refused calls)' },
]

/** `user.reset_password` -> "User: reset password". */
export function actionLabel(action: string): string {
  const [area, ...rest] = action.split('.')
  const verb = rest.join('.').replace(/_/g, ' ')
  const name = area.replace(/_/g, ' ')
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}: ${verb || '-'}`
}

/** A tone for the badge: removals and failed or refused attempts red, creations green, everything else neutral. */
export function actionTone(action: string): 'create' | 'delete' | 'change' {
  if (/(^|[._])(delete|remove|clear|purge|cancel|failed|refused|key_revoke)/.test(action)) return 'delete'
  if (/(^|[._])(create|import)/.test(action)) return 'create'
  return 'change'
}

export function actorText(e: Pick<AuditEntry, 'actorType' | 'actorLabel' | 'actorId'>): string {
  if (e.actorType === 'system') return e.actorLabel ? `system (${e.actorLabel})` : 'system'
  if (e.actorType === 'anonymous') return 'not signed in'
  return e.actorLabel || e.actorId || 'unknown'
}

export function targetText(e: Pick<AuditEntry, 'targetType' | 'targetLabel' | 'targetId'>): string {
  const what = (e.targetType ?? '').replace(/_/g, ' ')
  const name = e.targetLabel || e.targetId || ''
  return [what, name].filter(Boolean).join(': ') || '-'
}

/** A value as a short text: strings as they are, everything else as compact JSON. */
export function valueText(v: unknown): string {
  if (v === undefined) return ''
  if (v === null) return 'null'
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

export interface ChangeRow { field: string; before: string; after: string; secret: boolean }

/** The fields of an entry, one row each, with what they were and what they became. A value "changed" under a name is a credential. */
export function changeRows(e: Pick<AuditEntry, 'before' | 'after'>): ChangeRow[] {
  const before = e.before ?? {}
  const after = e.after ?? {}
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  return fields.map((field) => ({
    field,
    before: field in before ? valueText(before[field]) : '',
    after: field in after ? valueText(after[field]) : '',
    secret: after[field] === 'changed' && !(field in before),
  }))
}

/** "2026-10-18 14:05:09" in the viewer's time zone. */
export function whenText(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Start and end of a calendar day typed as YYYY-MM-DD, as ISO instants in the viewer's time zone; '' for a value that is not a date. */
export function dayStart(day: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00`) : null
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : ''
}
export function dayEnd(day: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T23:59:59.999`) : null
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : ''
}

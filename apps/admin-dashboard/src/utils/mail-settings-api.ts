import { getDefaultCoreApiUrl } from './auth-api'

// GET never returns the real password - hasPassword tells the settings
// form whether one is already configured, so it can show "leave blank to
// keep the current password" instead of a real value it never received.
export interface MailSettingsRecord {
  id: string
  host: string
  port: number
  secure: boolean
  user: string | null
  hasPassword: boolean
  fromAddress: string
  fromName: string | null
  bccFromAddress: boolean
  updatedAt: string
}

export interface MailSettingsInput {
  host: string
  port: number
  secure: boolean
  user?: string | null
  password?: string
  fromAddress: string
  fromName?: string | null
  bccFromAddress?: boolean
}

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')
}

async function parseJsonOrThrow(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // Ignore body parse failures; use the generic message above.
    }
    throw new Error(message)
  }
  return res.json()
}

export async function fetchMailSettings(baseUrl: string): Promise<MailSettingsRecord | null> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-settings`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function saveMailSettings(baseUrl: string, input: MailSettingsInput): Promise<MailSettingsRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export interface SendTestMailInput {
  from?: string
  to: string
  cc?: string
  subject: string
  html?: string
  text?: string
}

export async function sendTestMail(baseUrl: string, input: SendTestMailInput): Promise<{ ok: boolean }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-settings/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

// Every sendMail() attempt is logged server-side (Settings → Mail → Log).
// The list response strips the body (html/text); fetchMailLogEntry returns
// the full entry for the preview modal.
export interface MailLogEntry {
  id: string
  to: string
  from: string | null
  cc: string | null
  subject: string
  html?: string | null
  text?: string | null
  status: 'sent' | 'failed'
  error: string | null
  sentAt: string
}

export interface MailLogListResult {
  records: MailLogEntry[]
  total: number
}

export async function fetchMailLog(
  baseUrl: string,
  options?: {
    status?: 'sent' | 'failed'
    search?: string
    order?: 'newest' | 'oldest'
    limit?: number
    offset?: number
  },
): Promise<MailLogListResult> {
  const params = new URLSearchParams()
  if (options?.status) params.set('status', options.status)
  if (options?.search) params.set('search', options.search)
  if (options?.order) params.set('order', options.order)
  if (options?.limit != null) params.set('limit', String(options.limit))
  if (options?.offset != null) params.set('offset', String(options.offset))
  const qs = params.toString()
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-log${qs ? `?${qs}` : ''}`, { credentials: 'include' })
  const data = await parseJsonOrThrow(res)
  return { records: data.records ?? [], total: data.total ?? 0 }
}

export async function deleteMailLogEntries(baseUrl: string, ids: string[]): Promise<{ deleted: number }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-log/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function fetchMailLogEntry(baseUrl: string, id: string): Promise<MailLogEntry> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-log/${id}`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function resendMail(baseUrl: string, id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-log/${id}/resend`, {
    method: 'POST',
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

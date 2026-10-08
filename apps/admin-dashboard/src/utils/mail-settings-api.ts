import { getDefaultCoreApiUrl } from './auth-api'

// Passwords and API keys are write-only: the server never returns them, only whether they are set (`hasPassword`,
// `secretsSet`), so the form can say "leave blank to keep the current one" instead of showing a value it never had.

/** A mail configuration as the server shows it. */
export interface MailSettingsView {
  scope: 'website' | 'default'
  websiteId: string | null
  /** `smtp` or the id of a mail provider */
  provider: string
  smtp: { host: string | null; port: number | null; secure: boolean; user: string | null; hasPassword: boolean }
  /** the provider's non-secret fields */
  providerConfig: Record<string, string>
  /** which secret fields of the provider have a value stored */
  secretsSet: Record<string, boolean>
  fromAddress: string | null
  fromName: string | null
  bccFromAddress: boolean
  updatedAt: string
}

export interface MailSettingsResponse {
  websiteId: string | null
  /** this scope's own configuration (null = none yet; for a website that means it uses the default) */
  settings: MailSettingsView | null
  /** what a message of this scope is sent with */
  effective: { scope: 'website' | 'default'; provider: string; fromAddress: string | null } | null
  /** false: the server has no MAIL_SETTINGS_ENCRYPTION_KEY, so no password or API key can be saved */
  encryptionConfigured: boolean
}

export interface MailProviderField { name: string; label: string; required?: boolean; secret?: boolean; help?: string }
export interface MailProviderInfo {
  id: string
  label: string
  description: string | null
  docsUrl: string | null
  configFields: MailProviderField[]
  capabilities: { html?: boolean; text?: boolean; attachments?: boolean; cc?: boolean; bccMax?: number }
}

export interface MailSettingsInput {
  /** omitted = the default configuration */
  websiteId?: string | null
  provider: string
  smtp?: { host: string; port: number; secure: boolean; user?: string | null; password?: string; clearPassword?: boolean }
  providerConfig?: Record<string, string>
  fromAddress?: string | null
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

export async function fetchMailSettings(baseUrl: string, websiteId?: string | null): Promise<MailSettingsResponse> {
  const qs = websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ''
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-settings${qs}`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function fetchMailProviders(baseUrl: string): Promise<MailProviderInfo[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-providers`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function saveMailSettings(baseUrl: string, input: MailSettingsInput): Promise<{ settings: MailSettingsView }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

/** A website stops having its own configuration and uses the default again. */
export async function removeWebsiteMailSettings(baseUrl: string, websiteId: string): Promise<{ removed: boolean }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/mail-settings?websiteId=${encodeURIComponent(websiteId)}`, { method: 'DELETE', credentials: 'include' })
  return parseJsonOrThrow(res)
}

export interface SendTestMailInput {
  /** whose configuration sends it; omitted = the default */
  websiteId?: string | null
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
  /** `smtp` or a provider id; the provider's id for the message; the website whose settings were used */
  provider?: string | null
  reference?: string | null
  websiteId?: string | null
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

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

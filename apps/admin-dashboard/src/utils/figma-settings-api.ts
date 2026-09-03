import { getDefaultCoreApiUrl } from './auth-api'

function normalizeBaseUrl(baseUrl: string): string {
  const url = baseUrl || getDefaultCoreApiUrl()
  return url.replace(/\/+$/, '')
}

async function parseJsonOrThrow(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch { /* ignore */ }
    throw new Error(message)
  }
  return res.json()
}

export interface FigmaSettingsRecord {
  id: string
  teamId: string | null
  hasToken: boolean
  updatedAt: string
}

export interface FigmaSettingsInput {
  accessToken?: string
  teamId?: string | null
}

export async function fetchFigmaSettings(baseUrl?: string): Promise<FigmaSettingsRecord | null> {
  const url = `${normalizeBaseUrl(baseUrl ?? '')}/figma/settings`
  const res = await fetch(url, { credentials: 'include' })
  if (res.status === 401) throw new Error('Authentication required')
  if (!res.ok) return null
  return res.json()
}

export async function saveFigmaSettings(baseUrl: string | undefined, input: FigmaSettingsInput): Promise<FigmaSettingsRecord> {
  const url = `${normalizeBaseUrl(baseUrl ?? '')}/figma/settings`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}
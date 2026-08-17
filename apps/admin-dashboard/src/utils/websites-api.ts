import { getDefaultCoreApiUrl } from './auth-api'

export interface WebsiteRecord {
  id: string
  name: string
  domains: string[]
  defaultLocale: string
  supportedLocales: string[]
  settings: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
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

export async function fetchWebsites(baseUrl: string): Promise<WebsiteRecord[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.websites
}

export async function fetchWebsiteById(baseUrl: string, id: string): Promise<WebsiteRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.website
}

export async function createWebsite(
  baseUrl: string,
  input: {
    name: string
    domains?: string[]
    defaultLocale?: string
    supportedLocales?: string[]
    settings?: Record<string, unknown>
  }
): Promise<WebsiteRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.website
}

export async function updateWebsite(
  baseUrl: string,
  id: string,
  input: {
    name?: string
    domains?: string[]
    defaultLocale?: string
    supportedLocales?: string[]
    settings?: Record<string, unknown>
  }
): Promise<WebsiteRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.website
}

export async function deleteWebsite(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}

export interface WebsiteTheme {
  colors: { name: string; hex: string }[]
  fonts: string[]
}

export async function fetchWebsiteTheme(baseUrl: string, id: string): Promise<WebsiteTheme> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}/theme`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.theme
}

export async function updateWebsiteTheme(baseUrl: string, id: string, theme: WebsiteTheme): Promise<WebsiteTheme> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}/theme`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(theme),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.theme
}
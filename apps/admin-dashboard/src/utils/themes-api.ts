import { getDefaultCoreApiUrl } from './auth-api'

export interface ThemeRecord {
  id: string
  name: string
  colors: { name: string; hex: string }[]
  fonts: string[]
  styles: string
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
      // Ignore
    }
    throw new Error(message)
  }
  return res.json()
}

export async function fetchThemes(baseUrl: string): Promise<ThemeRecord[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/themes`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.themes
}

export async function fetchThemeById(baseUrl: string, id: string): Promise<ThemeRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/themes/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.theme
}

export async function createTheme(
  baseUrl: string,
  input: { name: string; colors?: { name: string; hex: string }[]; fonts?: string[]; styles?: string }
): Promise<ThemeRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/themes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.theme
}

export async function updateTheme(
  baseUrl: string,
  id: string,
  input: { name?: string; colors?: { name: string; hex: string }[]; fonts?: string[]; styles?: string }
): Promise<ThemeRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/themes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.theme
}

export async function deleteTheme(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/themes/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}
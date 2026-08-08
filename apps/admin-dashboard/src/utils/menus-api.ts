import { getDefaultCoreApiUrl } from './auth-api'

export interface MenuItem {
  label: string
  pageId?: string | null
  url?: string | null
  children?: MenuItem[]
}

export interface MenuRecord {
  id: string
  websiteId: string
  name: string
  items: MenuItem[]
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

export async function fetchMenus(baseUrl: string, websiteId?: string): Promise<MenuRecord[]> {
  const params = websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ''
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/menus${params}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.menus
}

export async function fetchMenuById(baseUrl: string, id: string): Promise<MenuRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/menus/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.menu
}

export async function createMenu(
  baseUrl: string,
  input: {
    websiteId: string
    name: string
    items?: MenuItem[]
  }
): Promise<MenuRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/menus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.menu
}

export async function updateMenu(
  baseUrl: string,
  id: string,
  input: {
    name?: string
    items?: MenuItem[]
  }
): Promise<MenuRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/menus/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.menu
}

export async function deleteMenu(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/menus/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}
import { getDefaultCoreApiUrl } from './auth-api'

export interface MenuItem {
  label: string
  pageId?: string | null
  url?: string | null
  path?: string | null
  children?: MenuItem[]
}

export interface WebsitePathRecord {
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

export async function fetchWebsitePaths(baseUrl: string, websiteId?: string): Promise<WebsitePathRecord[]> {
  const params = websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ''
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/website-paths${params}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.paths
}

export async function fetchWebsitePathById(baseUrl: string, id: string): Promise<WebsitePathRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/website-paths/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.path
}

export async function createWebsitePath(
  baseUrl: string,
  input: {
    websiteId: string
    name: string
    items?: MenuItem[]
  }
): Promise<WebsitePathRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/website-paths`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.path
}

export async function updateWebsitePath(
  baseUrl: string,
  id: string,
  input: {
    name?: string
    items?: MenuItem[]
  }
): Promise<WebsitePathRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/website-paths/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.path
}

export async function deleteWebsitePath(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/website-paths/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}
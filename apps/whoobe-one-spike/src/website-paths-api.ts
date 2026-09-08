import { getDefaultCoreApiUrl } from './core-api-url'

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

async function parseJsonOrThrow(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {}
    throw new Error(message)
  }
  return res.json()
}

export async function fetchWebsitePaths(websiteId?: string): Promise<WebsitePathRecord[]> {
  const params = websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ''
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/website-paths${params}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.paths
}
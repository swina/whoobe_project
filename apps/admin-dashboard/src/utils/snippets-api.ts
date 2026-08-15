import { getDefaultCoreApiUrl } from './auth-api'

// whoobe_one_snippets - reusable Element subtrees saved from the Whoobe One
// editor (apps/whoobe-one-spike). Listed in the Snippets main item and
// referenced by website-template slots.
export interface WhoobeSnippet {
  id: string
  name: string
  category: string
  icon: string | null
  node: unknown
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

export async function fetchSnippets(baseUrl: string): Promise<WhoobeSnippet[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/snippets`, { credentials: 'include' })
  const data = await parseJsonOrThrow(res)
  return data.snippets ?? []
}

export async function deleteSnippet(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/snippets/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}

import { getDefaultCoreApiUrl } from './core-api-url'

export interface FigmaSettings {
  id: string
  teamId: string | null
  hasToken: boolean
  updatedAt: string
}

export interface FigmaImportResult {
  element: Record<string, unknown>
  name: string
  warnings: string[]
}

export class FigmaApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'FigmaApiError'
  }
}

async function parseJsonOrThrow(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // ignore
    }
    throw new FigmaApiError(message, res.status)
  }
  return res.json()
}

export async function fetchFigmaSettings(): Promise<FigmaSettings | null> {
  try {
    const res = await fetch(`${getDefaultCoreApiUrl()}/figma/settings`, {
      method: 'GET',
      credentials: 'include',
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export interface ImportFigmaOptions {
  fileKey: string
  nodeId?: string
  mode: 'page' | 'snippet'
}

export async function importFromFigma(options: ImportFigmaOptions): Promise<FigmaImportResult> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/figma/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}
import { getDefaultCoreApiUrl } from './auth-api'

// GET never returns the real API key - hasApiKey tells the settings form
// whether one is already configured, so it can show "leave blank to keep
// the current key" instead of a real value it never received.
export interface AiSettingsRecord {
  id: string
  provider: string
  model: string
  endpoint: string | null
  hasApiKey: boolean
  updatedAt: string
}

export interface AiSettingsInput {
  provider: string
  model: string
  endpoint?: string | null
  apiKey?: string
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

export async function fetchAiSettings(baseUrl: string): Promise<AiSettingsRecord | null> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/ai/settings`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export interface AiImageSettingsRecord {
  provider: string
  model: string
  endpoint: string | null
  hasApiKey: boolean
  updatedAt: string
}
export interface AiImageSettingsInput {
  provider: string
  model: string
  endpoint?: string | null
  apiKey?: string
}

export async function fetchAiImageSettings(baseUrl: string): Promise<{ settings: AiImageSettingsRecord | null; usingFallback: boolean }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/ai/image-settings`, { credentials: 'include' })
  return res.json()
}

export async function saveAiImageSettings(baseUrl: string, input: AiImageSettingsInput): Promise<AiImageSettingsRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/ai/image-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to save AI image settings')
  }
  return res.json()
}

export async function saveAiSettings(baseUrl: string, input: AiSettingsInput): Promise<AiSettingsRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/ai/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export interface AiGeneratedImage {
  damUrl: string
  s3Key: string
  assetId: string
  revisedPrompt?: string
}

export async function generateAiImage(
  baseUrl: string,
  prompt: string,
  options?: { n?: number; size?: string; quality?: string; style?: string; folderPath?: string }
): Promise<{ images: AiGeneratedImage[] }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/ai/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...options }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}
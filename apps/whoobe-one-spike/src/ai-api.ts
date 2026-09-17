// Client for the AI generation endpoint on this monorepo's backend
// (apps/core-api POST /ai/generate, docs/plans/ai/ai-pages-snippets-
// generator.md). Same shape as snippets-api.ts: no login flow of its own
// in this app, so the call only succeeds with an existing session cookie
// for the current hostname (see dam-api.ts's own header comment) - a 401
// means "log into the admin dashboard again", surfaced as such by
// AiGenerateModal.vue.

export interface AiGenerateContext {
  // Snippet-only: the selected node's tag the generated tree will be
  // inserted near.
  selectedTag?: string | null
  // Page-only: the open page's metadata, so the model can match tone.
  pageTitle?: string | null
  pageCategory?: string | null
}

export class AiApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'AiApiError'
  }
}

import { getDefaultCoreApiUrl } from './core-api-url'

async function parseJsonOrThrow(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // Ignore body parse failures; use the generic message above.
    }
    throw new AiApiError(message, res.status)
  }
  return res.json()
}

/** Generates inline text content for a single element. Returns the
 *  generated text string, or throws AiApiError on failure. */
export async function generateAiText(tag: string, existingContent: string | null, prompt: string, roleHint?: string | null): Promise<string> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'text',
      prompt,
      context: { tag, existingContent, roleHint },
    }),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return (body.text as string) ?? ''
}

/** Generates a Whoobe One Element tree (snippet or whole-page root) from a
 *  text prompt. Returns the validated payload JSON - a plain object graph
 *  matching ElementsClass.js's Element shape, ready for
 *  cloneWithFreshIds() + insertion into the editor document. */
export async function generateAi(kind: 'snippet' | 'page', prompt: string, context: AiGenerateContext = {}): Promise<unknown> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, prompt, context }),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.payload
}

export interface AiInfo {
  provider: string
  model: string
  hasApiKey: boolean
}

/** Reads the stored AI provider/model config (Settings → AI) so the modal
 *  can tell the user which agent will generate. The API key is never
 *  returned by the backend. Fails (null) when unconfigured, unauthenticated
 *  or on network errors - the modal just falls back to hiding the line. */
export async function fetchAiInfo(): Promise<AiInfo | null> {
  try {
    const res = await fetch(`${getDefaultCoreApiUrl()}/ai/settings`, {
      method: 'GET',
      credentials: 'include',
    })
    if (!res.ok) return null
    const body = await res.json()
    if (!body?.provider || !body?.model) return null
    return { provider: body.provider, model: body.model, hasApiKey: !!body.hasApiKey }
  } catch {
    return null
  }
}

export interface AiGeneratedRecord {
  id: string
  kind: 'snippet' | 'page'
  prompt: string
  provider: string | null
  model: string | null
  payload: unknown
  status: string
  error: string | null
  createdAt: string
}

export interface AiImageSettings {
  provider: string
  model: string
  hasApiKey: boolean
}

export interface AiImageInfo {
  settings: AiImageSettings | null
  usingFallback: boolean
}

export async function generateImage(prompt: string, options?: {
  n?: number
  size?: string
  quality?: string
  style?: string
  folderPath?: string
}): Promise<{ images: { damUrl: string; assetId: string; revisedPrompt?: string }[] }> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/ai/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...options }),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body
}

export async function fetchAiImageInfo(): Promise<AiImageInfo | null> {
  try {
    const res = await fetch(`${getDefaultCoreApiUrl()}/ai/image-settings`, { credentials: 'include' })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

/** Recent AI generation history (GET /ai/generated) filtered to records
 *  that actually carry a validated Element-tree payload - the rest (failed
 *  calls, rejected trees) are noise for the editor's re-import panel. */
export async function listAiGenerations(): Promise<AiGeneratedRecord[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/ai/generated`, {
    method: 'GET',
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return (body?.records ?? []).filter((record: AiGeneratedRecord) => record.payload != null)
}
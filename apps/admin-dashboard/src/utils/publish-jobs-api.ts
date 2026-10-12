import { getDefaultCoreApiUrl } from './auth-api'

export type PublishJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface PublishJobOptionsInput {
  apiUrl: string
  framework: 'next' | 'vue'
  slug: string
  revalidate: number
  domain?: string
  assetBaseUrl?: string
  gatewayUrl?: string
  basePath?: string
}

export interface PublishJobView {
  id: string
  websiteId: string
  status: PublishJobStatus
  error: string | null
  releasePath: string | null
  cancelRequested: boolean
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  /** The part of the log after the offset asked for. */
  log: string
  logSize: number
}

const base = (): string => getDefaultCoreApiUrl().replace(/\/+$/, '')

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try { const b = await res.json(); if (b?.error) message = b.error } catch { /* generic message */ }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export const isActive = (s: PublishJobStatus): boolean => s === 'queued' || s === 'running'

export async function startPublishJob(websiteId: string, options: PublishJobOptionsInput, siteApiKey?: string): Promise<{ id: string }> {
  const res = await fetch(`${base()}/publish/jobs`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ websiteId, options, ...(siteApiKey ? { siteApiKey } : {}) }) })
  return json(res)
}

export async function getPublishJob(id: string, from = 0): Promise<PublishJobView> {
  return json(await fetch(`${base()}/publish/jobs/${id}?from=${from}`, { credentials: 'include' }))
}

export async function listPublishJobs(websiteId: string): Promise<{ jobs: Omit<PublishJobView, 'log' | 'logSize'>[] }> {
  return json(await fetch(`${base()}/publish/jobs?websiteId=${encodeURIComponent(websiteId)}`, { credentials: 'include' }))
}

export async function cancelPublishJob(id: string): Promise<void> {
  await json(await fetch(`${base()}/publish/jobs/${id}/cancel`, { method: 'POST', credentials: 'include' }))
}

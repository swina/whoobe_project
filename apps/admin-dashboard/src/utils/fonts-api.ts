import { getDefaultCoreApiUrl } from './auth-api'

export interface CustomFont {
  id: string
  family: string
  weight: number
  style: 'normal' | 'italic'
  assetPath: string
  /** false when the file was deleted, made private or is not a woff2 any more */
  available: boolean
  /** relative to the origin that serves `/dam-asset/` */
  url: string | null
}

export interface CustomFontInput {
  family: string
  weight: number
  style: 'normal' | 'italic'
  assetPath: string
}

const base = (baseUrl?: string): string => (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')

async function parse(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try { const body = await res.json(); if (body?.error) message = body.error } catch { /* ignore */ }
    throw new Error(message)
  }
  return res.json()
}

export async function fetchFonts(baseUrl?: string): Promise<CustomFont[]> {
  const body = await parse(await fetch(`${base(baseUrl)}/fonts`, { credentials: 'include' }))
  return body.fonts ?? []
}

export async function createFont(baseUrl: string | undefined, input: CustomFontInput): Promise<CustomFont> {
  const res = await fetch(`${base(baseUrl)}/fonts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), credentials: 'include' })
  return (await parse(res)).font
}

export async function deleteFont(baseUrl: string | undefined, id: string): Promise<void> {
  await parse(await fetch(`${base(baseUrl)}/fonts/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' }))
}

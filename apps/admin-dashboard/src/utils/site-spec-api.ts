// Client of the site specification routes (docs/plans/ai/ai-site-spec.md): the material to take to a language model, and the check / import of the
// file it writes. Nothing here talks to a model or to any server but the installation's own API.
import { getDefaultCoreApiUrl } from './auth-api'

export interface SiteSpecMaterial {
  version: number
  limits: Record<string, number>
  instructions: string
  schema: Record<string, unknown>
  examples: { name: string; spec: unknown }[]
}

/** One problem of the file: where it is in words, the machine path and what is wrong. */
export interface SiteSpecIssue { path: string; where: string; message: string }

export interface SiteSpecConflict { kind: 'theme' | 'snippet'; name: string; choice: 'existing' | 'new'; createdAs?: string }

export interface SiteSpecSummary {
  website: { name: string; rootPath: string; rootPathTaken: boolean; locales: string[] }
  pages: { slug: string; title: string; locale: string }[]
  snippets: { name: string; action: 'create' | 'use-existing' }[]
  theme: { name: string; action: 'create' | 'use-existing' } | null
  layout: string[]
}

export interface SiteSpecOutcome {
  dryRun: boolean
  conflicts: SiteSpecConflict[]
  summary: SiteSpecSummary
  report?: { warnings: string[] }
  website?: { id: string; name: string; rootPath: string }
}

export interface SiteSpecChoices { themes: Record<string, 'existing' | 'new'>; snippets: Record<string, 'existing' | 'new'> }

/** The file is not valid: each issue has its place. */
export class SiteSpecInvalid extends Error {
  constructor(readonly issues: SiteSpecIssue[]) { super('The specification is not valid') }
}

const base = (baseUrl: string) => (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')

export async function fetchSiteSpecMaterial(baseUrl: string): Promise<SiteSpecMaterial> {
  const res = await fetch(`${base(baseUrl)}/whoobe-one/site-spec/material`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Could not load the material (status ${res.status})`)
  return res.json()
}

/** `dryRun` checks and reports; without it the website is created (as a draft). */
export async function submitSiteSpec(
  baseUrl: string,
  body: { spec: unknown; choices?: SiteSpecChoices; website?: { name?: string; rootPath?: string } },
  dryRun: boolean
): Promise<SiteSpecOutcome> {
  const res = await fetch(`${base(baseUrl)}/whoobe-one/websites/from-spec${dryRun ? '?dryRun=1' : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })
  let json: any = null
  try { json = await res.json() } catch { /* a body that is not JSON is reported by status below */ }
  if (res.ok) return json
  if (res.status === 400 && Array.isArray(json?.issues)) throw new SiteSpecInvalid(json.issues)
  throw new Error(json?.error || `Request failed with status ${res.status}`)
}

/** Reads what the person pasted. A model often wraps its answer in a Markdown fence: that is taken off. */
export function readSiteSpecText(text: string): { spec: unknown } | { error: string } {
  let t = text.trim()
  const fenced = t.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```\s*$/)
  if (fenced) t = fenced[1].trim()
  if (!t) return { error: 'Paste the answer of the model (or choose a file) first.' }
  try {
    const spec = JSON.parse(t)
    if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) return { error: 'The text is JSON, but not one object: the specification is a single { ... } object.' }
    return { spec }
  } catch (e: any) {
    return { error: `The text is not valid JSON (${e?.message ?? 'parse error'}). If the model added words before or after the JSON, remove them.` }
  }
}

/** Copies to the clipboard. The Clipboard API exists only on https or localhost, and an installation on a LAN is often plain http: fall back to the old way. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function downloadText(filename: string, text: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

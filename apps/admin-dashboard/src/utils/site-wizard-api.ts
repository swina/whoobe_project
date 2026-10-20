// Client of the template wizard routes (docs/plans/ai/template-wizard.md): the choices it offers, and the check / creation of a site from the answers.
import { getDefaultCoreApiUrl } from './auth-api'
import { SiteSpecInvalid, type SiteSpecChoices, type SiteSpecOutcome } from './site-spec-api'

export type BlockType = 'hero' | 'banner' | 'cta' | 'box-grid-3' | 'box-grid-6' | 'form'
export type PresetName = 'dark' | 'light' | 'light-colors' | 'blue-navy'

export type BlockChoice = { type: BlockType } | { snippet: string; category: BlockType }
export interface PageAnswer { title: string; blocks: BlockChoice[] }

export interface WizardAnswers {
  name: string
  language: string
  sector: string
  context?: string
  theme: { preset: PresetName } | { background: string }
  accent?: string
  font: 'sans' | 'serif'
  pages: PageAnswer[]
  headerButton: boolean
}

export interface WizardOptions {
  limits: { maxPages: number; maxBlocksPerPage: number; maxNameLength: number; maxContextLength: number }
  sectors: { id: string; label: string; defaultContext: string; suggested: PageAnswer[] }[]
  blocks: { type: BlockType; label: string; description: string }[]
  themes: { id: PresetName; label: string; palette: Record<string, string> }[]
  fonts: { id: 'sans' | 'serif'; label: string }[]
  texts: { placeholderLanguages: string[]; ai: { available: boolean } }
  snippets: { name: string; category: string; block: BlockType }[]
}

export interface WizardOutcome extends SiteSpecOutcome { notes: string[] }

const base = (baseUrl: string) => (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')

export async function fetchWizardOptions(baseUrl: string): Promise<WizardOptions> {
  const res = await fetch(`${base(baseUrl)}/whoobe-one/site-wizard/options`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Could not load the options of the wizard (status ${res.status})`)
  return res.json()
}

/** `dryRun` checks and reports; without it the website is created (as a draft). */
export async function submitWizard(
  baseUrl: string,
  body: { answers: WizardAnswers; choices?: SiteSpecChoices; website?: { name?: string; rootPath?: string } },
  dryRun: boolean
): Promise<WizardOutcome> {
  const res = await fetch(`${base(baseUrl)}/whoobe-one/websites/from-wizard${dryRun ? '?dryRun=1' : ''}`, {
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

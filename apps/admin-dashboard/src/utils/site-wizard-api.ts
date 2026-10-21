// Client of the template wizard routes (docs/plans/ai/template-wizard.md): the choices it offers, and the check / creation of a site from the answers.
import { getDefaultCoreApiUrl } from './auth-api'
import { SiteSpecInvalid, type SiteSpecChoices, type SiteSpecOutcome } from './site-spec-api'

export type BlockType = 'hero' | 'banner' | 'cta' | 'box-grid-3' | 'box-grid-6' | 'form' | 'title'
/** What a library snippet can stand for: a block, or `custom` (a block of its own, named by whoever marked the snippet) */
export type SnippetBlockType = BlockType | 'custom'
export type PresetName = 'dark' | 'light' | 'light-colors' | 'blue-navy'

export type BlockChoice = { type: BlockType } | { snippet: string; category: SnippetBlockType }
export interface PageAnswer { title: string; blocks: BlockChoice[] }

export interface WizardAnswers {
  name: string
  language: string
  sector: string
  context?: string
  theme: { preset: PresetName } | { palette: string } | { background: string }
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
  /** palettes made by a person (Manage palettes), with the colours that are hard to read in them */
  palettes: WizardPalette[]
  fonts: { id: 'sans' | 'serif'; label: string }[]
  texts: { placeholderLanguages: string[]; ai: { available: boolean } }
  /** `marked`: set as a wizard block in Content > Snippets (listed with the blocks); otherwise only its category names a block */
  snippets: { name: string; category: string; block: SnippetBlockType; marked?: boolean; label?: string }[]
}

export const PALETTE_ROLES = ['bg', 'bgAlt', 'card', 'text', 'muted', 'border', 'accent', 'onAccent'] as const
export type PaletteColors = Record<(typeof PALETTE_ROLES)[number], string>
export interface WizardPalette { id: string; name: string; palette: PaletteColors; warnings: string[] }

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
  body: { answers: WizardAnswers; choices?: SiteSpecChoices; website?: { name?: string; rootPath?: string }; texts?: Record<string, string> },
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

async function paletteRequest(baseUrl: string, method: 'POST' | 'PUT' | 'DELETE', id: string | null, body?: { name: string; colors: PaletteColors }): Promise<any> {
  const res = await fetch(`${base(baseUrl)}/whoobe-one/site-wizard/palettes${id ? `/${encodeURIComponent(id)}` : ''}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  let json: any = null
  try { json = await res.json() } catch { /* reported by status */ }
  if (!res.ok) throw new Error([json?.error || `The request failed (status ${res.status})`, ...(json?.issues ?? [])].join(': '))
  return json
}

/** Saves a palette (a new one, or a change of `id`). A palette with colours that are hard to read is saved all the same; `warnings` lists them. */
export async function savePalette(baseUrl: string, id: string | null, body: { name: string; colors: PaletteColors }): Promise<{ palette: { id: string; name: string; colors: PaletteColors }; warnings: string[] }> {
  return paletteRequest(baseUrl, id ? 'PUT' : 'POST', id, body)
}

export async function removePalette(baseUrl: string, id: string): Promise<void> {
  await paletteRequest(baseUrl, 'DELETE', id)
}

export interface AiTexts { texts: Record<string, string>; used: number; dropped: number; slots: number; meta: Record<string, { label: string; max: number }> }

/** Asks the configured model for the texts of the slots of this structure. Creates nothing: the person reads the texts, then they travel with the answers. */
export async function generateWizardTexts(baseUrl: string, body: { answers: WizardAnswers; description?: string }): Promise<AiTexts> {
  const res = await fetch(`${base(baseUrl)}/ai/generate-wizard-texts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })
  let json: any = null
  try { json = await res.json() } catch { /* reported by status below */ }
  if (!res.ok) throw new Error(json?.error || `The texts could not be written (status ${res.status})`)
  return json
}

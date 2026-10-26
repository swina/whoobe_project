import { getDefaultCoreApiUrl } from './auth-api'

// Token usage of the AI functions per user (docs/plans/ai/ai-usage-plan.md): counts only, never prompts or answers.

/** What one AI request consumed; every AI answer of core-api carries it as `usage` */
export interface AiUsage {
  calls: number
  inputTokens: number | null
  outputTokens: number | null
}

export interface AiUsageTotals { requests: number; errors: number; calls: number; inputTokens: number; outputTokens: number }
export interface AiUsageUserTotals extends AiUsageTotals { userId: string; email: string | null; displayName: string | null }
export interface AiUsageGroupTotals extends AiUsageTotals { key: string }
export interface AiUsageCall {
  createdAt: string; kind: string; provider: string | null; model: string | null
  calls: number; inputTokens: number | null; outputTokens: number | null; status: string
}
export interface AiUsageMonthRow {
  month: string; userId: string; email: string | null; displayName: string | null
  kind: string; provider: string; model: string; requests: number; calls: number; inputTokens: number; outputTokens: number
}
export interface AiUsageReport {
  /** false while the administrator has not turned the tracking on: nothing new is recorded */
  tracking: boolean
  retentionDays: number | null
  from: string; to: string
  total: AiUsageTotals
  byUser: AiUsageUserTotals[]
  byKind: AiUsageGroupTotals[]
  byModel: AiUsageGroupTotals[]
  byDay: AiUsageGroupTotals[]
  calls?: AiUsageCall[]
}
export interface AiUsageOwnReport extends AiUsageReport { monthly: AiUsageMonthRow[] }

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { credentials: 'include' })
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

const query = (q: Record<string, string | undefined>): string => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Everyone's usage in [from, to] (YYYY-MM-DD); with userId that person's requests (written to the audit log). */
export async function fetchAiUsage(baseUrl: string, q: { from?: string; to?: string; userId?: string }): Promise<AiUsageReport> {
  return getJson(`${normalizeBaseUrl(baseUrl)}/ai/usage${query(q)}`)
}

export async function fetchAiUsageMonthly(baseUrl: string, q: { from?: string; to?: string; userId?: string }): Promise<{ tracking: boolean; rows: AiUsageMonthRow[] }> {
  return getJson(`${normalizeBaseUrl(baseUrl)}/ai/usage/monthly${query(q)}`)
}

export async function fetchOwnAiUsage(baseUrl: string, q: { from?: string; to?: string }): Promise<AiUsageOwnReport> {
  return getJson(`${normalizeBaseUrl(baseUrl)}/ai/usage/me${query(q)}`)
}

/** "1,234 in · 567 out" (or the number of calls when the provider reports no tokens) */
export function formatAiUsage(u: AiUsage | null | undefined): string {
  if (!u || !u.calls) return ''
  if (u.inputTokens === null && u.outputTokens === null) return `${u.calls} call${u.calls === 1 ? '' : 's'}, tokens not reported by the provider`
  const n = (v: number | null) => (v ?? 0).toLocaleString()
  return `${n(u.inputTokens)} tokens in · ${n(u.outputTokens)} out${u.calls > 1 ? ` (${u.calls} calls)` : ''}`
}

/** Rows to a CSV file the browser downloads. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]): void {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    // a leading = + - @ would be read as a formula by a spreadsheet
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const blob = new Blob([[header, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n'], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const AI_USAGE_EVENT = 'whoobe:ai-usage'

/** fetch() for an AI route: the answer, failed or not, carries what the request consumed; it is announced to
 *  AiUsageToast (mounted once in the app) from a copy of the response, so the caller reads the body as before. */
export async function aiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  res.clone().json().then((body) => {
    if (body?.usage?.calls) window.dispatchEvent(new CustomEvent(AI_USAGE_EVENT, { detail: body.usage as AiUsage }))
  }).catch(() => { /* not JSON: nothing to announce */ })
  return res
}

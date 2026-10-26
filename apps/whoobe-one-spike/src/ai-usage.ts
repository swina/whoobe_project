// What an AI request consumed (core-api adds `usage` to every AI answer, docs/plans/ai/ai-usage-plan.md): shown to the
// person who asked by AiUsageToast. Same as apps/admin-dashboard/src/utils/ai-usage-api.ts (separate apps, no shared package).

export interface AiUsage {
  calls: number
  inputTokens: number | null
  outputTokens: number | null
}

export const AI_USAGE_EVENT = 'whoobe:ai-usage'

/** fetch() for an AI route: the usage of the answer, failed or not, is announced from a copy of the response. */
export async function aiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  res.clone().json().then((body) => {
    if (body?.usage?.calls) window.dispatchEvent(new CustomEvent(AI_USAGE_EVENT, { detail: body.usage as AiUsage }))
  }).catch(() => { /* not JSON: nothing to announce */ })
  return res
}

/** "1,234 tokens in · 567 out" (or the number of calls when the provider reports no tokens) */
export function formatAiUsage(u: AiUsage | null | undefined): string {
  if (!u || !u.calls) return ''
  if (u.inputTokens === null && u.outputTokens === null) return `${u.calls} call${u.calls === 1 ? '' : 's'}, tokens not reported by the provider`
  const n = (v: number | null) => (v ?? 0).toLocaleString()
  return `${n(u.inputTokens)} tokens in · ${n(u.outputTokens)} out${u.calls > 1 ? ` (${u.calls} calls)` : ''}`
}

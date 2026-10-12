// The checks of the Publish tab, run from the browser (so a gateway URL typed by the user is never fetched by the server: no SSRF):
// what the published pages use of the API Gateway, whether a gateway answers at a URL, whether the bindings resolve there.
import { scanGatewayUsage, type GatewayUsage } from '@whoobe-cms/schema'

const ZERO_ID = '00000000-0000-0000-0000-000000000000'
const trim = (u: string) => u.replace(/\/+$/, '')

/** The gateway usage of the website's published pages (the public pages endpoint, as the generator reads it). */
export async function fetchGatewayUsage(apiUrl: string, websiteId: string): Promise<GatewayUsage> {
  const res = await fetch(`${trim(apiUrl)}/public/pages?websiteId=${encodeURIComponent(websiteId)}`)
  if (!res.ok) throw new Error(`The pages could not be read (${res.status})`)
  const body = await res.json() as { pages?: { content?: unknown }[] }
  const total: GatewayUsage = { gateway: 0, dangling: 0, bindings: [] }
  const ids = new Set<string>()
  for (const p of body.pages ?? []) {
    const u = scanGatewayUsage(p.content)
    total.gateway += u.gateway
    total.dangling += u.dangling
    u.bindings.forEach((b) => ids.add(b))
  }
  total.bindings = [...ids]
  return total
}

export type GatewayProbe = 'gateway' | 'other' | 'unreachable'

/** A Whoobe Gateway answers a resolve call with JSON even for an unknown id; the core-api ("Cannot POST") or another server does not.
 *  `unreachable`: no answer from this browser (down, blocked by CORS, or not an address at all). */
export async function probeGateway(url: string): Promise<GatewayProbe> {
  try {
    const res = await fetch(`${trim(url)}/api/v1/gateway/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bindingId: ZERO_ID }),
    })
    return (res.headers.get('content-type') ?? '').includes('application/json') ? 'gateway' : 'other'
  } catch {
    return 'unreachable'
  }
}

export interface BindingCheck { resolved: number; needsKey: number; failed: string[] }

/** Resolves every binding at the gateway. 401/403 means the website's gateway site key is required (the key is not available here). */
export async function checkBindings(url: string, ids: string[]): Promise<BindingCheck> {
  const out: BindingCheck = { resolved: 0, needsKey: 0, failed: [] }
  for (let i = 0; i < ids.length; i += 5) {
    await Promise.all(ids.slice(i, i + 5).map(async (id) => {
      try {
        const res = await fetch(`${trim(url)}/api/v1/gateway/resolve`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bindingId: id }),
        })
        if (res.ok) out.resolved++
        else if (res.status === 401 || res.status === 403) out.needsKey++
        else out.failed.push(`${id.slice(0, 8)}… (${res.status})`)
      } catch {
        out.failed.push(`${id.slice(0, 8)}… (unreachable)`)
      }
    }))
  }
  return out
}

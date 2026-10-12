#!/usr/bin/env node
// Helper of publish-site.sh: everything that needs the network or the page content (so the shell script stays a thin prompt).
//   sites <apiUrl>                          -> "<id>\t<name>" per website
//   scan <apiUrl> <websiteId>               -> "gateway=<n>", "dangling=<n>", "bindings=<id,id,...>"
//   probe <gatewayUrl>                      -> exit 0 when a Whoobe Gateway answers there
//   check <gatewayUrl> <websiteId> <ids>    -> exit 1 listing the binding ids the gateway cannot resolve, exit 4 when it only asks for the site key
//                                              (env SITE_KEY: the gateway site key)
//   suggest <apiUrl>                        -> the first candidate URL where a gateway answers (empty line when none)
// Needs Node 20+ (global fetch). The page walking and the candidates are exported for the unit test.

const TIMEOUT_MS = 8000

/** The gateway usage of a page tree: nodes with a resolve binding (container, table, field) and forms posting to an endpoint. */
export function scanTree(tree, acc = { gateway: 0, dangling: 0, bindings: new Set() }) {
  if (!tree || typeof tree !== 'object') return acc
  if (Array.isArray(tree)) { tree.forEach((n) => scanTree(n, acc)); return acc }
  const gb = tree.gatewayBinding
  if (gb && typeof gb === 'object') {
    // no binding id: a field of a repeated container (only a `fieldPath`), or one the editor could not pin; the public content has no
    // endpoint name left to tell them apart, so it is not counted
    if (typeof gb.bindingId === 'string' && gb.bindingId) { acc.gateway++; acc.bindings.add(gb.bindingId) }
  }
  const fc = tree.formConfig
  if (fc && typeof fc === 'object' && (fc.gatewayEndpointName || fc.gatewayBindingId)) {
    acc.gateway++
    // a form's SUBMIT binding: the resolve route does not know it (404), so it is counted but not checked
    if (!(typeof fc.gatewayBindingId === 'string' && fc.gatewayBindingId)) acc.dangling++
  }
  for (const child of tree.blocks ?? []) scanTree(child, acc)
  return acc
}

/** Where a gateway may be, given the CMS API URL: the same host on the gateway's own port first, then the API host itself (a proxy). */
export function gatewayCandidates(apiUrl) {
  let u
  try { u = new URL(apiUrl) } catch { return [] }
  const out = []
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname) || u.hostname.endsWith('.local')
  if (local || u.port) out.push(`${u.protocol}//${u.hostname}:3001`)
  out.push(`${u.protocol}//${u.host}`)
  return [...new Set(out)]
}

const get = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return res.json()
}

const post = (url, body, headers = {}) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) })

/** A Whoobe Gateway answers a resolve call with JSON even for an unknown id; any other server (the core-api: "Cannot POST") does not. */
export async function isGateway(url) {
  try {
    const res = await post(`${url.replace(/\/+$/, '')}/api/v1/gateway/resolve`, { bindingId: '00000000-0000-0000-0000-000000000000' })
    return (res.headers.get('content-type') ?? '').includes('application/json')
  } catch {
    return false
  }
}

async function pagesOf(apiUrl, websiteId) {
  const data = await get(`${apiUrl.replace(/\/+$/, '')}/public/pages?websiteId=${encodeURIComponent(websiteId)}`)
  return Array.isArray(data?.pages) ? data.pages : []
}

async function main([cmd, ...args]) {
  switch (cmd) {
    case 'sites': {
      const data = await get(`${args[0].replace(/\/+$/, '')}/public/websites`)
      for (const w of data?.websites ?? []) console.log(`${w.id}\t${String(w.name ?? '').replace(/\s+/g, ' ')}`)
      return 0
    }
    case 'scan': {
      const acc = { gateway: 0, dangling: 0, bindings: new Set() }
      for (const p of await pagesOf(args[0], args[1])) scanTree(p.content, acc)
      console.log(`gateway=${acc.gateway}`)
      console.log(`dangling=${acc.dangling}`)
      console.log(`bindings=${[...acc.bindings].join(',')}`)
      return 0
    }
    case 'probe':
      return (await isGateway(args[0])) ? 0 : 1
    case 'suggest': {
      for (const c of gatewayCandidates(args[0])) if (await isGateway(c)) { console.log(c); return 0 }
      console.log('')
      return 0
    }
    case 'check': {
      const [gatewayUrl, websiteId, ids] = args
      const headers = process.env.SITE_KEY ? { 'X-Whoobe-Site-Id': websiteId, 'X-Whoobe-Site-Key': process.env.SITE_KEY } : {}
      const failed = []
      let needsKey = 0
      for (const id of (ids ?? '').split(',').filter(Boolean)) {
        try {
          const res = await post(`${gatewayUrl.replace(/\/+$/, '')}/api/v1/gateway/resolve`, { bindingId: id }, headers)
          // 401/403 without a site key: the website needs one, which says nothing about the binding
          if ((res.status === 401 || res.status === 403) && !process.env.SITE_KEY) needsKey++
          else if (!res.ok) failed.push(`${id} (${res.status})`)
        } catch (err) {
          failed.push(`${id} (${err instanceof Error ? err.message : 'unreachable'})`)
        }
      }
      for (const f of failed) console.log(f)
      if (needsKey) console.log(`needs-key=${needsKey}`)
      return failed.length ? 1 : needsKey ? 4 : 0
    }
    default:
      console.error('usage: publish-preflight.mjs sites|scan|probe|suggest|check ...')
      return 2
  }
}

import { fileURLToPath } from 'node:url'
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(3) })
}

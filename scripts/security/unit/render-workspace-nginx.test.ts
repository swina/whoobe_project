// scripts/render-workspace-nginx.sh: an existing workspace gets its routing include rendered again from the current
// template and its own .env.<slug> - what used to be a hand edit on the host. Runs the real script in a scratch copy.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'

let root = ''
const run = (...args: string[]) => spawnSync('bash', [join(root, 'scripts/render-workspace-nginx.sh'), ...args], { cwd: root, encoding: 'utf8' })
const env = (extra = '') => `WS_ADMIN_DASHBOARD_PORT=3010\nWS_GATEWAY_PORT=3011\nWS_ASSET_PROCESSOR_PORT=3012\nWS_CORE_API_PORT=3013\nWS_WHOOBE_ONE_SPIKE_PORT=3016\n${extra}`

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'render-ws-'))
  mkdirSync(join(root, 'scripts'))
  mkdirSync(join(root, 'deploy/nginx'), { recursive: true })
  copyFileSync(join(ROOT_DIR, 'scripts/render-workspace-nginx.sh'), join(root, 'scripts/render-workspace-nginx.sh'))
  copyFileSync(join(ROOT_DIR, 'deploy/nginx/_locations.conf.template'), join(root, 'deploy/nginx/_locations.conf.template'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('render-workspace-nginx.sh', () => {
  it('writes the include with the ports and limits of the workspace, no placeholder left', () => {
    writeFileSync(join(root, '.env.acme'), env('WS_MAX_BODY=6M\nWS_EDGE_LIMITS=limit_req zone=x burst=5;\n'))
    const r = run('acme', '--no-reload')
    expect(r.status, r.stderr).toBe(0)
    const out = readFileSync(join(root, 'deploy/nginx/_locations-acme.inc'), 'utf8')
    expect(out).not.toMatch(/__[A-Z_]+__/)
    expect(out).toContain('proxy_pass http://127.0.0.1:3010;')        // dashboard
    expect(out).toContain('proxy_pass http://127.0.0.1:3016;')        // editor (website previews)
    expect(out).toContain('proxy_pass http://127.0.0.1:3013/site-root;')
    expect(out).toMatch(/^client_max_body_size 6M;/m)
    expect(out).toContain('limit_req zone=x burst=5;')
  })

  it('defaults the body cap to 100M', () => {
    writeFileSync(join(root, '.env.acme'), env())
    expect(run('acme', '--no-reload').status).toBe(0)
    expect(readFileSync(join(root, 'deploy/nginx/_locations-acme.inc'), 'utf8')).toMatch(/^client_max_body_size 100M;/m)
  })

  it('keeps the old include as .bak, shows what changes, and a second run changes nothing', () => {
    writeFileSync(join(root, '.env.acme'), env())
    writeFileSync(join(root, 'deploy/nginx/_locations-acme.inc'), 'location / { proxy_pass http://127.0.0.1:3010; }\n')
    const first = run('acme', '--no-reload')
    expect(first.status, first.stderr).toBe(0)
    expect(first.stdout).toContain('What changes')
    expect(readFileSync(join(root, 'deploy/nginx/_locations-acme.inc.bak'), 'utf8')).toBe('location / { proxy_pass http://127.0.0.1:3010; }\n')
    const second = run('acme', '--no-reload')
    expect(second.stdout).toContain('already up to date')
  })

  it('refuses an unknown workspace, a bad slug, and an env file without a port', () => {
    expect(run('nope', '--no-reload').status).not.toBe(0)
    expect(run('../etc', '--no-reload').status).not.toBe(0)
    writeFileSync(join(root, '.env.broken'), 'WS_ADMIN_DASHBOARD_PORT=3010\n')
    const r = run('broken', '--no-reload')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/WS_GATEWAY_PORT is missing/)
    expect(existsSync(join(root, 'deploy/nginx/_locations-broken.inc'))).toBe(false)
  })
})

// Plan 3.12: what docker-compose.yml publishes and which credentials it insists on, checked by rendering it
// (`docker compose config`) with different env files. Needs Docker, like the rest of the suite.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'

let dir = ''
// docker-compose.apps.yml has `env_file: .env`: on a fresh checkout (CI) the file does not exist and `config` fails.
const rootEnv = join(ROOT_DIR, '.env')
let createdRootEnv = false
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'whoobe-compose-'))
  if (!existsSync(rootEnv)) { writeFileSync(rootEnv, ''); createdRootEnv = true }
})
afterAll(() => { rmSync(dir, { recursive: true, force: true }); if (createdRootEnv) rmSync(rootEnv, { force: true }) })

function render(env: Record<string, string>, file = 'docker-compose.yml') {
  const envFile = join(dir, `env-${Math.random().toString(36).slice(2)}`)
  writeFileSync(envFile, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n')
  const r = spawnSync('docker', ['compose', '--env-file', envFile, '-f', join(ROOT_DIR, file), 'config', '--format', 'json'], { encoding: 'utf8', env: { ...process.env, ENV_FILE: envFile } })
  return { status: r.status, stderr: r.stderr, json: r.status === 0 ? JSON.parse(r.stdout) : null }
}

const required = { POSTGRES_PASSWORD: 'pg-secret-x', S3_ACCESS_KEY_ID: 'GKaaaaaaaaaaaaaaaaaaaaaaaa', S3_SECRET_ACCESS_KEY: 'sk-secret-x', COMPOSE_PROFILES: 'local-s3' }
const hostIps = (svc: any) => (svc.ports ?? []).map((p: any) => p.host_ip)

describe('docker-compose.yml', () => {
  it('publishes Postgres and the S3 store (Garage) on loopback only by default', () => {
    const { json } = render(required)
    expect(hostIps(json.services.postgres)).toEqual(['127.0.0.1'])
    expect(hostIps(json.services.garage)).toEqual(['127.0.0.1'])
  })

  it('can be opened up explicitly, and the application ports follow their own switch', () => {
    const open = render({ ...required, WS_DATA_BIND_ADDRESS: '0.0.0.0' }).json
    expect(hostIps(open.services.postgres)).toEqual(['0.0.0.0'])
    const locked = render({ ...required, WS_APP_BIND_ADDRESS: '127.0.0.1' }).json
    for (const s of ['core-api', 'asset-processor', 'gateway', 'admin-dashboard', 'whoobe-one-spike']) expect(hostIps(locked.services[s]), s).toEqual(['127.0.0.1'])
    // default keeps LAN development working
    const dflt = render(required).json
    for (const s of ['core-api', 'gateway']) expect(hostIps(dflt.services[s]), s).toEqual(['0.0.0.0'])
  })

  it('refuses to render without database or object-store credentials (no well-known defaults)', () => {
    for (const missing of Object.keys(required).filter((k) => k !== 'COMPOSE_PROFILES')) {
      const env: Record<string, string> = { ...required }
      delete env[missing]
      const r = render(env)
      expect(r.status, missing).not.toBe(0)
      expect(r.stderr, missing).toContain(missing)
    }
  })

  it('never falls back to the old well-known values', () => {
    const text = readFileSync(join(ROOT_DIR, 'docker-compose.yml'), 'utf8')
    for (const known of ['postgrespassword', 'minioadminpassword', ':-minioadmin', 'admin123']) expect(text, known).not.toContain(known)
    const ex = readFileSync(join(ROOT_DIR, '.env.example'), 'utf8')
    for (const known of ['postgrespassword', 'minioadmin', 'admin123']) expect(ex, known).not.toContain(known)
  })

  it('docker-compose.data.yml (the development infrastructure) follows the same rules', () => {
    const ok = render(required, 'docker-compose.data.yml')
    expect(ok.status, ok.stderr).toBe(0)
    expect(hostIps(ok.json.services.postgres)).toEqual(['127.0.0.1'])
    expect(hostIps(ok.json.services.garage)).toEqual(['127.0.0.1'])
    for (const missing of Object.keys(required).filter((k) => k !== 'COMPOSE_PROFILES')) {
      const env: Record<string, string> = { ...required }
      delete env[missing]
      expect(render(env, 'docker-compose.data.yml').status, missing).not.toBe(0)
    }
    const text = readFileSync(join(ROOT_DIR, 'docker-compose.data.yml'), 'utf8')
    for (const known of ['postgrespassword', 'minioadminpassword', 'MINIO_ROOT_USER: minioadmin']) expect(text, known).not.toContain(known)
  })

  it('docker-compose.apps.yml binds the application ports through the same switch', () => {
    const r = render({ ...required, WS_APP_BIND_ADDRESS: '127.0.0.1' }, 'docker-compose.apps.yml')
    expect(r.status, r.stderr).toBe(0)
    for (const [name, svc] of Object.entries<any>(r.json.services).filter(([, s]: any) => s.ports?.length)) expect(hostIps(svc), name).toEqual(['127.0.0.1'])
  })

  it('provisioned workspaces are pinned to loopback', () => {
    const src = readFileSync(join(ROOT_DIR, 'scripts/provision-workspace.sh'), 'utf8')
    expect(src).toMatch(/set_env "WS_APP_BIND_ADDRESS" "127\.0\.0\.1"/)
    expect(src).toMatch(/set_env "WS_DATA_BIND_ADDRESS" "127\.0\.0\.1"/)
  })
})

describe('object storage selection (docs/release/operations/storage-backends.md)', () => {
  it('runs Garage by default and wires the apps to it', () => {
    const { json } = render(required)
    expect(Object.keys(json.services)).toContain('garage')
    expect(json.services['asset-processor'].environment.S3_ENDPOINT).toBe('http://garage:3900')
    expect(json.services['core-api'].environment.S3_ENDPOINT).toBe('http://garage:3900')
  })

  it('starts no local store for an external S3 and takes its endpoint from the env file', () => {
    const { json, status, stderr } = render({ ...required, COMPOSE_PROFILES: '', S3_CONTAINER_ENDPOINT: 'https://s3.example.com' })
    expect(status, stderr).toBe(0)
    expect(Object.keys(json.services)).not.toContain('garage')
    expect(Object.keys(json.services)).not.toContain('minio')
    expect(json.services['asset-processor'].environment.S3_ENDPOINT).toBe('https://s3.example.com')
    expect(json.services['asset-processor'].depends_on?.garage?.required).toBe(false)
  })

  it('MinIO is opt-in through its own overlay and replaces Garage', () => {
    const envFile = join(dir, 'env-minio'); writeFileSync(envFile, Object.entries(required).map(([k, v]) => `${k}=${v}`).join('\n') + '\n')
    const r = spawnSync('docker', ['compose', '--env-file', envFile, '-f', join(ROOT_DIR, 'docker-compose.yml'), '-f', join(ROOT_DIR, 'docker-compose.minio.yml'), 'config', '--format', 'json'], { encoding: 'utf8', env: { ...process.env, ENV_FILE: envFile } })
    expect(r.status, r.stderr).toBe(0)
    const json = JSON.parse(r.stdout)
    expect(Object.keys(json.services)).toContain('minio')
    expect(Object.keys(json.services)).not.toContain('garage')
    expect(hostIps(json.services.minio)).toEqual(['127.0.0.1', '127.0.0.1'])
    expect(json.services['asset-processor'].environment.S3_ENDPOINT).toBe('http://minio:9000')
  })

  it('the data stack is only Postgres and Garage', () => {
    const { json } = render(required, 'docker-compose.data.yml')
    expect(Object.keys(json.services).sort()).toEqual(['garage', 'garage-perms', 'postgres'])
  })
})

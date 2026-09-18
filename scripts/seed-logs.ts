// Quick seed script: generates sample log files and uploads them to DAM.
// Run with: node --experimental-strip-types scripts/seed-logs.ts
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Minimal .env loader (reads repo-root .env, expands ${VAR})
function loadDotenv() {
  const envPath = resolve('./.env')
  try {
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      val = val.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? val)
      if (!process.env[key]) process.env[key] = val
    }
  } catch {}
}
loadDotenv()

const LOG_DIR = resolve('./logs')
const APPS = ['core-api', 'asset-processor', 'gateway', 'admin-dashboard', 'whoobe-editor']
const ASSET_PROCESSOR_URL = process.env.ASSET_PROCESSOR_URL ?? 'http://localhost:3002'
const DAM_SERVICE_TOKEN = process.env.DAM_SERVICE_TOKEN ?? ''

function pinoLine(overrides: Record<string, any>): string {
  return JSON.stringify({
    level: 'info',
    time: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    pid: 1234,
    hostname: 'whoobe-dev',
    name: 'core-api',
    msg: 'operation completed',
    ...overrides,
  })
}

const SAMPLE_ERRORS = [
  { level: 'error', name: 'core-api', module: 'auth', msg: 'Login failed: user not found', err: { type: 'AuthError', message: 'User not found for email unknown@test.com', stack: 'AuthError: User not found\n    at findUserByEmail (/app/packages/core/src/auth/user.ts:42)' } },
  { level: 'error', name: 'core-api', module: 'ai', msg: 'AI generation request failed', err: { type: 'AiGenerationError', message: 'Provider rate limit exceeded', stack: 'AiGenerationError: Provider rate limit exceeded\n    at generate (/app/packages/core/src/ai/providers.ts:156)' } },
  { level: 'warn', name: 'core-api', module: 'dam', msg: 'Metadata extraction incomplete', err: { type: 'ExtractionError', message: 'Unsupported file format: .heic' } },
  { level: 'error', name: 'asset-processor', module: 'dam', msg: 'DAM upload error', err: { type: 'UploadError', message: 'S3 putObject failed: Connection refused', stack: 'UploadError: S3 putObject failed\n    at S3AssetStorageProvider.uploadAsset (/app/packages/core/src/dam/storage.ts:88)' } },
  { level: 'warn', name: 'asset-processor', msg: 'Thumbnail generation skipped for large file', module: 'dam' },
  { level: 'error', name: 'gateway', module: 'gateway', msg: 'Upstream request failed', err: { type: 'FetchError', message: 'connect ECONNREFUSED 10.0.0.1:443', stack: 'FetchError: connect ECONNREFUSED\n    at ProxyEngine.fetch (/app/apps/gateway/src/proxy-engine.ts:67)' } },
  { level: 'warn', name: 'gateway', module: 'gateway', msg: 'Rate limit reached for endpoint /api/external', requestId: 'req_abc123' },
  { level: 'error', name: 'admin-dashboard', module: 'dam', msg: 'Failed to fetch asset list', err: { type: 'NetworkError', message: 'Failed to fetch' } },
  { level: 'warn', name: 'whoobe-editor', module: 'editor', msg: 'Block render error for element video', err: { type: 'RenderError', message: 'Missing src attribute' } },
  { level: 'info', name: 'core-api', module: 'auth', msg: 'User session created', userId: 'u_42', requestId: 'req_456' },
  { level: 'info', name: 'core-api', module: 'db', msg: 'Query completed in 23ms', latency: 23 },
  { level: 'info', name: 'asset-processor', module: 'dam', msg: 'Asset uploaded successfully', s3Key: 'dam-assets/img_001.webp' },
  { level: 'info', name: 'gateway', module: 'gateway', msg: 'Route /api/users resolved in 145ms', latency: 145 },
  { level: 'info', name: 'admin-dashboard', module: 'ui', msg: 'Settings page loaded' },
  { level: 'debug', name: 'core-api', module: 'mail', msg: 'Sending password reset email to user@example.com' },
  { level: 'error', name: 'core-api', module: 'search', msg: 'Search index rebuild failed', err: { type: 'IndexError', message: 'Elasticsearch connection timeout' } },
]

async function uploadToDam(filename: string, buffer: Buffer, folder: string) {
  const formData = new FormData()
  const blob = new Blob([buffer], { type: 'text/plain' })
  formData.append('file', blob, filename)
  formData.append('pimcorePath', `${folder}${filename}`)
  formData.append('isPublic', 'false')

  const headers: Record<string, string> = {}
  if (DAM_SERVICE_TOKEN) {
    headers['Authorization'] = `Bearer ${DAM_SERVICE_TOKEN}`
  }

  const res = await fetch(`${ASSET_PROCESSOR_URL}/api/v1/dam/upload`, {
    method: 'POST',
    body: formData,
    headers,
  })
  if (res.ok) {
    console.log(`  ✓ Uploaded ${filename}`)
  } else {
    console.log(`  ✗ Upload failed ${filename}: ${res.status} ${await res.text()}`)
  }
}

async function main() {
  console.log('Seeding sample logs...\n')

  for (const app of APPS) {
    const appDir = join(LOG_DIR, app)
    mkdirSync(appDir, { recursive: true })
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const dateStr = today

    const filename = `${app}-${dateStr}.log`
    const appSamples = SAMPLE_ERRORS.filter((e) => e.name === app)

    const lines: string[] = []
    // Add some generic info lines
    for (let i = 0; i < 10; i++) {
      lines.push(pinoLine({ name: app, msg: `Heartbeat check #${i + 1}`, level: 'info' }))
    }
    // Add the sample errors/warnings
    for (const s of appSamples) {
      lines.push(pinoLine(s))
    }
    // Add a few more random entries
    lines.push(pinoLine({ name: app, level: 'error', module: 'db', msg: 'Database connection pool exhausted', err: { type: 'PoolError', message: 'No available connections' } }))
    lines.push(pinoLine({ name: app, level: 'info', module: 'startup', msg: `${app} started successfully`, port: app === 'core-api' ? 3003 : app === 'asset-processor' ? 3002 : 3001 }))

    const content = lines.join('\n') + '\n'
    writeFileSync(join(appDir, filename), content)

    const folder = `private/logs/${app}/${dateStr.slice(0, 7)}/`
    await uploadToDam(filename, Buffer.from(content), folder)
  }

  console.log('\nDone. Open the admin dashboard → System Logs to view.')
}

main().catch(console.error)
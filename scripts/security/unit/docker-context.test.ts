// What must never enter a Docker build context (every image layer would carry it, and an unreadable directory stops
// the build): secrets, logs, and the Let's Encrypt state that `enable-tls.sh` writes into the repository as root.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'

const lines = readFileSync(join(ROOT_DIR, '.dockerignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))

describe('.dockerignore', () => {
  it.each([
    ['deploy/certbot', 'certificate and account private keys, root-owned (a rebuild of a workspace with HTTPS failed on it)'],
    ['.env.*', 'workspace secrets'],
    ['**/.env', 'nested env files'],
    ['logs', 'host logs'],
  ])('excludes %s (%s)', (entry) => {
    expect(lines).toContain(entry)
  })
})

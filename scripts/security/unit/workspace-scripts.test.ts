// Plan 3.11 (operator scripts, threat model: operators only - see plan section 10): inputs are validated before
// anything touches docker, nginx or the env file; secrets files are private; no service can spawn these scripts.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'

const run = (script: string, args: string[], input = '') =>
  spawnSync('bash', [join(ROOT_DIR, 'scripts', script), ...args], { cwd: ROOT_DIR, input, encoding: 'utf8', timeout: 20_000 })

describe('provision-workspace.sh refuses hostile arguments before doing anything', () => {
  const slug = 'sectest-never'
  const cases: [string, string[]][] = [
    ['hostname with a nginx directive', [slug, 'a.com; return 301 http://evil;', '1']],
    ['hostname with a newline', [slug, 'a.com\nserver_name evil', '1']],
    ['hostname with sed delimiter', [slug, 'a|b.com', '1']],
    ['hostname with a command substitution', [slug, '$(id).com', '1']],
    ['slug with a path', ['../../tmp/x', 'a.com', '1']],
    ['slug with uppercase/space', ['Bad Slug', 'a.com', '1']],
    ['index that is not a number', [slug, 'a.com', '1; id']],
    ['seed e-mail with a pipe', [slug, 'a.com', '1', '--seed-email', 'a|b@x.com']],
    ['seed password with sed/env metacharacters', [slug, 'a.com', '1', '--seed-password', 'abc|def&ghi$jkl']],
    ['seed password that is too short', [slug, 'a.com', '1', '--seed-password', 'short']],
    ['a profile that does not exist', [slug, 'a.com', '1', '--profile', 'nope']],
    ['a profile name that is a path', [slug, 'a.com', '1', '--profile', '../../etc/passwd']],
    ['--set with a lower-case key', [slug, 'a.com', '1', '--set', 'compose_file=x']],
    ['--set with a sed delimiter', [slug, 'a.com', '1', '--set', 'KEY=a|b']],
    ['--set with the sed match character', [slug, 'a.com', '1', '--set', 'KEY=a&b']],
    ['--set with a command substitution', [slug, 'a.com', '1', '--set', 'KEY=$(id)']],
    ['--set with a newline', [slug, 'a.com', '1', '--set', 'KEY=a\nB=c']],
  ]
  it.each(cases)('%s', (_name, args) => {
    const r = run('provision-workspace.sh', args)
    expect(r.status, r.stdout + r.stderr).toBe(1)
    expect(r.stderr).toMatch(/Error|Errore/)
    expect(existsSync(join(ROOT_DIR, `.env.${slug}`))).toBe(false)
    expect(existsSync(join(ROOT_DIR, 'deploy/nginx', `${slug}.conf`))).toBe(false)
  })
})

describe('other workspace scripts validate the slug / e-mail first', () => {
  it('remove-workspace.sh will not take a path as a slug', () => {
    for (const bad of ['../../etc/x', 'a/b', '.env.x', 'A', 'a b']) {
      const r = run('remove-workspace.sh', [bad, '--yes'])
      expect(r.status, bad).toBe(1)
      expect(r.stderr, bad).toMatch(/slug/)
    }
  })

  it('enable-tls.sh refuses a bad slug or e-mail', () => {
    expect(run('enable-tls.sh', ['../x', '--email', 'a@b.com']).status).toBe(1)
    const r = run('enable-tls.sh', ['valid-slug', '--email', 'a b@c.com;id'])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/e-mail/)
  })
})

describe('workspace provisioning keeps secrets private and never ships placeholders', () => {
  const src = readFileSync(join(ROOT_DIR, 'scripts/provision-workspace.sh'), 'utf8')
  it('creates the env file with a 0600 umask and chmods it', () => {
    expect(src).toMatch(/\(\s*umask 077;\s*cp \.env\.example "\$ENV_FILE"\s*\)/)
    expect(src).toMatch(/chmod 600 "\$ENV_FILE"/)
  })
  it('generates every secret that .env.example only has a placeholder for', () => {
    for (const k of ['MIGRATION_SOURCE_ENCRYPTION_KEY', 'GATEWAY_AUTH_ENCRYPTION_KEY', 'DAM_SERVICE_TOKEN', 'SITE_API_KEY_PEPPER', 'TOTP_ENCRYPTION_KEY', 'POSTGRES_PASSWORD', 'S3_SECRET_ACCESS_KEY']) {
      expect(src, k).toMatch(new RegExp(`set_env "${k}" "`))
    }
  })
  it('the example file does not contain a usable pepper or key (only change_me placeholders)', () => {
    const ex = readFileSync(join(ROOT_DIR, '.env.example'), 'utf8')
    for (const m of ex.matchAll(/^(SITE_API_KEY_PEPPER|GATEWAY_AUTH_ENCRYPTION_KEY|MIGRATION_SOURCE_ENCRYPTION_KEY)=(.*)$/gm)) expect(m[2], m[1]).toMatch(/change_me/)
  })
})

describe('services never run external programs', () => {
  function sources(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === 'dist') continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) sources(p, acc)
      else if (/\.(ts|js|mjs)$/.test(e) && !/\.test\./.test(e)) acc.push(p)
    }
    return acc
  }

  it('core-api, gateway, asset-processor, core and logger do not import child_process', () => {
    const offenders = ['apps/core-api/src', 'apps/gateway/src', 'apps/asset-processor/src', 'packages/core/src', 'packages/logger/src']
      .flatMap((d) => sources(join(ROOT_DIR, d)))
      .filter((f) => /child_process/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('the publisher runs a program in one place only, with an argument array and no shell', () => {
    const files = sources(join(ROOT_DIR, 'packages/publish/src')).concat(sources(join(ROOT_DIR, 'packages/mobile-app/src')))
    const text = files.map((f) => readFileSync(f, 'utf8')).join('\n')
    const calls = [...text.matchAll(/\b(execFileSync|execSync|exec|spawnSync|spawn|execFile)\s*\(/g)].map((m) => m[1])
    expect(calls.filter((c) => c !== 'execFileSync')).toEqual([])
    expect(calls.length).toBe(1)
    expect(text).not.toMatch(/shell\s*:\s*true/)
    expect(text).toMatch(/execFileSync\('pnpm', \['pack'/)
  })
})

// F-063: the publisher image packs the SDK when it is built (no pnpm at run time); the generator finds each tarball by the name `pnpm pack` gives it.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tarballName } from '../../../packages/publish/src/cli'

const ROOT = join(__dirname, '..', '..', '..')

describe('tarballName', () => {
  it('drops the @ of the scope and joins scope and name with a dash', () => {
    expect(tarballName('@whoobe-cms/schema', '0.3.1')).toBe('whoobe-cms-schema-0.3.1.tgz')
    expect(tarballName('plain', '1.0.0')).toBe('plain-1.0.0.tgz')
  })

  it('is the name pnpm pack gives a real SDK package', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdk-pack-'))
    try {
      const pkgDir = join(ROOT, 'packages', 'sdk', 'schema')
      const out = execFileSync('pnpm', ['pack', '--pack-destination', dir], { cwd: pkgDir, encoding: 'utf-8' })
      const { name, version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8')) as { name: string; version: string }
      expect(out.trim().split('\n').pop()!.trim().split('/').pop()).toBe(tarballName(name, version))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})

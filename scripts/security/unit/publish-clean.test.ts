// whoobe-publish --clean empties a previous output folder, but only one that looks like a generated site.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error built output of the publish package, no types needed here
import { cleanOutDir } from '../../../packages/publish/dist/cli.js'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'whoobe-clean-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function site(): void {
  mkdirSync(join(dir, 'vendor'), { recursive: true })
  writeFileSync(join(dir, 'vendor', 'whoobe-cms-renderer-0.1.0.tgz'), 'x')
  writeFileSync(join(dir, 'package.json'), '{}')
  writeFileSync(join(dir, 'old-page.vue'), 'x')
  mkdirSync(join(dir, '.nuxt')); mkdirSync(join(dir, 'node_modules')); writeFileSync(join(dir, 'pnpm-lock.yaml'), 'x')
}

describe('cleanOutDir', () => {
  it('removes generated files and caches, keeps node_modules, .git and the lockfile', async () => {
    site(); mkdirSync(join(dir, '.git'))
    const removed = await cleanOutDir(dir)
    expect(removed.sort()).toEqual(['.nuxt', 'old-page.vue', 'package.json', 'vendor'])
    expect(existsSync(join(dir, 'node_modules'))).toBe(true)
    expect(existsSync(join(dir, '.git'))).toBe(true)
    expect(existsSync(join(dir, 'pnpm-lock.yaml'))).toBe(true)
  })
  it('a missing or empty folder is fine', async () => {
    expect(await cleanOutDir(join(dir, 'nope'))).toEqual([])
    expect(await cleanOutDir(dir)).toEqual([])
  })
  it('refuses a folder that is not a generated site and deletes nothing', async () => {
    writeFileSync(join(dir, 'notes.txt'), 'mine')
    await expect(cleanOutDir(dir)).rejects.toThrow(/does not look like a site/)
    expect(existsSync(join(dir, 'notes.txt'))).toBe(true)
  })
})

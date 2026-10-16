// Gateway vendor presets (apps/gateway/presets, GATEWAY_PRESETS_PATH): data files that must show up in the
// "Add Endpoint" picker without restarting the gateway, and a bad file must not take the others down.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, unlinkSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPresetSource, loadPresets } from '../../../apps/gateway/src/preset-loader'

let dir = ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'presets-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const preset = (id: string, label = id) => JSON.stringify({ id, label, description: '', baseUrl: 'https://x', authType: 'none', authConfigFields: [], starterRoutes: [] })
const ids = (list: { id: string }[]) => list.map((p) => p.id)
const later = (file: string, seconds: number) => { const t = new Date(Date.now() + seconds * 1000); utimesSync(file, t, t) }

describe('presets', () => {
  it('the built-in presets load, and a second directory adds to them', () => {
    writeFileSync(join(dir, 'acme.json'), preset('acme'))
    const all = ids(loadPresets(dir))
    expect(all).toContain('brevo')
    expect(all).toContain('mailchimp')
    expect(all).toContain('node-red')
    expect(all).toContain('acme')
  })

  it('a preset of the second directory replaces a built-in one with the same id (no duplicate in the picker)', () => {
    writeFileSync(join(dir, 'brevo.json'), preset('brevo', 'Brevo (custom)'))
    const brevo = loadPresets(dir).filter((p) => p.id === 'brevo')
    expect(brevo).toHaveLength(1)
    expect(brevo[0].label).toBe('Brevo (custom)')
  })

  it('a malformed or incomplete file is skipped, the others stay', () => {
    writeFileSync(join(dir, 'broken.json'), '{ not json')
    writeFileSync(join(dir, 'noid.json'), JSON.stringify({ label: 'no id' }))
    writeFileSync(join(dir, 'ok.json'), preset('ok'))
    const all = ids(loadPresets(dir))
    expect(all).toContain('ok')
    expect(all).toContain('brevo')
    expect(all).not.toContain('broken')
  })

  it('a missing second directory is not an error', () => {
    expect(ids(loadPresets(join(dir, 'nope')))).toContain('brevo')
  })
})

describe('presets read per request (no restart)', () => {
  it('shows a preset added, changed and removed after the source was created', () => {
    const get = createPresetSource(dir)
    expect(ids(get())).not.toContain('late')

    const file = join(dir, 'late.json')
    writeFileSync(file, preset('late', 'Late'))
    expect(get().find((p) => p.id === 'late')?.label).toBe('Late')

    writeFileSync(file, preset('late', 'Late v2'))
    later(file, 5)
    expect(get().find((p) => p.id === 'late')?.label).toBe('Late v2')

    unlinkSync(file)
    expect(ids(get())).not.toContain('late')
  })

  it('does not read the files again while nothing changed', () => {
    const get = createPresetSource(dir)
    writeFileSync(join(dir, 'a.json'), preset('a'))
    expect(get()).toBe(get())   // same array: served from the cache
  })

  it('a file that becomes malformed drops out instead of breaking the list', () => {
    const file = join(dir, 'x.json')
    writeFileSync(file, preset('x'))
    const get = createPresetSource(dir)
    expect(ids(get())).toContain('x')
    writeFileSync(file, '{ oops')
    later(file, 5)
    const after = ids(get())
    expect(after).not.toContain('x')
    expect(after).toContain('brevo')
  })
})

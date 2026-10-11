// A form tells the page how a submission ended through the `whoobe-form-result` DOM event; for a Gateway form the service can
// answer an outcome key ({ "outcome": "qualified" }). Only that key is acted on, and it must be a plain key
// (docs/plans/automations/form-result-event.md).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'
import { extractOutcome } from '../../../apps/gateway/src/submit-outcome'
import { formConfigSchema } from '../../../packages/sdk/schema/src/validators'

const read = (p: string) => readFileSync(join(ROOT_DIR, p), 'utf8')

describe('gateway: extractOutcome', () => {
  it('returns a plain key from the service reply', () => {
    expect(extractOutcome({ outcome: 'qualified', other: 1 })).toBe('qualified')
    expect(extractOutcome({ outcome: 'needs_verification' })).toBe('needs_verification')
  })
  it('returns null for anything else', () => {
    for (const body of [null, undefined, 'qualified', 7, [], [{ outcome: 'x' }], {}, { outcome: '' }, { outcome: 'a b' }, { outcome: '<img src=x onerror=1>' },
      { outcome: 'x'.repeat(33) }, { outcome: 5 }, { outcome: { a: 1 } }, { message: 'qualified' }]) {
      expect(extractOutcome(body), JSON.stringify(body)).toBeNull()
    }
  })
  it('the submit route passes the outcome on (and the reply keeps its shape without one)', () => {
    const src = read('apps/gateway/src/submit-handler.ts')
    expect(src).toMatch(/extractOutcome\(result\.body\)/)
    expect(src).toMatch(/success: true, outcome/)
  })
})

describe('the same rule in the editor and in the renderer', () => {
  const editor = read('apps/whoobe-one-spike/src/scripts/form-result.ts')
  const renderer = read('packages/sdk/renderer/src/form-result.ts')
  const gateway = read('apps/gateway/src/submit-outcome.ts')
  it('three copies of the key pattern are identical', () => {
    const pattern = (s: string) => /OUTCOME_KEY = (\/.*\/)/.exec(s)?.[1]
    expect(pattern(renderer)).toBeTruthy()
    expect(pattern(editor)).toBe(pattern(renderer))
    expect(pattern(gateway)).toBe(pattern(renderer))
  })
  it('the event name is the same', () => {
    const name = (s: string) => /FORM_RESULT_EVENT = '([^']+)'/.exec(s)?.[1]
    expect(name(renderer)).toBe('whoobe-form-result')
    expect(name(editor)).toBe('whoobe-form-result')
  })
})

describe('every form runtime reports the result', () => {
  const runtimes: Record<string, string> = {
    'editor / preview': 'apps/whoobe-one-spike/src/scripts/form-actions.ts',
    'Vue': 'packages/sdk/vue/src/defaults.ts',
    'Vue useForm': 'packages/sdk/vue/src/composables.ts',
    'React': 'packages/sdk/react/src/defaults.tsx',
    'React useForm': 'packages/sdk/react/src/hooks.ts',
    'Svelte': 'packages/sdk/svelte/src/lib/WhoobeForm.svelte',
  }
  for (const [name, path] of Object.entries(runtimes)) {
    it(`${name}: dispatches on success and on failure and honours showResultMessage`, () => {
      const src = read(path)
      expect((src.match(/dispatchFormResult\(/g) ?? []).length, 'success and failure').toBeGreaterThanOrEqual(2)
      expect(src).toMatch(/sanitizeOutcome\(/)
      expect(src).toMatch(/showsResultMessage\(/)
    })
  }
  it('a submit failure reports no outcome', () => {
    for (const path of Object.values(runtimes)) expect(read(path), path).toMatch(/\{ ok: false, outcome: null \}/)
  })
})

describe('showResultMessage', () => {
  const base = { enabled: true, targetClassId: '', successMessage: '', errorMessage: '', successRedirectUrl: '', errorRedirectUrl: '',
    notify: { enabled: false, mailTemplateId: '', templatePageId: '', recipientEmail: '', subject: '' } }
  it('is optional in the schema and must be a boolean', () => {
    expect(formConfigSchema.safeParse(base).success).toBe(true)
    expect(formConfigSchema.safeParse({ ...base, showResultMessage: false }).success).toBe(true)
    expect(formConfigSchema.safeParse({ ...base, showResultMessage: 'no' }).success).toBe(false)
  })
  it('can be changed in the form settings', () => {
    expect(read('apps/whoobe-one-spike/src/components/advanced/FormConfigControl.vue')).toMatch(/showResultMessage/)
  })
})

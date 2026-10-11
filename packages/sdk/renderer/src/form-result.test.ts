import { describe, it, expect } from 'vitest'
import { FORM_RESULT_EVENT, dispatchFormResult, sanitizeOutcome, showsResultMessage } from './form-result.js'

describe('form result', () => {
  it('accepts a plain key as outcome and nothing else', () => {
    expect(sanitizeOutcome('qualified')).toBe('qualified')
    expect(sanitizeOutcome('not_qualified-2')).toBe('not_qualified-2')
    expect(sanitizeOutcome('x'.repeat(32))).toBe('x'.repeat(32))
    for (const bad of ['', 'x'.repeat(33), 'a b', 'a.b', '<b>', "a'b", 'a"b', 'a\nb', 7, null, undefined, {}, []]) expect(sanitizeOutcome(bad), String(bad)).toBeNull()
  })

  it('shows the message popup unless the form turns it off', () => {
    expect(showsResultMessage(undefined)).toBe(true)
    expect(showsResultMessage({})).toBe(true)
    expect(showsResultMessage({ showResultMessage: true })).toBe(true)
    expect(showsResultMessage({ showResultMessage: false })).toBe(false)
  })

  it('dispatches a bubbling event with ok and outcome', () => {
    const seen: any[] = []
    dispatchFormResult({ dispatchEvent: (e: any) => seen.push(e) }, { ok: true, outcome: 'qualified' })
    expect(seen).toHaveLength(1)
    expect(seen[0].type).toBe(FORM_RESULT_EVENT)
    expect(seen[0].type).toBe('whoobe-form-result')
    expect(seen[0].bubbles).toBe(true)
    expect(seen[0].detail).toEqual({ ok: true, outcome: 'qualified' })
  })

  it('does nothing without a target', () => {
    expect(() => dispatchFormResult(undefined, { ok: false, outcome: null })).not.toThrow()
  })
})

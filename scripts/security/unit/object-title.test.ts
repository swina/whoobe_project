// Which text names an object's tab (apps/admin-dashboard/src/utils/object-title.ts).
import { describe, it, expect } from 'vitest'
import { objectTitle } from '../../../apps/admin-dashboard/src/utils/object-title'

const f = (name: string, fieldType = 'input', tabTitle?: boolean) => ({ name, fieldType, tabTitle })

describe('objectTitle', () => {
  it('uses the field marked as tab title first', () => {
    expect(objectTitle([f('first'), f('company', 'input', true)], { first: 'Anna', company: 'ACME', title: 'T' })).toBe('ACME')
  })
  it('skips a marked field that is empty and falls on the conventions', () => {
    expect(objectTitle([f('company', 'input', true)], { company: '  ', name: 'Rossi' })).toBe('Rossi')
  })
  it('title, then name, then label', () => {
    expect(objectTitle([], { label: 'L', name: 'N' })).toBe('N')
    expect(objectTitle([], { label: 'L', name: 'N', title: 'T' })).toBe('T')
  })
  it('without a convention takes the first text field that has a value', () => {
    expect(objectTitle([f('age', 'numeric'), f('surname'), f('email', 'email')], { age: 40, surname: '', email: 'a@b.it' })).toBe('a@b.it')
  })
  it('accepts a number in the marked field, ignores objects and non-text types', () => {
    expect(objectTitle([f('code', 'numeric', true)], { code: 42 })).toBe('42')
    expect(objectTitle([f('data', 'json'), f('flag', 'checkbox')], { data: { a: 1 }, flag: true })).toBeNull()
  })
  it('null when nothing qualifies (the caller shows the key)', () => {
    expect(objectTitle(undefined, undefined)).toBeNull()
    expect(objectTitle([f('a')], {})).toBeNull()
  })
})

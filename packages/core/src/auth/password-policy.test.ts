import { describe, expect, it } from 'vitest';
import { checkPasswordPolicy, DEFAULT_PASSWORD_POLICY, userMustUseMfa } from './password-policy.js';

describe('checkPasswordPolicy', () => {
  it('keeps today\'s rule by default: 8 characters, nothing else', () => {
    expect(checkPasswordPolicy('abcdefgh', DEFAULT_PASSWORD_POLICY)).toBeNull();
    expect(checkPasswordPolicy('abcdefg', DEFAULT_PASSWORD_POLICY)).toMatch(/at least 8/);
  });
  it('applies the configured minimum length', () => {
    expect(checkPasswordPolicy('abcdefghijk', { minLength: 12, requireClasses: false })).toMatch(/at least 12/);
    expect(checkPasswordPolicy('abcdefghijkl', { minLength: 12, requireClasses: false })).toBeNull();
  });
  it('requires three character classes when asked', () => {
    const policy = { minLength: 8, requireClasses: true };
    expect(checkPasswordPolicy('alllowercase', policy)).toMatch(/three of/);
    expect(checkPasswordPolicy('lower&UPPER', policy)).toBeNull();
    expect(checkPasswordPolicy('lower1234', policy)).toMatch(/three of/);
    expect(checkPasswordPolicy('Lower1234', policy)).toBeNull();
  });
  it('refuses the e-mail address or its local part, whatever the case', () => {
    expect(checkPasswordPolicy('Marta.Rossi@Example.com', DEFAULT_PASSWORD_POLICY, { email: 'marta.rossi@example.com' })).toMatch(/e-mail/);
    expect(checkPasswordPolicy('marta.rossi', DEFAULT_PASSWORD_POLICY, { email: 'marta.rossi@example.com' })).toMatch(/e-mail/);
    expect(checkPasswordPolicy('marta.rossi!', DEFAULT_PASSWORD_POLICY, { email: 'marta.rossi@example.com' })).toBeNull();
  });
  it('refuses a password longer than 128 characters', () => {
    expect(checkPasswordPolicy('a'.repeat(129), DEFAULT_PASSWORD_POLICY)).toMatch(/at most 128/);
  });
});

describe('userMustUseMfa', () => {
  it('is false when no role is required, true when one of the user\'s roles is', () => {
    expect(userMustUseMfa(['a', 'b'], [])).toBe(false);
    expect(userMustUseMfa(['a', 'b'], ['c'])).toBe(false);
    expect(userMustUseMfa(['a', 'b'], ['b', 'c'])).toBe(true);
    expect(userMustUseMfa([], ['b'])).toBe(false);
  });
});

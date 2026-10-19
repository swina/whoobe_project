import { describe, expect, it } from 'vitest';
import { identifierFingerprint, identifierRegex, normalizeIdentifier } from './data-subject.js';

describe('normalizeIdentifier', () => {
  it('trims and lower-cases, and gives a fingerprint that does not contain the value', () => {
    const r = normalizeIdentifier('  Ann@X.Org ');
    expect(r).toMatchObject({ ok: true, value: 'ann@x.org' });
    if (r.ok) {
      expect(r.fingerprint).toMatch(/^[0-9a-f]{12}$/);
      expect(r.fingerprint).toBe(identifierFingerprint('ann@x.org'));
      expect(r.fingerprint).not.toContain('ann');
    }
  });
  it('refuses what is not text, too short, too long or has control characters', () => {
    for (const v of [undefined, null, 5, '', '  ', 'ab', 'a'.repeat(321), 'ann\n@x.org']) expect(normalizeIdentifier(v).ok, String(v)).toBe(false);
  });
});

describe('identifierRegex', () => {
  const re = (id: string) => new RegExp(identifierRegex(id).replace(/\(\^\|/, '(^|'));   // the pattern is valid ECMAScript too
  const hit = (id: string, text: string) => re(id).test(text.toLowerCase());
  it('finds the address as a word of its own', () => {
    for (const t of ['ann@x.org', 'to: Ann <ann@x.org>', 'mailto:ann@x.org?subject=hi', 'write to ann@x.org.', 'a, ann@x.org; b', '<p>ann@x.org</p>', 'ann@x.org\nnext']) expect(hit('ann@x.org', t), t).toBe(true);
  });
  it('does not find it as the tail or head of a longer address', () => {
    for (const t of ['joann@x.org', 'ann@x.org.uk', 'ann@x.organisation', 'ann@x.org-old', 'x.ann@x.org', 'ann@x.orgs']) expect(hit('ann@x.org', t), t).toBe(false);
  });
  it('escapes what is special in a regular expression', () => {
    expect(hit('a.b+c@x.org', 'a.b+c@x.org')).toBe(true);
    expect(hit('a.b+c@x.org', 'aXb+c@x.org')).toBe(false);
    expect(hit('a.b+c@x.org', 'a.bbc@x.org')).toBe(false);
  });
});

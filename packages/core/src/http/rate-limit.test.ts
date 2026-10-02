import { describe, expect, it } from 'vitest';
import { createFixedWindowLimiter } from './rate-limit.js';

describe('createFixedWindowLimiter', () => {
  it('allows `max` hits per window, then limits, then resets', () => {
    const l = createFixedWindowLimiter({ max: 3, windowMs: 1000 });
    expect([1, 2, 3].map(() => l.hit('a', 0))).toEqual([false, false, false]);
    expect(l.hit('a', 10)).toBe(true);
    expect(l.hit('b', 10)).toBe(false);
    expect(l.hit('a', 1500)).toBe(false);
  });

  it('never holds more than maxKeys entries', () => {
    const l = createFixedWindowLimiter({ max: 1, windowMs: 60_000, maxKeys: 50 });
    for (let i = 0; i < 500; i++) l.hit(`k${i}`, i);
    expect(l.size()).toBeLessThanOrEqual(50);
  });
});

import { hashResetToken } from '../auth/reset-password.js';

describe('hashResetToken', () => {
  it('is a deterministic 64-hex digest that is not the token itself', () => {
    const t = 'a'.repeat(64);
    expect(hashResetToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashResetToken(t)).toBe(hashResetToken(t));
    expect(hashResetToken(t)).not.toBe(t);
    expect(hashResetToken(t)).not.toBe(hashResetToken('b'.repeat(64)));
  });
});

import { FORM_FIELDS_SENTINEL, collectFormFieldNames } from '../gateway/bind-page-content.js';

describe('collectFormFieldNames', () => {
  const input = (name: string, tag = 'input') => ({ id: name, tag, data: { attributes: { name } }, blocks: [] });
  it('collects the names of input-like descendants, at any depth, once', () => {
    const form = {
      tag: 'form', data: { attributes: { name: 'form' } },
      blocks: [
        { tag: 'flex', blocks: [input('email'), { tag: 'flex', blocks: [input('message', 'textarea'), input('email')] }] },
        input('plan', 'select'), input('terms', 'checkbox'), input('kind', 'radiogroup'),
        { tag: 'span', data: { attributes: { name: 'not-a-field' } }, blocks: [] },
        { tag: 'input', data: { attributes: {} }, blocks: [] },
      ],
    };
    expect(collectFormFieldNames(form).sort()).toEqual(['email', 'kind', 'message', 'plan', 'terms']);
  });
  it('is empty for a form without inputs or a malformed node, and the sentinel cannot collide with a field', () => {
    expect(collectFormFieldNames({ tag: 'form', blocks: [] })).toEqual([]);
    expect(collectFormFieldNames(null)).toEqual([]);
    expect(FORM_FIELDS_SENTINEL).toBe('__fields');
  });
});

import { describe, expect, it } from 'vitest';
import { createFailureLock, createFixedWindowLimiter } from './rate-limit.js';

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

describe('createFailureLock', () => {
  it('locks a key after `max` failures for `lockMs`, then releases it', () => {
    const l = createFailureLock({ max: 3, lockMs: 1000 });
    l.fail('u', 0); l.fail('u', 1);
    expect(l.isLocked('u', 2)).toBe(false);
    l.fail('u', 3);
    expect(l.isLocked('u', 4)).toBe(true);
    expect(l.isLocked('other', 4)).toBe(false);
    expect(l.isLocked('u', 1100)).toBe(false);
  });
  it('clear() resets the counter and the table stays bounded', () => {
    const l = createFailureLock({ max: 2, lockMs: 1000, maxKeys: 20 });
    l.fail('u', 0); l.clear('u'); l.fail('u', 1);
    expect(l.isLocked('u', 2)).toBe(false);
    for (let i = 0; i < 200; i++) l.fail(`k${i}`, i);
    expect(l.size()).toBeLessThanOrEqual(20);
  });
});

import { maxInputPixels } from '../dam/sharp-input.js';

describe('maxInputPixels', () => {
  it('defaults to 100 MP, honours ASSET_MAX_INPUT_PIXELS, 0 means the library default, junk falls back', () => {
    expect(maxInputPixels({} as any)).toBe(100_000_000);
    expect(maxInputPixels({ ASSET_MAX_INPUT_PIXELS: '25000000' } as any)).toBe(25_000_000);
    expect(maxInputPixels({ ASSET_MAX_INPUT_PIXELS: '0' } as any)).toBe(false);
    expect(maxInputPixels({ ASSET_MAX_INPUT_PIXELS: 'abc' } as any)).toBe(100_000_000);
    expect(maxInputPixels({ ASSET_MAX_INPUT_PIXELS: '-5' } as any)).toBe(100_000_000);
  });
});

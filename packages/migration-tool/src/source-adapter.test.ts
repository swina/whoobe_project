import { describe, it, expect } from 'vitest';
import { pimcoreClassIdOf } from './source-adapter.js';

describe('pimcoreClassIdOf', () => {
  it('keeps an old Pimcore numeric class id a number', () => {
    expect(pimcoreClassIdOf('12')).toBe(12);
  });

  it('keeps a Pimcore 10/11 text class id as text (it used to become NaN)', () => {
    expect(pimcoreClassIdOf('Car')).toBe('Car');
    expect(pimcoreClassIdOf('CU')).toBe('CU');
    expect(pimcoreClassIdOf('2fast')).toBe('2fast');
  });
});

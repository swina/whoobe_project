import { describe, it, expect } from 'vitest';
import { phpUnserialize } from './php-unserialize.js';

describe('phpUnserialize', () => {
  it('decodes null', () => {
    expect(phpUnserialize('N;')).toBeNull();
  });

  it('decodes booleans', () => {
    expect(phpUnserialize('b:1;')).toBe(true);
    expect(phpUnserialize('b:0;')).toBe(false);
  });

  it('decodes integers and floats', () => {
    expect(phpUnserialize('i:42;')).toBe(42);
    expect(phpUnserialize('i:-7;')).toBe(-7);
    expect(phpUnserialize('d:3.14;')).toBeCloseTo(3.14);
  });

  it('decodes strings, including embedded delimiters', () => {
    expect(phpUnserialize('s:5:"hello";')).toBe('hello');
    // Length-prefixed, so semicolons/colons/quotes inside the value don't
    // need escaping - this is a 10-byte string containing all three.
    expect(phpUnserialize('s:10:"a;b:c"d";e";')).toBe('a;b:c"d";e');
  });

  it('decodes a sequential array as a JS array', () => {
    const result = phpUnserialize('a:3:{i:0;s:1:"a";i:1;s:1:"b";i:2;s:1:"c";}');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('decodes an associative array as a JS object', () => {
    const result = phpUnserialize('a:2:{s:2:"id";i:5;s:3:"alt";s:8:"Hero Alt";}');
    expect(result).toEqual({ id: 5, alt: 'Hero Alt' });
  });

  it('decodes nested arrays', () => {
    const result = phpUnserialize(
      'a:1:{i:0;a:2:{s:4:"type";s:10:"herobanner";s:6:"hidden";b:0;}}'
    );
    expect(result).toEqual([{ type: 'herobanner', hidden: false }]);
  });

  it('decodes an object as a plain property map, discarding the class name', () => {
    const result = phpUnserialize('O:7:"MyClass":1:{s:2:"id";i:9;}');
    expect(result).toEqual({ id: 9 });
  });

  it('throws on malformed input rather than guessing', () => {
    expect(() => phpUnserialize('x:1;')).toThrow();
  });
});

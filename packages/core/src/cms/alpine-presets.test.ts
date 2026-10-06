import { describe, it, expect } from 'vitest';
import { normalizeAlpinePresets, readAlpinePresets, ALPINE_PRESET_LIMITS } from './alpine-presets.js';

const fade = {
  name: 'fade-scale',
  description: 'Fade and scale in and out',
  directives: {
    'x-transition:enter': 'transition ease-out duration-300',
    'x-transition:enter-start': 'opacity-0 scale-90',
    'x-transition:enter-end': 'opacity-100 scale-100',
    'x-transition:leave': 'transition ease-in duration-300',
    'x-transition:leave-start': 'opacity-100 scale-100',
    'x-transition:leave-end': 'opacity-0 scale-90',
  },
};

const fails = (input: unknown) => {
  const r = normalizeAlpinePresets(input);
  expect(r.ok).toBe(false);
  return (r as { error: string }).error;
};

describe('normalizeAlpinePresets', () => {
  it('accepts the six x-transition attributes of a fade-and-scale effect', () => {
    const r = normalizeAlpinePresets([fade]);
    expect(r).toEqual({ ok: true, presets: [fade] });
  });

  it('accepts the common Alpine forms: x-*, modifiers, @event and :attribute shorthands', () => {
    const r = normalizeAlpinePresets([{ name: 'menu', directives: { 'x-data': '{ open: false }', 'x-show': 'open', '@click.outside': 'open = false', ':class': "{ 'a': open }", 'x-on:keydown.escape.window': 'open = false', 'x-collapse.duration.500ms': '' } }]);
    expect(r.ok).toBe(true);
  });

  it('defaults a missing description to an empty string and trims the name', () => {
    const r = normalizeAlpinePresets([{ name: '  pop  ', directives: { 'x-show': 'open' } }]);
    expect(r).toEqual({ ok: true, presets: [{ name: 'pop', description: '', directives: { 'x-show': 'open' } }] });
  });

  it('accepts an empty catalog (clearing it)', () => {
    expect(normalizeAlpinePresets([])).toEqual({ ok: true, presets: [] });
  });

  it.each([
    ['not an array', { fade }],
    ['a preset that is not an object', ['fade']],
    ['a non-string name', [{ name: 5, directives: { 'x-show': 'a' } }]],
    ['an empty name', [{ name: '  ', directives: { 'x-show': 'a' } }]],
    ['a name with markup', [{ name: '<b>x</b>', directives: { 'x-show': 'a' } }]],
    ['a name that starts with a symbol', [{ name: '-x', directives: { 'x-show': 'a' } }]],
    ['a name that is too long', [{ name: 'a'.repeat(ALPINE_PRESET_LIMITS.nameLength + 1), directives: { 'x-show': 'a' } }]],
    ['a non-string description', [{ name: 'a', description: 3, directives: { 'x-show': 'a' } }]],
    ['directives that are not an object', [{ name: 'a', directives: ['x-show'] }]],
    ['a preset without directives', [{ name: 'a', directives: {} }]],
    ['a non-string directive value', [{ name: 'a', directives: { 'x-show': true } }]],
    ['a directive name that is not Alpine', [{ name: 'a', directives: { onclick: 'alert(1)' } }]],
    ['a style attribute', [{ name: 'a', directives: { style: 'color:red' } }]],
    ['__proto__ as a directive', [{ name: 'a', directives: JSON.parse('{"__proto__": "x"}') }]],
    ['a directive name with a space', [{ name: 'a', directives: { 'x-show onload': 'a' } }]],
    ['a value that is too long', [{ name: 'a', directives: { 'x-data': 'a'.repeat(ALPINE_PRESET_LIMITS.valueLength + 1) } }]],
  ])('refuses %s', (_label, input) => {
    fails(input);
  });

  it('refuses a duplicate name, ignoring case', () => {
    expect(fails([fade, { ...fade, name: 'FADE-SCALE' }])).toMatch(/duplicate/);
  });

  it('refuses too many presets and too many directives', () => {
    const many = Array.from({ length: ALPINE_PRESET_LIMITS.presets + 1 }, (_v, i) => ({ name: `p${i}`, directives: { 'x-show': 'a' } }));
    expect(fails(many)).toMatch(/at most/);
    const dirs = Object.fromEntries(Array.from({ length: ALPINE_PRESET_LIMITS.directivesPerPreset + 1 }, (_v, i) => [`x-bind:a${i}`, 'v']));
    expect(fails([{ name: 'a', directives: dirs }])).toMatch(/at most/);
  });

  it('names the preset and the directive in the error', () => {
    expect(fails([{ name: 'pop', directives: { onclick: 'x' } }])).toMatch(/preset "pop".*onclick/);
  });

  it('drops unknown properties of a preset', () => {
    const r = normalizeAlpinePresets([{ ...fade, evil: '<script>', __proto__: { x: 1 } }]);
    expect(r).toEqual({ ok: true, presets: [fade] });
  });
});

describe('readAlpinePresets', () => {
  it('returns the stored catalog when valid and an empty one otherwise', () => {
    expect(readAlpinePresets([fade])).toEqual([fade]);
    expect(readAlpinePresets(null)).toEqual([]);
    expect(readAlpinePresets('garbage')).toEqual([]);
    expect(readAlpinePresets([{ name: '', directives: {} }])).toEqual([]);
  });
});

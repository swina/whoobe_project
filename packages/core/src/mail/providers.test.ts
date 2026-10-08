import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMailProviderSource, loadMailProviders, validateProvider } from './providers.js';

let dir = '';
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'mail-providers-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const def = (over: Record<string, unknown> = {}) => ({ id: 'acme', label: 'Acme', configFields: [], request: { method: 'POST', url: 'https://api.acme.example/send' }, ...over });
const later = (file: string, s: number) => { const t = new Date(Date.now() + s * 1000); utimesSync(file, t, t); };

describe('validateProvider', () => {
  it('accepts a definition and the built-in OneSignal one', () => {
    expect(validateProvider(def())).toBeNull();
    expect(validateProvider(loadMailProviders().find((p) => p.id === 'onesignal'))).toBeNull();
  });
  it.each([
    [{ id: 'Bad Id' }, /id must be/],
    [{ id: 'smtp' }, /built in/],
    [{ label: '' }, /label/],
    [{ configFields: 'x' }, /configFields/],
    [{ configFields: [{ name: 'a b', label: 'A' }] }, /config field/],
    [{ request: { method: 'POST', url: 'http://api.acme.example/send' } }, /https/],
    [{ request: { method: 'POST', url: 'https://{{config.host}}/send' } }, /placeholder in its host/],
    [{ request: { method: 'POST', url: 'https://x.example@{{config.host}}/send' } }, /placeholder in its host/],
    [{ request: { method: 'POST' } }, /request\.method and request\.url/],
  ])('refuses %j', (over, why) => expect(validateProvider(def(over))).toMatch(why as RegExp));
  it('allows a placeholder in the path', () => {
    expect(validateProvider(def({ request: { method: 'POST', url: 'https://api.acme.example/v3/{{config.domain}}/messages' } }))).toBeNull();
  });
});

describe('loading', () => {
  it('has OneSignal built in; a folder adds providers and replaces a built-in one by id', () => {
    writeFileSync(join(dir, 'acme.json'), JSON.stringify(def()));
    writeFileSync(join(dir, 'onesignal.json'), JSON.stringify(def({ id: 'onesignal', label: 'OneSignal (ours)' })));
    const all = loadMailProviders(dir);
    expect(all.find((p) => p.id === 'acme')).toBeTruthy();
    expect(all.filter((p) => p.id === 'onesignal')).toHaveLength(1);
    expect(all.find((p) => p.id === 'onesignal')!.label).toBe('OneSignal (ours)');
  });
  it('skips what is malformed or refused, tells why, and keeps the rest', () => {
    writeFileSync(join(dir, 'broken.json'), '{ nope');
    writeFileSync(join(dir, 'http.json'), JSON.stringify(def({ id: 'plain', request: { method: 'POST', url: 'http://x.example/' } })));
    writeFileSync(join(dir, 'ok.json'), JSON.stringify(def({ id: 'ok' })));
    const skipped: string[] = [];
    const all = loadMailProviders(dir, (p, why) => skipped.push(`${p.split('/').pop()}: ${why}`));
    expect(all.map((p) => p.id)).toContain('ok');
    expect(all.map((p) => p.id)).not.toContain('plain');
    expect(skipped.some((s) => s.startsWith('http.json: request.url must be an https URL'))).toBe(true);
    expect(skipped.some((s) => s.startsWith('broken.json'))).toBe(true);
  });
  it('a missing folder is not an error', () => {
    expect(loadMailProviders(join(dir, 'nope')).map((p) => p.id)).toContain('onesignal');
  });
});

describe('createMailProviderSource (no restart)', () => {
  it('shows a provider added, changed and removed after the source was created', () => {
    const src = createMailProviderSource(dir);
    expect(src.get('late')).toBeUndefined();
    const file = join(dir, 'late.json');
    writeFileSync(file, JSON.stringify(def({ id: 'late', label: 'Late' })));
    expect(src.get('late')?.label).toBe('Late');
    writeFileSync(file, JSON.stringify(def({ id: 'late', label: 'Late v2' })));
    later(file, 5);
    expect(src.get('late')?.label).toBe('Late v2');
    rmSync(file);
    expect(src.get('late')).toBeUndefined();
    expect(src.get('onesignal')).toBeTruthy();
  });
  it('serves the same list while nothing changed', () => {
    const src = createMailProviderSource(dir);
    expect(src.all()).toBe(src.all());
  });
});

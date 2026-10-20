#!/usr/bin/env node
// Fills a fresh sandbox with a demo website, its pages and a few snippets (scripts/sandbox/demo/content.json, made by demo/generate.mjs).
// The two demo kits are not made here: they ship with the distribution (packages/core/seed-data/kits) and the core seeds them at start.
// Usage: seed-demo.mjs <core-api base url> <demo e-mail> <demo password>      e.g. seed-demo.mjs http://127.0.0.1:3023 demo@whoobe.example ...
// Idempotent: a website that already has the demo name is left alone. Exit 1 on failure; reset.sh reports it and goes on (an empty
// sandbox still works, it is only less welcoming).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [base, email, password] = process.argv.slice(2);
if (!base || !email || !password) {
  console.error('usage: seed-demo.mjs <core-api base url> <e-mail> <password>');
  process.exit(2);
}
const content = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo', 'content.json'), 'utf8'));
const url = (p) => `${base.replace(/\/+$/, '')}${p}`;

let cookie = '';
async function call(method, p, body) {
  const res = await fetch(url(p), {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${json.error ?? json.raw ?? ''}`);
  return { json, res };
}

const login = await call('POST', '/auth/login', { email, password });
if (login.json.mfaRequired || login.json.mfaEnrolmentRequired) throw new Error('the demo account asks for a second factor: not seeding');
cookie = (login.res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
if (!cookie) throw new Error('login gave no session cookie');

const sites = (await call('GET', '/whoobe-one/websites')).json.websites ?? [];
if (sites.some((w) => w.name === content.website.name)) {
  console.log(`demo website "${content.website.name}" already there: nothing to do`);
  process.exit(0);
}

const website = (await call('POST', '/whoobe-one/websites', content.website)).json.website;
for (const pg of content.pages) {
  await call('POST', '/whoobe-one/pages', { ...pg, websiteId: website.id });
}
for (const sn of content.snippets) {
  await call('POST', '/whoobe-one/snippets', sn);
}
console.log(`demo content: website "${website.name}", ${content.pages.length} pages, ${content.snippets.length} snippets`);

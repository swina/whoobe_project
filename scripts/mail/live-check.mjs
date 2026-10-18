#!/usr/bin/env node
// Sends ONE real e-mail through an HTTP mail provider (packages/core/mail-providers/*.json) with credentials read from
// a local file - for trying a provider against the real service before relying on it. Not part of any test run.
//
//   node scripts/mail/live-check.mjs --provider onesignal --to you@example.com [--env ~/.config/whoobe/onesignal.env] [--dry-run]
//
// The env file holds one line per config field of the provider, named PROVIDER_FIELD in upper case with underscores
// (OneSignal: ONESIGNAL_APP_ID, ONESIGNAL_API_KEY, optionally ONESIGNAL_SENDER_DOMAIN), plus the optional
// <PROVIDER>_FROM and <PROVIDER>_FROM_NAME. It must not be readable by others (chmod 600). The key is never printed:
// the output is the request with secrets masked (--dry-run), or the result and the provider's id for the message.
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const providerId = opt('provider') ?? 'onesignal';
const to = opt('to');
const dryRun = args.includes('--dry-run');
const envPath = (opt('env') ?? `~/.config/whoobe/${providerId}.env`).replace(/^~/, homedir());
if (!to && !dryRun) { console.error('Usage: node scripts/mail/live-check.mjs --provider onesignal --to you@example.com [--env FILE] [--dry-run]'); process.exit(2); }

const { loadMailProviders } = await import('../../packages/core/dist/mail/providers.js');
const { buildProviderRequest, sendViaHttpProvider } = await import('../../packages/core/dist/mail/http-transport.js');

const def = loadMailProviders().find((p) => p.id === providerId);
if (!def) { console.error(`No provider "${providerId}". Installed: ${loadMailProviders().map((p) => p.id).join(', ')}`); process.exit(2); }

let text;
try {
  if (statSync(envPath).mode & 0o077) { console.error(`${envPath} is readable by others: chmod 600 ${envPath}`); process.exit(2); }
  text = readFileSync(envPath, 'utf8');
} catch { console.error(`Cannot read ${envPath}. Create it (chmod 600) with the provider's settings, see the header of this script.`); process.exit(2); }

const values = Object.fromEntries(text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]));
const snake = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
const P = providerId.toUpperCase().replace(/-/g, '_');
const config = Object.fromEntries(def.configFields.map((f) => [f.name, values[`${P}_${snake(f.name)}`] ?? '']));
const secrets = def.configFields.filter((f) => f.secret).map((f) => config[f.name]).filter((v) => v.length >= 4);
const mask = (s) => secrets.reduce((t, v) => t.split(v).join('***'), s);

const msg = {
  to: to ?? 'recipient@example.com',
  subject: `Whoobe - ${def.label} live check`,
  html: `<h2>It works</h2><p>This message was sent by <b>Whoobe</b> through <b>${def.label}</b> to check the connection.</p><p>${new Date().toISOString()}</p>`,
  from: values[`${P}_FROM`] || undefined,
  fromName: values[`${P}_FROM_NAME`] || 'Whoobe',
  messageId: randomUUID(),
};

try {
  const built = buildProviderRequest(def, config, msg);
  console.log(`${built.method} ${built.url}`);
  console.log('headers:', mask(JSON.stringify(built.headers)));
  console.log('body   :', mask(built.body ?? ''));
  if (dryRun) { console.log('\n(dry run: nothing was sent)'); process.exit(0); }
  const r = await sendViaHttpProvider(def, config, msg);
  console.log(`\nAccepted by ${def.label}. Provider message id: ${r.reference ?? '(none returned)'}`);
} catch (e) {
  console.error(`\nFailed: ${mask(e instanceof Error ? e.message : String(e))}`);
  process.exit(1);
}

// One-off: brings the texts of the snippet "Whoobe Website - Benefits by role" in line with release 0.2.0 (they were written for 0.1.0 and said
// "no single sign-on", "no audit log", "no metrics endpoint"). The wording follows docs/release/by-role/*.md. Idempotent (a text already changed is
// left alone); the previous node goes to the snippet's version history. Run from packages/core:
//   cd packages/core && npx tsx ../../scripts/site/whoobe-dev/align-benefits-snippet.mts
import { listWhoobeOneSnippets, updateWhoobeOneSnippet } from '../../../packages/core/src/db/whoobe-one-snippet-records.ts';
import { closeDb } from '../../../packages/core/src/db/client.ts';

const NAME = 'Whoobe Website - Benefits by role';
const replacements: [string, string][] = [
  ['a young product (0.1.0)', 'a young product (a 0.x series)'],
  ['no single sign-on for staff; scaling is vertical first.', 'single sign-on is one OpenID Connect provider (SAML and LDAP need a broker); scaling is vertical first.'],
  ['Health endpoints and structured logs.', 'Readiness and liveness endpoints, optional Prometheus metrics, and structured logs.'],
  ['the runbooks were written from the code: rehearse a restore once. There is no metrics endpoint.', 'rehearse a restore once (a script does it on a throwaway workspace); nothing sends alerts.'],
  ['no audit log of administrative actions and no third-party certification; the evidence is the project own.', 'the audit log records successful actions only, single sign-on is one provider, and there is no third-party certification: the evidence is the project’s own.'],
  ['headless SDK for React, Vue and Svelte', 'headless SDK (React, Next.js, Vue, Nuxt and Svelte)'],
];
const snippet = (await listWhoobeOneSnippets()).find((s) => s.name === NAME);
if (!snippet) throw new Error(`snippet "${NAME}" not found`);
const node = JSON.parse(JSON.stringify(snippet.node));
let changed = 0;
const done = new Set<string>();
(function walk(n: any) {
  if (!n || typeof n !== 'object') return;
  if (typeof n.content === 'string') for (const [from, to] of replacements) if (n.content.includes(from)) { n.content = n.content.replace(from, to); done.add(from); changed++; }
  if (n.link === '/docs') { n.link = 'https://docs.whoobe.dev/by-role/'; n.linkTarget = '_blank'; done.add('link'); changed++; }
  for (const k of n.blocks ?? []) walk(k);
})(node);
const missing = [...replacements.map((r) => r[0]), 'link'].filter((k) => !done.has(k));
if (changed) {
  await updateWhoobeOneSnippet(snippet.id, { name: snippet.name, category: snippet.category, icon: snippet.icon, node, notes: snippet.notes });
  console.log(`snippet updated: ${changed} change(s)`);
} else console.log('nothing to change (already aligned)');
if (missing.length && changed) console.log('not found (already changed, or edited by hand):', missing.join(' | '));
await closeDb();

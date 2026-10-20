// Builds the content of the new whoobe.dev (website "whoobe.dev" of the development instance) with the editor's own Element class:
//   scripts/site/whoobe-dev/content.json   the website, the header and footer snippets, the default template and the five pages
//                                          (generated, git-ignored: run this file first, then seed.mts)
// The texts come from docs/plans/website/new-site-copy.md (change them there first). Run from the repository root:
//   node scripts/site/whoobe-dev/generate.mjs      then load it with scripts/site/whoobe-dev/seed.mts (see its header)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Element from '../../../apps/whoobe-one-spike/src/scripts/ElementsClass.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Links to a page of this site are stored with the website's CMS rootPath in front, like in every Whoobe website: the editor's site preview
// resolves them, and whoobe-publish strips the prefix when it builds the site (renderer `stripRootPath`). Links to other sites open in a new tab.
const ROOT = '/whoobe-dev';
let n = 0;
const nextId = () => `wd-${(++n).toString(36).padStart(4, '0')}`;

function el(kind, o = {}) {
  let node;
  if (kind === 'Flexbox') node = new Element().Flexbox({ direction: o.dir ?? null });
  else if (kind === 'Heading') node = new Element().Heading(o.level ?? 2);
  else if (kind === 'Link') { node = new Element().Span(); node.element = 'a'; }
  else node = new Element().createElement(kind);
  node.id = nextId();
  if (o.text !== undefined) node.content = o.text;
  if (o.css) { if (node.type === 'container') node.css.container = `${node.css.container} ${o.css}`.trim(); else node.css.css = o.css; }
  if (o.semantic) node.semantic = o.semantic;
  if (o.link) {
    const internal = o.link.startsWith('/') && !o.link.startsWith('//');
    node.link = internal ? (o.link === '/' ? ROOT : ROOT + o.link) : o.link;
    if (/^https?:/i.test(o.link)) node.linkTarget = '_blank';
  }
  if (o.anchor) node.anchor = o.anchor;
  if (o.children) node.blocks = o.children;
  return node;
}

const A = 'text-indigo-600 underline underline-offset-2 hover:text-indigo-500';
const a = (href, text) => `<a href="${href}" class="${A}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
const DOCS = 'https://docs.whoobe.dev';
const h = (level, text, css) => el('Heading', { level, text, css });
const p = (html, css = '') => el('Paragraph', { text: html, css: `text-base leading-relaxed [&_a]:text-[#A78BFA] [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-white [&_strong]:text-white ${css}` });
const col = (css, children, extra = {}) => el('Flexbox', { dir: 'col', css, children, ...extra });
const row = (css, children, extra = {}) => el('Flexbox', { dir: 'row', css, children, ...extra });
const cta = (text, href, kind) => el('Link', {
  text, link: href,
  css: `inline-block px-6 py-3 rounded-lg font-semibold text-sm transition ${kind === 'primary' ? 'bg-[#7C3AED] text-white hover:bg-[#6D28D9] glow-violet-sm' : kind === 'light' ? 'bg-white text-[#0F1115] hover:bg-slate-200' : 'border border-white/20 text-slate-200 hover:bg-white/5'}`,
});
const eyebrow = (text, css = 'text-cyan-400') => p(text, `text-xs font-semibold tracking-widest uppercase ${css}`);
const section = (children, css = 'bg-[#0F1115]', extra = {}) => col(`w-full px-6 py-16 ${css}`, [col('max-w-6xl mx-auto w-full gap-8', children)], { semantic: 'section', ...extra });
// the root carries the colours of the theme too, so the page reads the same where the theme is not loaded (the editor's site preview)
const doc = (sections) => { const d = new Element().Flexbox({ direction: 'col' }).setIcon('dashboard').setTag('document'); d.id = nextId(); d.css.container += ' bg-[#0F1115] text-slate-200'; d.blocks = sections; return d; };

const pageHero = (kicker, title, lead) => col('w-full px-6 pt-20 pb-14 bg-[#12151B] border-b border-white/10', [
  col('max-w-4xl mx-auto w-full gap-4', [eyebrow(kicker), h(1, title, 'text-4xl md:text-5xl font-bold leading-tight text-white'), p(lead, 'text-lg text-slate-400')]),
], { semantic: 'section' });

const bandCta = (title, lead, buttons) => col('w-full px-6 py-16 bg-gradient-to-br from-[#2E1065] via-[#12151B] to-[#0F1115] text-white border-y border-white/10', [
  col('max-w-3xl mx-auto w-full items-center text-center gap-5', [h(2, title, 'text-3xl font-bold'), p(lead, 'text-slate-300'), row('gap-3 flex-wrap justify-center', buttons)]),
], { semantic: 'section' });

// ---------------- header and footer (snippets, placed by the default template) ----------------
const navLink = (t, href) => el('Link', { text: t, link: href, css: 'text-sm text-slate-400 hover:text-white' });
// phone: the brand and the button on one row, the links on a second row that scrolls sideways; from md up, everything on one row
// (a link element is rendered as <a><element class=...></a>: flex-item classes such as `order` go on a container around it)
const header = () => row('w-full flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3 bg-[#0F1115]/90 backdrop-blur border-b border-white/10', [
  col('order-1', [el('Link', { text: 'Whoobe', link: '/', css: 'text-xl font-bold text-white font-heading' })]),
  col('order-2 md:order-3', [el('Link', { text: 'Try the sandbox', link: 'https://sandbox.whoobe.dev', css: 'inline-block px-4 py-2 rounded-lg font-semibold text-sm bg-[#7C3AED] text-white hover:bg-[#6D28D9]' })]),
  row('order-3 md:order-2 w-full md:w-auto items-center gap-5 overflow-x-auto flex-nowrap whitespace-nowrap md:justify-end', [navLink('Platform', '/platform'), navLink('Security', '/security'), navLink('Run it', '/run'), navLink('Developers', '/developers'), navLink('Blog', '/blog'), navLink('Docs', DOCS), navLink('GitHub', 'https://github.com/swina/whoobe_project')]),
], { semantic: 'header' });
const fcol = (title, links) => col('gap-2', [p(title, 'text-sm font-semibold text-white'), ...links.map(([t, href]) => el('Link', { text: t, link: href, css: 'text-sm text-slate-400 hover:text-white' }))]);
const footer = () => col('w-full px-6 py-12 bg-[#0B0D11] border-t border-white/10', [
  col('max-w-6xl mx-auto w-full gap-10 md:flex-row justify-between', [
    col('gap-2 max-w-xs', [p('Whoobe', 'text-lg font-bold text-white'), p('A self-hosted platform instead of the glue between your CMS, your data and your systems.', 'text-sm text-slate-400')]),
    row('gap-12 flex-wrap', [
      fcol('Product', [['Platform', '/platform'], ['Security and governance', '/security'], ['Run it', '/run']]),
      fcol('Developers', [['Documentation', DOCS], ['API reference', `${DOCS}/api/api-reference/`], ['GitHub', 'https://github.com/swina/whoobe_project'], ['Plans and decisions', 'https://github.com/swina/whoobe_project/tree/master/docs/plans']]),
      fcol('Project', [['Blog', '/blog'], ['Release notes', `${DOCS}/release-notes-0.2.0/`], ['Security policy', 'https://github.com/swina/whoobe_project/blob/master/SECURITY.md'], ['Sandbox', 'https://sandbox.whoobe.dev']]),
    ]),
  ]),
  p('Released under the MIT License. This site is made with Whoobe.', 'text-xs text-slate-500 max-w-6xl mx-auto w-full pt-8'),
], { semantic: 'footer' });

// ---------------- Home ----------------
const homeHero = () => col('w-full px-6 pt-24 pb-20 bg-gradient-to-br from-[#0F1115] via-[#12151B] to-[#2E1065] text-white', [
  col('max-w-4xl mx-auto w-full gap-6', [
    eyebrow('Unify your stack', 'text-cyan-300'),
    h(1, 'A self-hosted platform instead of the glue between your CMS, your data and your systems.', 'text-4xl md:text-5xl font-bold leading-tight'),
    p('Configure it instead of coding it. No code for the people who use it. Security and governance controls built in, with the tests and their results in the open. MIT licence, one organisation per installation, no per-user fee.', 'text-lg text-slate-300 max-w-3xl'),
    row('gap-3 flex-wrap items-center', [cta('Try the live sandbox', 'https://sandbox.whoobe.dev', 'light'), el('Link', { text: 'Run it on your machine', link: `${DOCS}/operations/miniguide-deployment/`, css: 'inline-block px-6 py-3 rounded-lg font-semibold text-sm border border-white/40 text-white hover:bg-white/10' }), el('Link', { text: 'Read the documentation →', link: DOCS, css: 'text-sm text-slate-300 hover:text-white underline underline-offset-4' })]),
    p('<code>git clone https://github.com/swina/whoobe_project &amp;&amp; cd whoobe_project &amp;&amp; ./try.sh</code>', 'text-xs text-slate-400 font-mono break-all'),
    p('MIT · self-hosted · version 0.2.0 · no per-user fee', 'text-xs text-slate-500'),
  ]),
], { semantic: 'section' });

// `to` is [text, href]: a link element, so a link to a page of this site gets the rootPath prefix (an <a> inside a paragraph does not)
const proof = (title, text, to) => col('flex-1 gap-3 rounded-xl glass-panel bg-[#1A1D24]/70 border border-white/10 p-6', [h(3, title, 'text-lg font-semibold text-white'), p(text, 'text-slate-400'), el('Link', { text: to[0], link: to[1], css: 'text-sm text-[#A78BFA] underline underline-offset-2 hover:text-white' })]);

const homeBody = () => [
  section([
    h(2, 'What it replaces', 'text-3xl font-bold text-white'),
    p('Most organisations that publish and integrate end up with four things stitched together: a content platform, a page builder, a library for files, and a layer of scripts and connectors to the systems they already own. Each has its own users, its own secrets, its own upgrades.', 'text-slate-300 max-w-3xl'),
    p('Whoobe is one installation with <strong>one data model, one gateway to your systems, one media library and one editor</strong>, run by the team that owns it.', 'text-slate-300 max-w-3xl'),
  ], 'bg-[#0F1115]'),
  section([
    h(2, 'Three things to check', 'text-3xl font-bold text-white'),
    col('gap-6 md:flex-row', [
      proof('Configuration, not glue code', 'Point the gateway at an OpenAPI file or a sample request: routes, response shapes and fields appear in the editor, and a block can show the data. The credentials stay on the server.', ['How it works →', '/platform']),
      proof('No code for the people who use it', 'Editors build pages from blocks, snippets and kits. A data manager adds a field to a class without a deploy. Nobody on the content side asks a developer to move a button or to publish.', ['The user manual →', `${DOCS}/guides/user-manual/`]),
      proof('Security controls, and the proof behind them', 'An append-only audit log, mandatory two-factor authentication by role, single sign-on with OpenID Connect, encrypted credentials, data subject tools and retention, metrics. We do not certify our own code: we say what we tested, publish the results, failures included, and list what is not covered.', ['Controls, tests and limits →', '/security']),
    ]),
  ], 'bg-[#12151B]'),
  section([
    h(2, 'Open source means showing the work', 'text-3xl font-bold text-white'),
    p('The code is MIT and public. So are the tests, the findings (open and closed), the results of every release, failures included, and the plans that say how it is built, including the use of an AI assistant. We do not ask you to trust a claim: we put what backs it where you can open it.', 'text-slate-300 max-w-3xl'),
    row('gap-x-8 gap-y-2 flex-wrap', [
      el('Link', { text: 'The tests →', link: 'https://github.com/swina/whoobe_project/tree/master/scripts/security', css: 'text-sm text-[#A78BFA] underline underline-offset-2 hover:text-white' }),
      el('Link', { text: 'The findings →', link: `${DOCS}/security/findings/`, css: 'text-sm text-[#A78BFA] underline underline-offset-2 hover:text-white' }),
      el('Link', { text: 'Results of release 0.2.0 →', link: 'https://github.com/swina/whoobe_project/blob/master/docs/release/security/results/v0.2.0.md', css: 'text-sm text-[#A78BFA] underline underline-offset-2 hover:text-white' }),
      el('Link', { text: 'The plans →', link: 'https://github.com/swina/whoobe_project/tree/master/docs/plans', css: 'text-sm text-[#A78BFA] underline underline-offset-2 hover:text-white' }),
    ]),
  ], 'bg-[#0F1115]'),
  section([
    h(2, 'Where it stands', 'text-3xl font-bold text-white'),
    p(`Version <strong>0.2.0</strong>, a <code>0.</code> series: behaviour can change between minor releases, and the ${a(`${DOCS}/release-notes-0.2.0/`, 'release notes')} say what. One OpenID Connect provider, no SAML or LDAP, no high availability yet. The limits are on ${a('/security#not-there', 'one page')}, not in the small print.`, 'text-slate-300 max-w-3xl'),
  ], 'bg-[#12151B]'),
  bandCta('Try it before you read more', 'The sandbox has a demo website, two kits and the editor. It is deleted and rebuilt every three hours.', [cta('Open the sandbox', 'https://sandbox.whoobe.dev', 'light'), el('Link', { text: 'Run the whole stack locally', link: 'https://github.com/swina/whoobe_project#try-it', css: 'inline-block px-6 py-3 rounded-lg font-semibold text-sm border border-white/40 text-white hover:bg-white/10' })]),
];

// ---------------- Platform ----------------
const block = (title, configure, notWrite, links) => col('gap-3 rounded-xl glass-panel bg-[#1A1D24]/70 border border-white/10 p-6', [
  h(3, title, 'text-xl font-semibold text-white'),
  col('gap-6 md:flex-row', [
    col('flex-1 gap-1', [eyebrow('You configure'), p(configure, 'text-slate-300')]),
    col('flex-1 gap-1', [eyebrow('You do not write', 'text-slate-500'), p(notWrite, 'text-slate-300')]),
  ]),
  p(links, 'text-sm'),
]);
const platformBody = () => [
  section([
    block('Data model', 'Classes, fields and relations in the dashboard, changed at run time. Objects, translations and workflow states for review.', 'A schema migration or a deploy to add a field, nor a second model for the mobile app or the API: they read the same one.', a(`${DOCS}/data/data-model/`, 'Data model →')),
    block('Gateway to your systems', 'An endpoint by its base URL or an OpenAPI file, how it authenticates (API key, bearer, basic, OAuth 2 client credentials), a rate limit, and which fields a block shows. Presets exist for common vendors.', 'The connector, the token handling or a proxy for the browser. Credentials are encrypted at rest and used only inside the gateway: the editor, the browser and the published site never see them.', `${a(`${DOCS}/communication/integrations/`, 'Integrations →')} · ${a(`${DOCS}/communication/api-gateway-security/`, 'Gateway security →')}`),
    block('Visual editor', 'Pages from blocks, snippets, kits, themes, templates with header, aside and footer, translations, and the bindings between a block and live data. A page is stored as a validated tree, not as HTML, so the same page can be a site, an app screen or an API response.', 'A page template per channel, or a release to change the text of a button.', `${a(`${DOCS}/guides/user-manual/`, 'User manual →')} · ${a(`${DOCS}/guides/user-manual/snippets-kits/`, 'Kits and snippets →')}`),
    block('Events and forms', 'Subscriptions to changes of objects, files and pages, with signed deliveries, retries and a guard against loops; forms with file uploads. The engine that reacts to an event is yours (Node-RED, n8n, your own service): Whoobe emits, it does not impose one.', 'Polling jobs to find out that something changed.', `${a(`${DOCS}/communication/object-events/`, 'Object events →')} · ${a(`${DOCS}/communication/automations-architecture/`, 'Automations →')}`),
    block('Publishing', 'A static or server-rendered website (Nuxt or Next.js), a documentation site from Markdown, a native mobile app (Capacitor) or the headless API with adapters for React, Vue, Next.js, Nuxt and Svelte.', 'A different pipeline for each surface.', `${a(`${DOCS}/content/publishing/`, 'Publishing →')} · ${a(`${DOCS}/content/headless-sdk/`, 'Headless SDK →')}`),
  ], 'bg-[#0F1115]'),
  bandCta('See it working', `The ${'sandbox'} has a demo website, two kits and the editor; <code>./try.sh</code> runs the whole stack on your machine.`, [cta('Open the sandbox', 'https://sandbox.whoobe.dev', 'light'), el('Link', { text: 'Read the documentation', link: DOCS, css: 'inline-block px-6 py-3 rounded-lg font-semibold text-sm border border-white/40 text-white hover:bg-white/10' })]),
];

// ---------------- Security ----------------
const tr = (q, w, d, head) => col(`w-full gap-4 py-4 border-b border-white/10 md:flex-row ${head ? 'bg-white/5 px-3' : 'px-3'}`, [
  p(q, `md:w-1/4 text-sm ${head ? 'font-semibold text-slate-400 uppercase tracking-wide' : 'font-semibold text-white'}`),
  p(w, `md:w-1/2 text-sm ${head ? 'font-semibold text-slate-400 uppercase tracking-wide' : 'text-slate-300'}`),
  p(d, `md:w-1/4 text-sm ${head ? 'font-semibold text-slate-400 uppercase tracking-wide' : ''}`),
]);
const securityRows = [
  ['Who did what, and from where?', 'An append-only audit log of administrative actions: who, from which address, what, on which target, the fields before and after. Secrets are recorded as “changed”, never as a value. Filters and CSV export. The database refuses to update or truncate it.', a(`${DOCS}/operations/audit-log/`, 'Audit log')],
  ['Is a second factor required?', 'An administrator chooses the roles that must use two-factor authentication. A user of such a role with no second factor is led to enrolment and gets no session until it is done. A password policy applies where a password is set.', a(`${DOCS}/release-notes-0.2.0/`, 'Release notes 0.2.0')],
  ['Can staff sign in with our identity provider?', 'OpenID Connect single sign-on (authorization code with PKCE), roles taken from a claim at each sign-in, provisioning by a verified e-mail only, a local break-glass for administrators.', a(`${DOCS}/operations/single-sign-on/`, 'Single sign-on')],
  ['Where do the credentials of integrations live?', 'Encrypted at rest, decrypted only inside the gateway, never sent to a browser. Keys come from the environment; the procedure to rotate each secret is written down (it is manual).', `${a(`${DOCS}/operations/encryption/`, 'Encryption')} · ${a(`${DOCS}/operations/secrets-and-keys/`, 'Secrets and keys')}`],
  ['Can we answer a data subject request?', 'Find, export and erase what is held about one person by one value (an e-mail), with a dry run first and the action audited without the value. Retention per data class.', a(`${DOCS}/operations/data-subject-requests/`, 'Data subject requests')],
  ['Can we monitor it?', 'A readiness and a liveness endpoint, Prometheus metrics behind a token, structured logs with a switch for the level.', a(`${DOCS}/operations/observability-and-logging/`, 'Observability')],
  ['Can we recover?', 'Encrypted database backups and restore scripts, and a rehearsal script that restores a backup into a throwaway stack and checks it. A nightly job pulled by another machine (the host holds no credentials for the copy), with a freshness check, is in the code after 0.2.0 and ships with the next release.', `${a(`${DOCS}/operations/scheduling-backups/`, 'Scheduling backups')} · ${a(`${DOCS}/operations/backup-restore-and-dr/`, 'Backup and recovery')}`],
  ['Is the supply chain looked at?', 'Service images signed and published per release, with a source SBOM; the CI runs a dependency audit, a secret scan, static analysis and container scans.', a(`${DOCS}/security/supply-chain/`, 'Supply chain')],
  ['Has it been tested?', 'Automated API, browser, isolation and DAST suites run in CI on a disposable stack. The findings, open and closed, are published.', `${a(`${DOCS}/security/security-test-suite/`, 'Security test suite')} · ${a(`${DOCS}/security/findings/`, 'Findings')}`],
];
const tests2 = (obj, how, head) => col(`w-full gap-2 py-4 border-b border-white/10 md:flex-row px-3 ${head ? 'bg-white/5' : ''}`, [
  p(obj, `md:w-1/2 text-sm ${head ? 'font-semibold text-slate-400 uppercase tracking-wide' : 'font-semibold text-white'}`),
  p(how, `md:w-1/2 text-sm ${head ? 'font-semibold text-slate-400 uppercase tracking-wide' : 'text-slate-300'}`),
]);
const testedRows = [
  ['Sessions, lockout, password reset, the second factor and single sign-on behave as designed', 'API test suites; the OpenID Connect sign-in against a mock and a real Keycloak'],
  ['Every route is guarded as intended', 'Every route is classified (public, signed in, or by permission) in a checked-in contract, and each guarded route is called as five different identities. A new route with no classification fails the run.'],
  ['One workspace cannot reach another', 'Two workspaces are started side by side and one tries to reach the other'],
  ['Visitors cannot read what is not public', 'Tests of drafts, preview tokens, private files and the public search'],
  ['Uploads and outbound requests cannot be abused', 'Upload tests (type, content, size, tickets) and a guard against requests to internal addresses, tested'],
  ['Stored text and pages do not run injected code', 'Browser tests that feed hostile markup to the editor, the published pages and the lists of the dashboard'],
  ['No secret in the code or its history, no known vulnerable dependency or image', 'Secret scan of the tree and of the whole git history, dependency audit, static analysis and container and configuration scans'],
  ['The running stack answers safely to a standard scan', 'An OWASP ZAP baseline scan of the running stack, and a scan of the proxy template\'s TLS policy'],
];
const resultRows = [
  ['The tests', 'In the repository (<code>scripts/security</code>): anyone can run them against a disposable stack.', a('https://github.com/swina/whoobe_project/tree/master/scripts/security', 'scripts/security')],
  ['What each suite asserts, and what it does not', 'Written for reviewers, with the plan and a manual checklist.', a(`${DOCS}/security/security-test-suite/`, 'Test suite')],
  ['Every finding, open or closed', 'A register with severity and state, published when a finding is made, not when it is fixed.', a(`${DOCS}/security/findings/`, 'Findings')],
  ['Where the work stands, on one page', 'With the open items and what is not covered.', a(`${DOCS}/security/status-summary/`, 'Status summary')],
  ['The result of each release', 'One record per release: the run, the commit, every job, the runs that failed first, what changed after the test, what was not covered.', a('https://github.com/swina/whoobe_project/blob/master/docs/release/security/results/v0.2.0.md', 'Release 0.2.0')],
  ['The runs themselves', 'The CI history of the repository is public, with its logs.', a('https://github.com/swina/whoobe_project/actions', 'Actions')],
  ['How the code is written', 'Written plans and decisions, including the use of an AI assistant.', a('https://github.com/swina/whoobe_project/tree/master/docs/plans', 'docs/plans')],
];
const tableOf = (rows, mk, headCells) => col('w-full rounded-xl overflow-hidden glass-panel bg-[#1A1D24]/70 border border-white/10', [mk(...headCells, true), ...rows.map((r) => mk(...r, false))]);
const securityBody = () => [
  section([
    h(2, 'What is built in', 'text-3xl font-bold text-white'),
    col('w-full rounded-xl overflow-hidden glass-panel bg-[#1A1D24]/70 border border-white/10', [tr('The question', 'In Whoobe', 'Documented', true), ...securityRows.map(([q, w, d]) => tr(q, w, d, false))]),
  ], 'bg-[#0F1115]'),
  section([
    h(2, 'What we tested, and with what objective', 'text-3xl font-bold text-white'),
    p('We do not say “our code is secure”, and we do not certify it ourselves. We say what we set out to check, and how.', 'text-slate-300 max-w-3xl'),
    tableOf(testedRows, tests2, ['The objective', 'How it is checked']),
    p(`What each suite asserts, and what it does not: ${a(`${DOCS}/security/security-test-suite/`, 'the test suite document')}.`, 'text-sm text-slate-400'),
  ], 'bg-[#12151B]'),
  section([
    h(2, 'What the tests do not tell you', 'text-3xl font-bold text-white'),
    col('gap-3 max-w-3xl', [
      p('A green run means that <strong>these checks passed on this code, at this commit</strong>. It does not mean that there are no vulnerabilities. It is not an audit, a penetration test or a certification, and there has not been an outside one: all the work is ours.', 'text-slate-300'),
      p('The coverage has holes, and they are listed: SQL fuzzing of most endpoints, the impact of prompt injection on the AI features, a full Content-Security-Policy for the admin and the editor, a live host with a public certificate, and load testing (by design).', 'text-slate-300'),
    ]),
  ], 'bg-[#0F1115]'),
  section([
    h(2, 'Where the results are, and they stay public', 'text-3xl font-bold text-white'),
    p('Open source earns the name by showing its work. The tests, the findings, the results of every release and the plans are in the repository or in its public history. <strong>The failures are published too</strong>: on the day of release 0.2.0, two runs failed before the green one, and both are in the record.', 'text-slate-300 max-w-3xl'),
    tableOf(resultRows.map(([x, y, z]) => [x, y, z.replace('RESULTS_URL', 'https://github.com/swina/whoobe_project/blob/master/docs/release/security/results/v0.2.0.md')]), (x, y, z, head) => row(`w-full gap-4 py-4 border-b border-white/10 flex-col md:flex-row px-3 ${head ? 'bg-white/5' : ''}`.replace('flex-col md:flex-row', 'md:flex-row'), [
      p(x, `md:w-1/4 text-sm ${head ? 'font-semibold text-slate-400 uppercase tracking-wide' : 'font-semibold text-white'}`),
      p(y, `md:w-1/2 text-sm ${head ? 'font-semibold text-slate-400 uppercase tracking-wide' : 'text-slate-300'}`),
      p(z, `md:w-1/4 text-sm ${head ? 'font-semibold text-slate-400 uppercase tracking-wide' : ''}`),
    ]), ['What', 'What it is', 'Where']),
    p('If a claim on this site is not backed by something you can open, tell us.', 'text-slate-400'),
  ], 'bg-[#12151B]'),
  section([
    h(2, 'What is not there (yet)', 'text-3xl font-bold text-white'),
    col('gap-3 max-w-3xl', [
      p('<strong>One OpenID Connect provider</strong> at a time. It was tried against Keycloak; Microsoft Entra, Okta and Google follow the same standard and have <strong>not</strong> been tried. SAML and LDAP are not built: a broker in front covers them.', 'text-slate-300'),
      p('<strong>The audit log records successful actions.</strong> A refused attempt is not in it.', 'text-slate-300'),
      p('<strong>Two-factor authentication, the password policy and retention are off until you set them.</strong> An upgrade changes nothing by itself.', 'text-slate-300'),
      p('<strong>No high availability.</strong> One installation, one database; recovery is by backup and restore.', 'text-slate-300'),
      p('<strong>No third-party certification</strong> (ISO 27001, SOC 2) and no outside penetration test.', 'text-slate-300'),
      p(`It is a <strong><code>0.</code> series</strong>: behaviour can change between minor releases. The ${a(`${DOCS}/release-notes-0.2.0/`, 'release notes')} list what.`, 'text-slate-300'),
    ]),
  ], 'bg-[#0F1115]', { anchor: 'not-there' }),
  bandCta('Check it yourself', 'The sandbox is the real product with the risky features switched off, and the tests and their results are public.', [cta('Open the sandbox', 'https://sandbox.whoobe.dev', 'light'), el('Link', { text: 'Read the results of 0.2.0', link: 'https://github.com/swina/whoobe_project/blob/master/docs/release/security/results/v0.2.0.md', css: 'inline-block px-6 py-3 rounded-lg font-semibold text-sm border border-white/40 text-white hover:bg-white/10' })]),
];

// ---------------- Run it ----------------
const runBody = () => [
  section([
    h(2, 'What runs', 'text-3xl font-bold text-white'),
    p(`Five application services (API, asset service, gateway, dashboard, editor), PostgreSQL 16 and an object store (Garage in the default stack; any S3-compatible store, or a managed one, in production). Docker Compose is the way it is deployed and documented. ${a(`${DOCS}/architecture/architecture-overview/`, 'Architecture →')}`, 'text-slate-300 max-w-3xl'),
    h(2, 'How it is organised', 'text-3xl font-bold text-white'),
    p(`<strong>One organisation per installation.</strong> A company with several sites uses one installation and several websites; an agency uses one workspace per client. Roles follow functions (editor, publisher, administrator), not people. ${a(`${DOCS}/operations/creating-workspaces/`, 'Creating workspaces →')}`, 'text-slate-300 max-w-3xl'),
  ], 'bg-[#0F1115]'),
  section([
    h(2, 'Day two', 'text-3xl font-bold text-white'),
    col('gap-3 max-w-3xl', [
      p(`<strong>Upgrades:</strong> migrations are additions only, applied when the API starts; the release notes list behaviour changes; take a backup first. ${a(`${DOCS}/operations/upgrade-and-migrations/`, 'Upgrade and migrations →')}`, 'text-slate-300'),
      p(`<strong>Backups and recovery:</strong> encrypted database backups, restore scripts and a rehearsal; the nightly job pulled by another machine, with a freshness check, comes with the next release. ${a(`${DOCS}/operations/scheduling-backups/`, 'Scheduling backups →')}`, 'text-slate-300'),
      p(`<strong>Observability:</strong> health, metrics, logs. ${a(`${DOCS}/operations/observability-and-logging/`, 'Observability →')}`, 'text-slate-300'),
      p(`<strong>What it takes:</strong> the skills and the hours, estimated, by task and by frequency. ${a(`${DOCS}/operations/skills-and-effort/`, 'Skills and effort →')}`, 'text-slate-300'),
      p('<strong>No call home:</strong> no telemetry, no analytics, no licence check; nothing is sent to the authors.', 'text-slate-300'),
    ]),
  ], 'bg-[#12151B]'),
  section([
    h(2, 'Is it for you', 'text-3xl font-bold text-white'),
    col('gap-6 md:flex-row', [
      col('flex-1 gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6', [h(3, 'For', 'text-lg font-semibold text-emerald-300'), p('An organisation with a technical team or partner that wants to own its web platform: a company with several sites, an agency with a workspace per client, a team whose integrations no ready-made connector covers, an organisation that wants its applications to share one governed gateway to internal systems.', 'text-slate-300')]),
      col('flex-1 gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-6', [h(3, 'Not for (today)', 'text-lg font-semibold text-amber-300'), p('A team with nobody to run a server; a deployment that needs high availability or a third-party compliance certificate; a business that wants one shared platform for many unrelated companies.', 'text-slate-300')]),
    ]),
  ], 'bg-[#0F1115]'),
  bandCta('Start with the sandbox', 'Then run the whole stack on your machine with one command.', [cta('Open the sandbox', 'https://sandbox.whoobe.dev', 'light'), el('Link', { text: 'The deployment guide', link: `${DOCS}/operations/miniguide-deployment/`, css: 'inline-block px-6 py-3 rounded-lg font-semibold text-sm border border-white/40 text-white hover:bg-white/10' })]),
];

// ---------------- Developers ----------------
const dev = (title, text) => col('flex-1 gap-2 rounded-xl glass-panel bg-[#1A1D24]/70 border border-white/10 p-6 min-w-[16rem]', [h(3, title, 'text-lg font-semibold text-white'), p(text, 'text-sm text-slate-400')]);
const developersBody = () => [
  section([
    row('gap-6 flex-wrap', [
      dev('Headless', `Adapters for React, Vue, Next.js, Nuxt and Svelte, and a public API with keys per website. ${a(`${DOCS}/content/headless-sdk/`, 'Headless SDK →')}`),
      dev('API', `Every route is documented, and a test fails for a route that is not. ${a(`${DOCS}/api/api-reference/`, 'API reference →')} (OpenAPI file included)`),
      dev('Events', `Subscribe to object, file and page changes; deliveries are signed (HMAC) and guarded against loops. ${a(`${DOCS}/communication/object-events/`, 'Object events →')}`),
      dev('Gateway', `Put any API behind it and bind its fields to blocks. ${a(`${DOCS}/communication/integrations/`, 'Integrations →')}`),
      dev('The code', `TypeScript monorepo (Node, Vue 3, Postgres). <code>./try.sh</code> starts everything locally. ${a('https://github.com/swina/whoobe_project/blob/master/docs/development.md', 'Developing Whoobe →')}`),
      dev('How it is built', `With an AI assistant working inside written plans, all public in ${a('https://github.com/swina/whoobe_project/tree/master/docs/plans', 'docs/plans')}, and a test suite that guards the boundaries. ${a('/blog/article/plans-before-code-keeping-an-ai-inside-the-architecture', 'Plans before code →')} · ${a('/blog/article/building-whoobe-with-ai-what-we-measured', 'What we measured →')}`),
    ]),
  ], 'bg-[#0F1115]'),
  bandCta('Read it, run it, change it', 'The code is MIT-licensed and public.', [cta('GitHub', 'https://github.com/swina/whoobe_project', 'light'), el('Link', { text: 'Contribute', link: 'https://github.com/swina/whoobe_project/blob/master/CONTRIBUTING.md', css: 'inline-block px-6 py-3 rounded-lg font-semibold text-sm border border-white/40 text-white hover:bg-white/10' })]),
];

const seo = (title, description) => ({ metaTitle: title, metaDescription: description, canonicalUrl: null, robots: { index: true, follow: true }, ogTitle: title, ogDescription: description, ogImage: null });

const content = {
  themeName: 'Whoobe Website',
  website: { name: 'whoobe.dev', rootPath: '/whoobe-dev', domains: ['www.whoobe.dev'], defaultLocale: 'en', supportedLocales: ['en'] },
  snippets: [
    { name: 'whoobe.dev header', category: 'navigation', icon: '🧭', node: header(), notes: 'The site header: brand, navigation, the sandbox button. Placed by the default template "Site layout".' },
    { name: 'whoobe.dev footer', category: 'footer', icon: '🦶', node: footer(), notes: 'The site footer: three columns of links and the licence line. Placed by the default template "Site layout".' },
  ],
  template: { name: 'Site layout', description: 'Header and footer snippets around every page of whoobe.dev.', isDefault: true, headerSnippet: 'whoobe.dev header', footerSnippet: 'whoobe.dev footer' },
  pages: [
    { title: 'Home', slug: '/', category: 'Site', kind: 'content', seo: seo('Whoobe: a self-hosted platform instead of the glue', 'Whoobe is a self-hosted platform for content, data and integrations: configuration instead of code, no code for the people who use it, security and governance built in. MIT.'), content: doc([homeHero(), ...homeBody()]) },
    { title: 'Platform', slug: '/platform', category: 'Site', kind: 'content', seo: seo('Platform: configuration instead of glue code | Whoobe', 'What you configure in Whoobe, and what you do not have to write: data model, gateway, editor, events and forms, publishing.'), content: doc([pageHero('Platform', 'What you configure, and what you do not have to write.', 'Five parts, one installation. For each: what you set up, what you no longer write, and where it is documented.'), ...platformBody()]) },
    { title: 'Security and governance', slug: '/security', category: 'Site', kind: 'content', seo: seo('Security and governance: controls, tests and limits | Whoobe', 'The controls in Whoobe 0.2, what we tested and with what objective, what the tests do not tell you, and where the results are published, failures included.'), content: doc([pageHero('Security and governance', 'What is built in, what we tested, and what we did not.', 'Open source earns the name by showing its work. We do not certify our own code and we do not say “our code is secure”. Release 0.2, named <em>Conduct</em>, adds the controls a security officer asks for. This page lists them, says what we tested and why, what the tests cannot tell you, and where every result is published.'), ...securityBody()]) },
    { title: 'Run it', slug: '/run', category: 'Site', kind: 'content', seo: seo('Run it: built to be run by a small team | Whoobe', 'What runs, how it is organised, upgrades, backups, observability and who Whoobe is for. Containers, PostgreSQL and an S3-compatible store.'), content: doc([pageHero('Run it', 'Built to be run by a small team.', 'Whoobe is containers, a PostgreSQL database and an S3-compatible object store. No licence server, no per-user fee, no call home.'), ...runBody()]) },
    { title: 'Developers', slug: '/developers', category: 'Site', kind: 'content', seo: seo('Developers | Whoobe', 'Headless adapters, a documented API, signed events, a gateway and the code: MIT-licensed and public.'), content: doc([pageHero('Developers', 'Build on it, or read it.', 'The platform is an API first and an interface second.'), ...developersBody()]) },
  ],
  copyFromWebsite: { name: 'whoobe website', slugs: ['/blog', '/blog/article/{slug}'] },
};
fs.writeFileSync(path.join(here, 'content.json'), JSON.stringify(content, null, 2) + '\n');
console.log('pages:', content.pages.map((x) => x.slug).join(', '), '| snippets:', content.snippets.length, '| copied from the old site:', content.copyFromWebsite.slugs.join(', '));

// Builds the demo content with the editor's own Element class, so every node has exactly the shape the editor saves:
//   packages/core/seed-data/kits/landing-basics.json and page-sections.json  (two kits shipped with the distribution, `bundled`)
//   scripts/sandbox/demo/content.json                                         (the sandbox's demo website, pages and snippets)
// Run from the repository root:  node scripts/sandbox/demo/generate.mjs     (the outputs are committed; run again after changing this file)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Element from '../../../apps/whoobe-one-spike/src/scripts/ElementsClass.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');

let n = 0;
const nextId = (prefix) => `${prefix}-${(++n).toString(36).padStart(3, '0')}`;

// el('Heading', { level: 2, text: 'Hi', css: 'text-3xl' }) / el('Flexbox', { dir: 'col', css: 'gap-4', children: [...] })
function el(kind, o = {}) {
  let node;
  if (kind === 'Flexbox') node = new Element().Flexbox({ direction: o.dir ?? null });
  else if (kind === 'Grid') node = new Element().Grid().Cols(o.cols ?? 1);
  else if (kind === 'Heading') node = new Element().Heading(o.level ?? 2);
  else node = new Element().createElement(kind);
  node.id = nextId('demo');
  if (o.text !== undefined) node.content = o.text;
  if (o.css) {
    if (node.type === 'container') node.css.container = `${node.css.container} ${o.css}`.trim();
    else node.css.css = o.css;
  }
  if (o.semantic) node.semantic = o.semantic;
  if (o.link) node.link = o.link;
  if (o.anchor) node.anchor = o.anchor;
  if (o.name) node.name = o.name;
  if (o.children) node.blocks = o.children;
  return node;
}

const h = (level, text, css) => el('Heading', { level, text, css });
const p = (text, css) => el('Paragraph', { text, css });
const btn = (text, css, link) => el('Button', { text, css: `px-6 py-3 rounded-lg font-semibold transition ${css}`, link });
const col = (css, children, extra = {}) => el('Flexbox', { dir: 'col', css, children, ...extra });
const row = (css, children, extra = {}) => el('Flexbox', { dir: 'row', css, children, ...extra });
const grid = (cols, css, children) => el('Grid', { cols, css, children });

const wrapDoc = (child) => {
  const doc = new Element().Flexbox({ direction: 'col' }).setIcon('dashboard').setTag('document');
  doc.id = nextId('demo');
  doc.blocks = [child];
  return doc;
};

// ---------- sections ----------
const heroCentered = () => col('w-full items-center text-center gap-6 px-6 py-24 bg-gradient-to-br from-indigo-600 to-violet-700 text-white', [
  p('NEW · VERSION 2.0 IS OUT', 'text-xs font-semibold tracking-widest text-indigo-200'),
  h(1, 'Plan less. Ship more.', 'text-5xl font-bold max-w-3xl'),
  p('One calm place for your tasks, your notes and your team. Start in a minute, no card needed.', 'text-lg text-indigo-100 max-w-2xl'),
  row('gap-3 items-center justify-center flex-wrap', [btn('Start for free', 'bg-white text-indigo-700 hover:bg-indigo-50', '#pricing'), btn('See how it works', 'border border-white/60 text-white hover:bg-white/10', '#features')]),
], { semantic: 'section' });

const heroSplit = () => col('w-full px-6 py-20 bg-white text-slate-900', [
  row('max-w-6xl mx-auto w-full items-center gap-12 flex-col md:flex-row', [
    col('flex-1 gap-5', [
      p('FOR SMALL TEAMS', 'text-xs font-semibold tracking-widest text-indigo-600'),
      h(1, 'Everything your team needs, nothing it does not', 'text-4xl font-bold leading-tight'),
      p('Boards, docs and a shared calendar that stay out of the way. Set it up on Monday, forget the tool on Tuesday.', 'text-lg text-slate-600'),
      row('gap-3 flex-wrap', [btn('Try it free', 'bg-indigo-600 text-white hover:bg-indigo-500'), btn('Talk to us', 'border border-slate-300 text-slate-700 hover:bg-slate-50')]),
    ]),
    col('flex-1 w-full rounded-2xl bg-gradient-to-br from-slate-100 to-indigo-100 p-8 gap-3 shadow-lg', [
      row('items-center gap-3 bg-white rounded-lg p-3 shadow-sm', [p('☑', 'text-indigo-600'), p('Write the launch plan', 'text-sm font-medium')]),
      row('items-center gap-3 bg-white rounded-lg p-3 shadow-sm', [p('☑', 'text-indigo-600'), p('Review the pricing page', 'text-sm font-medium')]),
      row('items-center gap-3 bg-white rounded-lg p-3 shadow-sm', [p('☐', 'text-slate-400'), p('Invite the first ten users', 'text-sm font-medium')]),
    ]),
  ]),
], { semantic: 'section' });

const feature = (icon, title, text) => col('flex-1 gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm', [
  p(icon, 'text-3xl'), h(3, title, 'text-xl font-semibold text-slate-900'), p(text, 'text-slate-600'),
]);
const features = () => col('w-full px-6 py-20 bg-slate-50', [
  col('max-w-6xl mx-auto w-full gap-10', [
    col('items-center text-center gap-3', [h(2, 'Built for how teams really work', 'text-3xl font-bold text-slate-900'), p('Three ideas, done well.', 'text-slate-600')]),
    row('gap-6 flex-col md:flex-row', [
      feature('🗂️', 'Boards that fit', 'Columns, cards and filters you can set up in a minute and change whenever the work does.'),
      feature('📝', 'Docs next to tasks', 'Write the plan where the work happens. Link a page to a card and keep both in sync.'),
      feature('📅', 'One shared calendar', 'Deadlines, launches and days off in a single view everybody can read.'),
    ]),
  ]),
], { semantic: 'section', anchor: 'features' });

const tier = (name, price, note, items, highlight) => col(`flex-1 gap-4 rounded-2xl p-8 ${highlight ? 'bg-indigo-600 text-white shadow-xl md:scale-105' : 'bg-white border border-slate-200 text-slate-900'}`, [
  h(3, name, 'text-lg font-semibold'),
  row('items-end gap-1', [p(price, 'text-4xl font-bold'), p(note, `text-sm ${highlight ? 'text-indigo-100' : 'text-slate-500'}`)]),
  col('gap-2', items.map((i) => p(`✓ ${i}`, `text-sm ${highlight ? 'text-indigo-50' : 'text-slate-600'}`))),
  btn('Choose ' + name, highlight ? 'bg-white text-indigo-700 hover:bg-indigo-50' : 'bg-indigo-600 text-white hover:bg-indigo-500'),
]);
const pricing = () => col('w-full px-6 py-20 bg-white', [
  col('max-w-5xl mx-auto w-full gap-10', [
    col('items-center text-center gap-3', [h(2, 'Simple pricing', 'text-3xl font-bold text-slate-900'), p('Start free. Pay when the team grows.', 'text-slate-600')]),
    row('gap-6 flex-col md:flex-row md:items-center', [
      tier('Free', '$0', '/ month', ['Up to 3 members', '2 boards', 'Community support'], false),
      tier('Team', '$12', '/ user / month', ['Unlimited boards', 'Docs and calendar', 'Priority support'], true),
      tier('Scale', '$29', '/ user / month', ['Single sign-on', 'Audit log', 'Dedicated contact'], false),
    ]),
  ]),
], { semantic: 'section', anchor: 'pricing' });

const cta = () => col('w-full items-center text-center gap-5 px-6 py-16 bg-slate-900 text-white', [
  h(2, 'Ready when you are', 'text-3xl font-bold'),
  p('Join the teams that stopped managing the tool and went back to the work.', 'text-slate-300 max-w-xl'),
  btn('Create your workspace', 'bg-indigo-500 text-white hover:bg-indigo-400'),
], { semantic: 'section' });

const quote = (text, who, role) => col('flex-1 gap-4 rounded-xl bg-white border border-slate-200 p-6', [
  p('“' + text + '”', 'text-slate-700 italic'), col('gap-0', [p(who, 'text-sm font-semibold text-slate-900'), p(role, 'text-xs text-slate-500')]),
]);
const testimonials = () => col('w-full px-6 py-20 bg-slate-50', [
  col('max-w-6xl mx-auto w-full gap-10', [
    h(2, 'What teams say', 'text-3xl font-bold text-slate-900 text-center'),
    row('gap-6 flex-col md:flex-row', [
      quote('We dropped three tools the week we moved over.', 'Marta R.', 'Operations, Bluefin'),
      quote('Setup took an afternoon. Nobody asked for training.', 'James K.', 'Founder, Plot & Co'),
      quote('Finally a calendar the whole company actually reads.', 'Aiko T.', 'Head of Design, Mizu'),
    ]),
  ]),
], { semantic: 'section' });

const faqItem = (q, a) => col('gap-1 border-b border-slate-200 py-4', [h(3, q, 'text-lg font-semibold text-slate-900'), p(a, 'text-slate-600')]);
const faq = () => col('w-full px-6 py-20 bg-white', [
  col('max-w-3xl mx-auto w-full gap-6', [
    h(2, 'Questions, answered', 'text-3xl font-bold text-slate-900 text-center'),
    faqItem('Can I try it before paying?', 'Yes. The Free plan has no time limit and needs no card.'),
    faqItem('Can I bring my data with me?', 'You can import a CSV of tasks and export everything at any time.'),
    faqItem('What happens if we outgrow a plan?', 'You are moved up at the next billing date, never in the middle of a project.'),
  ]),
], { semantic: 'section' });

const stat = (value, label) => col('flex-1 items-center text-center gap-1', [p(value, 'text-4xl font-bold text-indigo-600'), p(label, 'text-sm text-slate-600')]);
const stats = () => col('w-full px-6 py-14 bg-white border-y border-slate-200', [
  row('max-w-5xl mx-auto w-full gap-8 flex-col md:flex-row', [stat('12k+', 'teams'), stat('4.9/5', 'average rating'), stat('99.98%', 'uptime'), stat('< 1 min', 'to get started')]),
], { semantic: 'section' });

const footerCol = (title, links) => col('gap-2', [p(title, 'text-sm font-semibold text-white'), ...links.map((l) => p(l, 'text-sm text-slate-400'))]);
const footer = () => col('w-full px-6 py-12 bg-slate-900', [
  row('max-w-6xl mx-auto w-full gap-10 flex-col md:flex-row justify-between', [
    col('gap-2 max-w-xs', [p('Northlight', 'text-lg font-bold text-white'), p('Calm project management for small teams.', 'text-sm text-slate-400')]),
    row('gap-12', [footerCol('Product', ['Features', 'Pricing', 'Changelog']), footerCol('Company', ['About', 'Careers', 'Contact'])]),
  ]),
  p('© Northlight. A demo site made with Whoobe.', 'text-xs text-slate-500 max-w-6xl mx-auto w-full pt-8'),
], { semantic: 'footer' });

const navbar = () => row('w-full items-center justify-between px-6 py-4 bg-white border-b border-slate-200', [
  p('Northlight', 'text-xl font-bold text-indigo-600'),
  row('items-center gap-6', [p('Features', 'text-sm text-slate-600'), p('Pricing', 'text-sm text-slate-600'), p('About', 'text-sm text-slate-600'), btn('Sign in', 'bg-indigo-600 text-white hover:bg-indigo-500 !py-2 !px-4 text-sm')]),
], { semantic: 'nav' });

const announcement = () => row('w-full items-center justify-center gap-3 px-4 py-2 bg-indigo-600 text-white text-sm', [
  p('🎉 Version 2.0 is out —', 'text-sm'), p('see what is new', 'text-sm underline'),
]);

// ---------- kits ----------
const template = (name, category, description, section) => ({
  id: nextId('tpl'), blocks_id: nextId('cmp'), name, description, category, tags: [],
  json: { build: { purgeCSS: null, images: null, fonts: null, plugins: null }, blocks: wrapDoc(section) },
  html: null, image: '', enabled: true, premium: false, stars: 0, favorite: false,
});

const kits = {
  'landing-basics': {
    name: 'Landing basics', slug: 'landing-basics', version: '1', category: 'Landing',
    description: 'The sections of a product landing page: two heroes, features, pricing and a call to action.',
    templates: [
      template('Hero centered', 'Hero', 'A gradient hero with two buttons.', heroCentered()),
      template('Hero with a card', 'Hero', 'Text on the left, a task card on the right.', heroSplit()),
      template('Features, three columns', 'Features', 'Three cards under a title.', features()),
      template('Pricing, three tiers', 'Pricing', 'Free, Team and Scale, the middle one highlighted.', pricing()),
      template('Call to action banner', 'Call to action', 'A dark band with one button.', cta()),
    ],
  },
  'page-sections': {
    name: 'Page sections', slug: 'page-sections', version: '1', category: 'Sections',
    description: 'Sections for the rest of a page: testimonials, questions, numbers and a footer.',
    templates: [
      template('Testimonials', 'Social proof', 'Three quotes side by side.', testimonials()),
      template('Questions and answers', 'FAQ', 'A short list of questions.', faq()),
      template('Numbers', 'Social proof', 'Four figures in a row.', stats()),
      template('Footer with columns', 'Footer', 'Brand, two link columns and a note.', footer()),
    ],
  },
};

fs.mkdirSync(path.join(root, 'packages/core/seed-data/kits'), { recursive: true });
for (const [file, kit] of Object.entries(kits)) {
  fs.writeFileSync(path.join(root, 'packages/core/seed-data/kits', `${file}.json`), JSON.stringify(kit, null, 2) + '\n');
}

// ---------- demo website ----------
const page = (title, slug, category, sections) => ({
  title, slug, category, kind: 'content',
  content: (() => { const doc = new Element().Flexbox({ direction: 'col' }).setIcon('dashboard').setTag('document'); doc.id = nextId('demo'); doc.blocks = sections; return doc; })(),
});
const aboutBody = col('w-full px-6 py-20 bg-white', [
  col('max-w-3xl mx-auto w-full gap-5', [
    h(1, 'About Northlight', 'text-4xl font-bold text-slate-900'),
    p('Northlight is a made-up product. This site is a demo, built with Whoobe in a few minutes from the sections of two kits.', 'text-lg text-slate-600'),
    p('Open the page editor to move things around, try the Kits panel on the left, or insert a section with its Insert button. Everything you change here disappears at the next reset.', 'text-slate-600'),
  ]),
], { semantic: 'section' });

const content = {
  website: { name: 'Northlight (demo)', rootPath: '/northlight', defaultLocale: 'en', supportedLocales: ['en'] },
  pages: [
    page('Home', '/', 'Landing', [announcement(), navbar(), heroCentered(), features(), testimonials(), cta(), footer()]),
    page('Pricing', '/pricing', 'Landing', [navbar(), pricing(), faq(), cta(), footer()]),
    page('About', '/about', 'Company', [navbar(), aboutBody, footer()]),
  ],
  snippets: [
    { name: 'Navigation bar', category: 'navigation', icon: '🧭', node: navbar(), notes: 'Brand on the left, three links and a button.' },
    { name: 'Announcement bar', category: 'navigation', icon: '📣', node: announcement(), notes: 'A thin band above the navigation.' },
    { name: 'Footer', category: 'footer', icon: '🦶', node: footer(), notes: 'The footer used by the demo pages.' },
  ],
};
fs.writeFileSync(path.join(here, 'content.json'), JSON.stringify(content, null, 2) + '\n');

console.log('kits:', Object.values(kits).map((k) => `${k.slug} (${k.templates.length})`).join(', '));
console.log('pages:', content.pages.map((x) => x.title).join(', '), '| snippets:', content.snippets.map((s) => s.name).join(', '));

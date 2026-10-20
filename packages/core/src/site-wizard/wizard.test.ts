import { describe, expect, it } from 'vitest';
import { validateSiteSpec } from '@whoobe-cms/schema';
import { expandSiteSpec, parseWebsiteBundle, SiteSpecError } from '../portability/index.js';
import { BLOCK_INFO, BLOCK_TYPES, buildSite, COPY, listSlots, paletteFor, PRESET_NAMES, PRESET_LABELS, SECTORS, SECTOR_LABELS, snippetBlockType, suggestedStructure, WIZARD_LIMITS, wizardOptions, WizardError, wizardToSiteSpec, type WizardAnswersInput } from './index.js';

const nodes = (n: any): any[] => [n, ...(n.blocks ?? []).flatMap(nodes)];
const THEMES: WizardAnswersInput['theme'][] = [...PRESET_NAMES.map((preset) => ({ preset })), { background: '#323932' }, { background: '#F5E6C8' }, { background: '#808080' }];

const base = (over: Partial<WizardAnswersInput> = {}): WizardAnswersInput => ({
  name: 'Seaview', sector: 'tourism', context: 'hotel', theme: { preset: 'dark' }, font: 'sans',
  pages: [
    { title: 'Home', blocks: [{ type: 'hero' }, { type: 'box-grid-3' }, { type: 'banner' }, { type: 'box-grid-6' }, { type: 'cta' }] },
    { title: 'Contact', blocks: [{ type: 'hero' }, { type: 'form' }] },
  ],
  ...over,
});
const expanded = (answers: WizardAnswersInput, existing?: Parameters<typeof expandSiteSpec>[1]) => expandSiteSpec(wizardToSiteSpec(answers), existing).bundle;

describe('wizardToSiteSpec: the structure', () => {
  it('is valid for every sector with the structure the wizard proposes, and imports as a bundle', () => {
    for (const sector of SECTORS) {
      const spec = wizardToSiteSpec(base({ sector, pages: suggestedStructure(sector) }));
      expect(validateSiteSpec(spec).ok, sector).toBe(true);
      const bundle = expandSiteSpec(spec).bundle;
      expect('bundle' in parseWebsiteBundle(JSON.parse(JSON.stringify(bundle))), sector).toBe(true);
      expect(bundle.pages.map((p) => p.slug)[0]).toBe('/');
      expect(bundle.pages.length).toBe(4);
    }
  });

  it('gives the header and the footer from the pages, as the layout of the site', () => {
    const spec = wizardToSiteSpec(base({ headerButton: true }));
    expect(spec.layout).toEqual({ header: 'header', footer: 'footer' });
    const header = spec.snippets!.find((s) => s.key === 'header')!;
    const links = nodes({ blocks: [header.node] }).length && JSON.stringify(header.node);
    for (const t of ['Seaview', 'Home', 'Contact']) expect(links).toContain(`"${t}"`);
    expect(links).toContain('Book your stay');
    expect(JSON.stringify(spec.snippets!.find((s) => s.key === 'footer')!.node)).toContain('Travel well, stay well.');
    expect(JSON.stringify(wizardToSiteSpec(base()).snippets![0].node)).not.toContain('Book your stay');
  });

  it('makes slugs from titles: the landing page is "/", a repeated title gets a number, an odd one a safe slug', () => {
    const spec = wizardToSiteSpec(base({ pages: [{ title: 'Home', blocks: [] }, { title: 'About us', blocks: [] }, { title: 'About us', blocks: [] }, { title: '¿Qué? ***', blocks: [] }] }));
    expect(spec.pages.map((p) => p.slug)).toEqual(['/', '/about-us', '/about-us-2', '/qu']);
    expect(wizardToSiteSpec(base({ pages: [{ title: '***', blocks: [] }, { title: '!!!', blocks: [] }] })).pages[1].slug).toBe('/page');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(wizardToSiteSpec(base()))).toBe(JSON.stringify(wizardToSiteSpec(base())));
  });

  it('uses the colours of the palette and no others', () => {
    for (const theme of THEMES) {
      const { palette } = paletteFor(theme);
      const allowed = new Set(Object.values(palette).map((c) => c.toUpperCase()));
      const used = new Set((JSON.stringify(wizardToSiteSpec(base({ theme }))).match(/\[#[0-9A-Fa-f]{6}\]/g) ?? []).map((c) => c.slice(1, -1).toUpperCase()));
      expect([...used].filter((c) => !allowed.has(c))).toEqual([]);
      expect(used.size).toBeGreaterThan(4);
    }
  });

  it('puts the font family on every block, and nothing is requested from a font service', () => {
    for (const [font, cls] of [['sans', 'font-sans'], ['serif', 'font-serif']] as const) {
      const spec = wizardToSiteSpec(base({ font }));
      for (const s of [...spec.snippets!.filter((x) => x.node), ...spec.pages.flatMap((p) => p.sections.map((node) => ({ node })))]) expect(JSON.stringify(s.node), font).toContain(cls);
      expect(spec.theme!.fonts).toEqual([]);
      expect(JSON.stringify(spec)).not.toMatch(/fonts\.googleapis|https?:\/\//);
    }
  });
});

describe('wizardToSiteSpec: the matrix', () => {
  const structures: WizardAnswersInput['pages'][] = [
    [{ title: 'Home', blocks: [] }],
    [
      { title: 'Home', blocks: BLOCK_TYPES.map((type) => ({ type })) },
      { title: 'About', blocks: [{ type: 'banner' }, { type: 'box-grid-3' }] },
      { title: 'Services', blocks: [{ type: 'hero' }, { type: 'box-grid-6' }, { type: 'cta' }] },
      { title: 'Contact', blocks: [{ type: 'hero' }, { type: 'form' }] },
    ],
  ];

  it('every sector x theme x font x structure validates, expands and imports as a bundle, and reads well', () => {
    let count = 0;
    for (const sector of SECTORS) for (const theme of THEMES) for (const font of ['sans', 'serif'] as const) for (const pages of structures) {
      const label = `${sector} / ${JSON.stringify(theme)} / ${font} / ${pages.length} pages`;
      const bundle = expandSiteSpec(wizardToSiteSpec({ name: 'Acme', sector, theme, font, pages, headerButton: true, context: sector === 'tourism' ? 'hotel' : undefined })).bundle;
      expect('bundle' in parseWebsiteBundle(JSON.parse(JSON.stringify(bundle))), label).toBe(true);
      const all = [...bundle.snippets.map((s) => s.node), ...bundle.pages.map((p) => p.content)].flatMap(nodes);
      // every page has exactly one heading of the first level
      for (const p of bundle.pages) expect(nodes(p.content).filter((n) => n.element === 'h' && n.level === 1).length, `${label}: h1 of ${p.slug}`).toBe(1);
      // the classes a person edits are in `css.css` (where the Custom CSS box and the controls of the editor look); `css.container` holds only the structure
      expect(all.filter((n) => n.type === 'container' && !/^flex( flex-(row|col))?$/.test(n.css.container)).map((n) => n.css.container), `${label}: css.container`).toEqual([]);
      // every image says what it shows, every link has text and a target
      expect(all.filter((n) => n.element === 'img' && !String(n.image?.alt ?? '').trim()), label).toEqual([]);
      expect(all.filter((n) => n.element === 'a' && (!String(n.content).trim() || !n.link)), label).toEqual([]);
      // no template placeholder is left in a text
      expect(JSON.stringify(all.map((n) => n.content)), label).not.toMatch(/\{thing\}|\{name\}|undefined|\[object/);
      count++;
    }
    expect(count).toBe(SECTORS.length * THEMES.length * 2 * structures.length);
  });
});

describe('wizardToSiteSpec: pages and blocks', () => {
  const h = (answers: WizardAnswersInput, page: number) => nodes(expanded(answers).pages[page].content).filter((n) => n.element === 'h');

  it('adds the title of the page as its h1 when the structure has no hero', () => {
    const levels = h(base({ pages: [{ title: 'Home', blocks: [{ type: 'hero' }] }, { title: 'Prices', blocks: [{ type: 'box-grid-3' }] }] }), 1);
    expect(levels.filter((n) => n.level === 1).map((n) => n.content)).toEqual(['Prices']);
  });

  it('a second hero on a page does not make a second h1', () => {
    const levels = h(base({ pages: [{ title: 'Home', blocks: [{ type: 'hero' }, { type: 'hero' }] }] }), 0);
    expect(levels.filter((n) => n.level === 1)).toHaveLength(1);
  });

  it('a hero on an inner page takes the page title; on the landing page the headline of the sector', () => {
    const b = expanded(base());
    expect(nodes(b.pages[1].content).find((n) => n.element === 'h' && n.level === 1).content).toBe('Contact');
    expect(nodes(b.pages[0].content).find((n) => n.element === 'h' && n.level === 1).content).toBe(COPY.tourism.hero.title);
  });

  it('an inner page hero has its title and a plain line, and no buttons that lead back to the same page', () => {
    const contact = nodes(expanded(base()).pages[1].content);
    expect(contact.filter((n) => n.element === 'a' && n.css.css.includes('rounded-lg'))).toEqual([]);
    expect(JSON.stringify(contact.map((n) => n.content))).not.toContain('Welcome to our hotel');
    // the landing page keeps its two buttons
    expect(nodes(expanded(base()).pages[0].content).filter((n) => n.element === 'a' && n.css.css.includes('rounded-lg')).length).toBeGreaterThanOrEqual(3);
  });

  it('points the contact buttons at the first form, else at the last page, else at the home page', () => {
    const hrefs = (answers: WizardAnswersInput) => nodes(expanded(answers).pages[0].content).filter((n) => n.element === 'a').map((n) => n.link);
    expect(hrefs(base())).toContain('/seaview/contact#contact');
    const noForm = base({ pages: [{ title: 'Home', blocks: [{ type: 'hero' }, { type: 'cta' }] }, { title: 'Contact', blocks: [{ type: 'hero' }] }] });
    expect(hrefs(noForm)).toContain('/seaview/contact');
    const single = base({ pages: [{ title: 'Home', blocks: [{ type: 'hero' }, { type: 'cta' }] }] });
    expect(new Set(hrefs(single))).toEqual(new Set(['/seaview']));
  });

  it('gives the anchor "contact" to the first form of the site only', () => {
    const b = expanded(base({ pages: [{ title: 'Home', blocks: [{ type: 'form' }, { type: 'form' }] }] }));
    expect(nodes(b.pages[0].content).filter((n) => n.anchor === 'contact')).toHaveLength(1);
    expect(nodes(b.pages[0].content).filter((n) => n.element === 'form')).toHaveLength(2);
  });

  it('draws the form block as a disconnected contact form: name, email, message, and nothing that sends', () => {
    const form = nodes(expanded(base()).pages[1].content).find((n) => n.element === 'form');
    expect(nodes(form).filter((n) => n.element === 'input' || n.element === 'textarea').map((n) => n.data.attributes.name)).toEqual(['name', 'email', 'message']);
    expect(form.formConfig.enabled).toBe(false);
    expect(form.formConfig.targetClassId).toBe('');
    expect(form.formConfig.notify.enabled).toBe(false);
    expect(form.data.attributes.action).toBe('');
  });

  it('puts a snippet of the library in a position, once per name, and a hero snippet carries the heading of the page', () => {
    const answers = base({ pages: [
      { title: 'Home', blocks: [{ snippet: 'My hero', category: 'hero' }, { type: 'box-grid-3' }, { snippet: 'My CTA', category: 'cta' }] },
      { title: 'More', blocks: [{ snippet: 'My CTA', category: 'cta' }] },
    ] });
    const spec = wizardToSiteSpec(answers);
    expect(spec.snippets!.filter((s) => s.use).map((s) => [s.key, s.use])).toEqual([['lib1', 'My hero'], ['lib2', 'My CTA']]);
    expect(spec.pages[0].sections.map((s) => (s.kind === 'snippet' ? `snippet:${s.use}` : s.kind))).toEqual(['snippet:lib1', 'container', 'snippet:lib2']);
    // no band was added on the page that has a hero snippet, and one was added on the page that has only a CTA
    expect(spec.pages[0].sections).toHaveLength(3);
    expect(spec.pages[1].sections).toHaveLength(2);
    const existing = { themes: {}, snippets: { 'My hero': { id: '11111111-1111-4111-8111-111111111111', node: { id: 'h', type: 'container', blocks: [] } }, 'My CTA': { id: '22222222-2222-4222-8222-222222222222', node: { id: 'c', type: 'container', blocks: [] } } } };
    const b = expandSiteSpec(spec, { existing }).bundle;
    expect(nodes(b.pages[0].content).filter((n) => n.sourceSnippetId).map((n) => n.sourceSnippetId)).toEqual(['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']);
    expect(() => expandSiteSpec(spec)).toThrowError(SiteSpecError);
  });

  it('stays inside the limits of a specification with the largest structure the wizard accepts', () => {
    const blocks = Array.from({ length: 10 }, () => ({ type: 'box-grid-6' as const }));
    const spec = wizardToSiteSpec(base({ pages: [1, 2, 3, 4].map((i) => ({ title: `Page ${i}`, blocks })) }));
    expect(validateSiteSpec(spec).ok).toBe(true);
    const worst = Math.max(...expandSiteSpec(spec).bundle.pages.map((p) => nodes(p.content).length));
    expect(worst).toBeLessThan(300);
  });
});

describe('the texts', () => {
  it('lists every slot with its label, its length and its default, and the defaults fit', () => {
    const slots = listSlots(base());
    expect(slots.length).toBeGreaterThan(30);
    expect(new Set(slots.map((s) => s.key)).size).toBe(slots.length);
    expect(slots.find((s) => s.key === 'p0.b0.title')).toMatchObject({ label: 'Heading', default: COPY.tourism.hero.title });
    for (const s of slots) { expect(s.default.length, s.key).toBeLessThanOrEqual(s.max); expect(s.default.trim(), s.key).not.toBe(''); }
  });

  it('writes the market context into the copy, or the default noun of the sector', () => {
    expect(JSON.stringify(wizardToSiteSpec(base({ context: 'boutique hotel' })))).toContain('our boutique hotel');
    expect(JSON.stringify(wizardToSiteSpec(base({ context: undefined })))).toContain('our hotel');
    expect(JSON.stringify(wizardToSiteSpec(base({ sector: 'food', context: undefined })))).toContain('our restaurant');
  });

  it('cleans what is typed as the context: no markup, no braces, a few words', () => {
    const json = JSON.stringify(wizardToSiteSpec(base({ context: '<script>alert(1)</script> {thing} hotel ' + 'x'.repeat(60) })));
    expect(json).not.toMatch(/<script|\{thing\}/);
    expect(json).not.toContain('x'.repeat(41));
    expect(() => wizardToSiteSpec(base({ context: 'x'.repeat(121) }))).toThrowError(WizardError);
  });

  it('takes other words for the slots, and changes nothing else: the structure is identical', () => {
    const answers = base();
    const slots = listSlots(answers);
    const words = Object.fromEntries(slots.map((s) => [s.key, `Words for ${s.key}`.slice(0, s.max)]));
    const plain = wizardToSiteSpec(answers);
    const written = wizardToSiteSpec(answers, { texts: words });
    expect(JSON.stringify(written)).not.toBe(JSON.stringify(plain));
    // the same specification with every text field emptied
    const skeleton = (spec: unknown) => JSON.stringify(spec, (k, v) => (['text', 'html', 'alt', 'label', 'submitLabel'].includes(k) && typeof v === 'string' ? '' : v));
    expect(skeleton(written)).toBe(skeleton(plain));
    expect(JSON.stringify(written)).toContain('Words for p0.b0.title');
  });

  it('cuts a text to its slot and strips markup from it, and ignores a key that is not a slot', () => {
    const spec = wizardToSiteSpec(base(), { texts: { 'p0.b0.title': '<img src=x onerror=alert(1)>' + 'A'.repeat(500), 'p9.b9.title': 'nothing', 'layout.evil': 'x' } });
    const json = JSON.stringify(spec);
    expect(json).not.toMatch(/<img|onerror=alert\(1\)>/);
    expect(json).not.toContain('nothing');
    const title = (spec.pages[0].sections[0] as any).children[0].children[0].children[0].children[0].text as string;
    expect(title.length).toBeLessThanOrEqual(120);
    expect(validateSiteSpec(spec).ok).toBe(true);
  });

  it('keeps the default for an empty text', () => {
    expect(JSON.stringify(wizardToSiteSpec(base(), { texts: { 'p0.b0.title': '   ' } }))).toContain(COPY.tourism.hero.title);
  });

  it('writes in English only without texts of its own: another language needs them', () => {
    expect(() => wizardToSiteSpec(base({ language: 'it' }))).toThrowError(WizardError);
    const spec = wizardToSiteSpec(base({ language: 'it' }), { texts: { 'p0.b0.title': 'Benvenuti' } });
    expect(spec.website.defaultLocale).toBe('it');
    expect(spec.website.supportedLocales).toEqual(['it']);
  });
});

describe('the answers', () => {
  const issues = (answers: unknown): string => { try { buildSite(answers); return ''; } catch (e) { return JSON.stringify((e as WizardError).issues); } };

  it('are a strict schema: an unknown key, a sector or a block that does not exist, too many pages or blocks, a bad colour', () => {
    expect(issues({ ...base(), extra: 1 })).toContain('Unrecognized key');
    expect(issues({ ...base(), sector: 'mining' })).toContain('sector');
    expect(issues({ ...base(), pages: [{ title: 'Home', blocks: [{ type: 'carousel' }] }] })).toContain('pages.0.blocks.0');
    expect(issues({ ...base(), pages: [1, 2, 3, 4, 5].map((i) => ({ title: `P${i}`, blocks: [] })) })).toContain('pages');
    expect(issues({ ...base(), pages: [{ title: 'Home', blocks: Array.from({ length: 11 }, () => ({ type: 'hero' })) }] })).toContain('pages.0.blocks');
    expect(issues({ ...base(), theme: { background: 'red' } })).toContain('theme');
    expect(issues({ ...base(), theme: { preset: 'dark', background: '#000000' } })).toContain('theme');
    expect(issues({ ...base(), accent: 'blue' })).toContain('accent');
    expect(issues({ ...base(), name: '<b>x</b>' })).toContain('name');
    expect(issues({ ...base(), name: '' })).toContain('name');
    expect(issues({ ...base(), pages: [] })).toContain('pages');
    expect(issues({ ...base(), pages: [{ title: 'Home', blocks: [{ type: 'hero', snippet: 'x' }] }] })).toContain('pages.0.blocks.0');
  });

  it('are refused as a WizardError that lists the problems, and never throw anything else', () => {
    for (const v of [null, undefined, 3, 'x', [], {}]) expect(() => buildSite(v)).toThrowError(WizardError);
  });

  it('say when the accent was corrected to stay visible', () => {
    expect(buildSite(base({ theme: { preset: 'dark' }, accent: '#101010' })).notes).toHaveLength(1);
    expect(buildSite(base({ theme: { preset: 'dark' }, accent: '#FF6B6B' })).notes).toEqual([]);
    expect(buildSite(base({ theme: { background: '#808080' }, accent: '#808080' })).notes).toHaveLength(1);
  });
});

describe('the options of the wizard', () => {
  it('list every sector with the structure it proposes, every block, every theme and font, and the limits the answers schema enforces', () => {
    const o = wizardOptions();
    expect(o.sectors.map((s) => s.id)).toEqual([...SECTORS]);
    expect(o.blocks.map((b) => b.type)).toEqual([...BLOCK_TYPES]);
    expect(o.themes.map((x) => x.id)).toEqual([...PRESET_NAMES]);
    expect(o.fonts.map((f) => f.id)).toEqual(['sans', 'serif']);
    for (const s of o.sectors) {
      expect(s.label).toBe(SECTOR_LABELS[s.id as keyof typeof SECTOR_LABELS]);
      expect(s.suggested.length).toBeLessThanOrEqual(WIZARD_LIMITS.maxPages);
      // the structure a sector proposes is accepted by the wizard as it is
      expect(() => wizardToSiteSpec({ name: 'X', sector: s.id, theme: { preset: 'dark' }, pages: s.suggested })).not.toThrow();
    }
    for (const b of o.blocks) expect(b.description.length).toBeGreaterThan(10);
    for (const t of o.themes) expect(t.label).toBe(PRESET_LABELS[t.id]);
    expect(o.blocks.find((b) => b.type === 'form')!.description).toContain('not connected');
    expect(Object.keys(BLOCK_INFO)).toEqual([...BLOCK_TYPES]);
    expect(o.texts).toEqual({ placeholderLanguages: ['en'], ai: { available: false } });
    // the limits shown are the limits enforced
    expect(() => wizardToSiteSpec(base({ pages: Array.from({ length: WIZARD_LIMITS.maxPages + 1 }, (_, i) => ({ title: `P${i}`, blocks: [] })) }))).toThrowError(WizardError);
    expect(() => wizardToSiteSpec(base({ pages: [{ title: 'Home', blocks: Array.from({ length: WIZARD_LIMITS.maxBlocksPerPage + 1 }, () => ({ type: 'hero' as const })) }] }))).toThrowError(WizardError);
    expect(() => wizardToSiteSpec(base({ name: 'x'.repeat(WIZARD_LIMITS.maxNameLength + 1) }))).toThrowError(WizardError);
  });

  it('says which block a snippet of the library can stand for, by its category', () => {
    for (const [category, block] of [['Hero', 'hero'], ['hero', 'hero'], ['call to action', 'cta'], ['Call-To-Action', 'cta'], ['CTA', 'cta'], ['Box grid 3', 'box-grid-3'], ['box_grid_6', 'box-grid-6'], ['Contact form', 'form'], ['banner', 'banner']] as const) {
      expect(snippetBlockType(category), category).toBe(block);
    }
    for (const none of ['navigation', 'footer', '', null, undefined, 'heroes']) expect(snippetBlockType(none as any), String(none)).toBeNull();
  });
});

// Turns the answers of the template wizard into a site specification (docs/plans/ai/template-wizard.md). Pure and deterministic: the same answers (and
// the same texts) give the same specification. The result goes through the same validation, expansion, check and import as a specification written by a model.
import { validateSiteSpec, type SiteSpec, type SiteSpecIssue, type SpecNode } from '@whoobe-cms/schema';
import { wizardAnswersSchema, type WizardAnswers } from './answers.js';
import { BLOCKS, footerNode, headerNode, type BlockContext, type NavLink } from './blocks.js';
import { COPY, cleanContext, type BlockType } from './copy.js';
import { SECTOR_LABELS } from './options.js';
import { paletteFor, type Palette } from './themes.js';
import { TextSource, type Slot } from './text-source.js';

export class WizardError extends Error {
  constructor(message: string, readonly issues: { path: string; message: string }[] = []) { super(message); }
}

export interface WizardOptions {
  /** Other words for the slots (by key): what the AI writes. The structure of the site does not depend on them. */
  texts?: Record<string, string>;
  /** Library snippets (by name) whose content has a heading of the first level: a position that uses one carries the h1 of its page, whatever its kind of block. */
  snippetHeadings?: Record<string, boolean>;
  /** The palettes made by a person, by id: what a theme `{ palette }` of the answers points to. */
  palettes?: Record<string, Palette>;
}

/** Does a node of the editor (a snippet's content) hold a heading of the first level? */
export function nodeHasH1(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const n = node as { element?: unknown; level?: unknown; blocks?: unknown };
  if (n.element === 'h1' || (n.element === 'h' && n.level === 1)) return true;
  return Array.isArray(n.blocks) && n.blocks.some(nodeHasH1);
}

export interface WizardResult {
  spec: SiteSpec;
  /** every text of the site, by key, with its default and its length: the slots a model may fill */
  slots: Slot[];
  /** what was adjusted to keep the result readable, in words */
  notes: string[];
  /** The words that the placeholders of a library snippet get in this site (`{name}`, `{context}`/`{thing}`, `{sector}`). */
  vars: { name: string; context: string; thing: string; sector: string };
}

const slugify = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '') || 'page';

function pageSlugs(titles: string[]): string[] {
  const used = new Set<string>(['/']);
  return titles.map((title, i) => {
    if (i === 0) return '/';
    const base = `/${slugify(title)}`;
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    return slug;
  });
}

export function buildSite(input: unknown, options: WizardOptions = {}): WizardResult {
  const parsed = wizardAnswersSchema.safeParse(input);
  if (!parsed.success) throw new WizardError('The answers are not valid', parsed.error.issues.map((i) => ({ path: i.path.join('.') || '(answers)', message: i.message })));
  const a: WizardAnswers = parsed.data;
  if (a.language !== 'en' && !options.texts) throw new WizardError('Placeholder texts exist only in English for now: choose English, or write the texts with the AI.');

  const copy = COPY[a.sector];
  const vars = { thing: cleanContext(a.context) || copy.thing, name: a.name };
  let derived;
  try { derived = paletteFor(a.theme, a.accent, options.palettes); }
  catch (e) { throw new WizardError('The palette of the theme does not exist (it may have been deleted): choose another', [{ path: 'theme', message: e instanceof Error ? e.message : 'unknown palette' }]); }
  const { palette: pal, notes } = derived;
  const text = new TextSource(options.texts);

  const slugs = pageSlugs(a.pages.map((p) => p.title));
  const nav: NavLink[] = a.pages.map((p, i) => ({ title: p.title, href: slugs[i] }));
  // where the "contact" buttons lead: the first form of the site, else the last page, else the home page
  const formAt = a.pages.findIndex((p) => p.blocks.some((b) => 'type' in b && b.type === 'form'));
  const contactHref = formAt >= 0 ? `${slugs[formAt]}#contact` : a.pages.length > 1 ? slugs[a.pages.length - 1] : '/';
  const secondHref = a.pages.length > 1 ? slugs[1] : '/';

  let contactAnchorUsed = false;
  const ctxFor = (at: string, pageTitle: string, landing: boolean, claimH1: () => boolean): BlockContext => ({
    pal, font: a.font, t: text.t, copy, vars, at, pageTitle, landing, contactHref, secondHref, claimH1,
    claimContactAnchor: () => (contactAnchorUsed ? false : (contactAnchorUsed = true)),
  });

  // snippets of the library that the answers use (one entry each, however many places)
  const libKeys = new Map<string, string>();
  const libKey = (name: string): string => {
    let k = libKeys.get(name);
    if (!k) { k = `lib${libKeys.size + 1}`; libKeys.set(name, k); }
    return k;
  };

  const pages = a.pages.map((page, pi) => {
    let h1Taken = false;
    const claimH1 = () => (h1Taken ? false : (h1Taken = true));
    // nothing is added to a page that the person did not ask for: a page with neither a hero (a snippet standing for one is taken to carry the
    // heading too) nor a page title simply has no heading of the first level, and the wizard says so
    const snippetCarriesH1 = (b: { snippet: string; category: string }) => b.category === 'hero' || options.snippetHeadings?.[b.snippet] === true;
    const hasHeading = page.blocks.some((b) => ('type' in b && (b.type === 'hero' || b.type === 'title')) || ('snippet' in b && snippetCarriesH1(b)));
    if (!hasHeading) notes.push(`The page "${page.title}" has no hero and no page title, so it has no heading of the first level (bad for search engines): add one of them.`);
    const sections: SpecNode[] = [];
    // a page needs at least one section: an empty one gets the page title
    if (page.blocks.length === 0) sections.push(BLOCKS.title(ctxFor(`p${pi}.title`, page.title, pi === 0, claimH1)));
    page.blocks.forEach((b, bi) => {
      if ('snippet' in b) {
        if (snippetCarriesH1(b)) claimH1();
        sections.push({ kind: 'snippet', use: libKey(b.snippet) });
        return;
      }
      sections.push(BLOCKS[b.type](ctxFor(`p${pi}.b${bi}`, page.title, pi === 0, claimH1)));
    });
    return { slug: slugs[pi], title: page.title, description: `${page.title} - ${a.name}`.slice(0, 400), sections };
  });

  const layoutCtx = ctxFor('layout', '', true, () => false);
  const header = headerNode(layoutCtx, nav, a.headerButton);
  const footer = footerNode(layoutCtx, nav);

  const spec: SiteSpec = {
    version: 1,
    website: { name: a.name, defaultLocale: a.language, supportedLocales: [a.language] },
    theme: { name: `${a.name} theme`, colors: [{ name: 'background', hex: pal.bg }, { name: 'text', hex: pal.text }, { name: 'accent', hex: pal.accent }], fonts: [] },
    snippets: [
      { key: 'header', name: `${a.name} header`, category: 'navigation', node: header },
      { key: 'footer', name: `${a.name} footer`, category: 'footer', node: footer },
      ...[...libKeys].map(([name, key]) => ({ key, use: name })),
    ],
    layout: { header: 'header', footer: 'footer' },
    pages,
  };

  // The wizard never hands on a specification that the validator would refuse: if it does, that is a defect of a block, not of the answers.
  const checked = validateSiteSpec(spec);
  if (!checked.ok) {
    const issues = checked.issues as SiteSpecIssue[];
    throw new Error(`The wizard produced an invalid specification (a defect): ${issues.slice(0, 3).map((i) => `${i.where}: ${i.message}`).join('; ')}`);
  }
  return { spec, slots: text.slots, notes, vars: { name: a.name, context: vars.thing, thing: vars.thing, sector: SECTOR_LABELS[a.sector] ?? a.sector } };
}

export const wizardToSiteSpec = (answers: unknown, options: WizardOptions = {}): SiteSpec => buildSite(answers, options).spec;

/** The slots (every text of the site) of some answers: what a model would be asked to write. */
export const listSlots = (answers: unknown): Slot[] => buildSite(answers).slots;

/** A starting point for the answers of a sector: the pages and blocks the wizard proposes. */
export function suggestedStructure(sector: keyof typeof COPY): { title: string; blocks: { type: BlockType }[] }[] {
  const s = COPY[sector].suggested;
  return [{ title: 'Home', blocks: s.landing.map((type) => ({ type })) }, ...s.pages.map((p) => ({ title: p.title, blocks: p.blocks.map((type) => ({ type })) }))];
}

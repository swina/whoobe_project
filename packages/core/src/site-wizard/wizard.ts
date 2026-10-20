// Turns the answers of the template wizard into a site specification (docs/plans/ai/template-wizard.md). Pure and deterministic: the same answers (and
// the same texts) give the same specification. The result goes through the same validation, expansion, check and import as a specification written by a model.
import { validateSiteSpec, type SiteSpec, type SiteSpecIssue, type SpecNode } from '@whoobe-cms/schema';
import { wizardAnswersSchema, type WizardAnswers } from './answers.js';
import { BLOCKS, footerNode, headerNode, titleBand, type BlockContext, type NavLink } from './blocks.js';
import { COPY, cleanContext, type BlockType } from './copy.js';
import { paletteFor } from './themes.js';
import { TextSource, type Slot } from './text-source.js';

export class WizardError extends Error {
  constructor(message: string, readonly issues: { path: string; message: string }[] = []) { super(message); }
}

export interface WizardOptions {
  /** Other words for the slots (by key): what the AI writes. The structure of the site does not depend on them. */
  texts?: Record<string, string>;
}

export interface WizardResult {
  spec: SiteSpec;
  /** every text of the site, by key, with its default and its length: the slots a model may fill */
  slots: Slot[];
  /** what was adjusted to keep the result readable, in words */
  notes: string[];
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
  const { palette: pal, notes } = paletteFor(a.theme, a.accent);
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
    // a snippet standing for a hero is taken to carry the heading of the page
    const hasHero = page.blocks.some((b) => ('type' in b && b.type === 'hero') || ('snippet' in b && b.category === 'hero'));
    const sections: SpecNode[] = [];
    if (!hasHero) sections.push(titleBand(ctxFor(`p${pi}.title`, page.title, pi === 0, claimH1)));
    page.blocks.forEach((b, bi) => {
      if ('snippet' in b) {
        if (b.category === 'hero') claimH1();
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
  return { spec, slots: text.slots, notes };
}

export const wizardToSiteSpec = (answers: unknown, options: WizardOptions = {}): SiteSpec => buildSite(answers, options).spec;

/** The slots (every text of the site) of some answers: what a model would be asked to write. */
export const listSlots = (answers: unknown): Slot[] => buildSite(answers).slots;

/** A starting point for the answers of a sector: the pages and blocks the wizard proposes. */
export function suggestedStructure(sector: keyof typeof COPY): { title: string; blocks: { type: BlockType }[] }[] {
  const s = COPY[sector].suggested;
  return [{ title: 'Home', blocks: s.landing.map((type) => ({ type })) }, ...s.pages.map((p) => ({ title: p.title, blocks: p.blocks.map((type) => ({ type })) }))];
}

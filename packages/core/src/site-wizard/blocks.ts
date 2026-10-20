// The blocks of the template wizard: each is a function from the palette, the font and the words to one element of a site specification. Fixed templates, no
// model: the same inputs give the same block. A block draws only in the roles of the palette (bg, bgAlt, card, text, muted, border, accent, onAccent).
import type { SpecFormField, SpecNode } from '@whoobe-cms/schema';
import type { SectorCopy } from './copy.js';
import { FORM_FIELDS, fill } from './copy.js';
import type { Palette } from './themes.js';

export type Font = 'sans' | 'serif';

export interface BlockContext {
  pal: Palette;
  font: Font;
  t: (key: string, label: string, def: string, max: number) => string;
  copy: SectorCopy;
  vars: { thing: string; name: string };
  /** `p0.b2`: the page and the position of the block, the prefix of its slots */
  at: string;
  pageTitle: string;
  landing: boolean;
  contactHref: string;
  secondHref: string;
  /** called by a block that draws the page's h1; true the first time on a page */
  claimH1: () => boolean;
  /** called by the form block; true for the first form of the site (it gets the anchor "contact") */
  claimContactAnchor: () => boolean;
}

const fontClass = (f: Font) => (f === 'serif' ? 'font-serif' : 'font-sans');
const bg = (c: string) => `bg-[${c}]`;
const fg = (c: string) => `text-[${c}]`;
const bd = (c: string) => `border-[${c}]`;

const inner = (ctx: BlockContext, children: SpecNode[], extra = ''): SpecNode => ({ kind: 'container', direction: 'col', css: `max-w-5xl mx-auto w-full gap-6 ${extra}`.trim(), children });

function section(ctx: BlockContext, surface: 'bg' | 'bgAlt', children: SpecNode[], pad = 'py-16', extra = ''): SpecNode {
  return { kind: 'container', semantic: 'section', css: `w-full px-6 ${pad} ${fontClass(ctx.font)} ${bg(ctx.pal[surface])} ${fg(ctx.pal.text)} ${extra}`.trim(), children: [inner(ctx, children)] };
}

const button = (ctx: BlockContext, text: string, href: string, kind: 'primary' | 'outline' = 'primary'): SpecNode => ({
  kind: 'link', text, href,
  css: kind === 'primary'
    ? `inline-block px-6 py-3 rounded-lg font-semibold text-sm ${bg(ctx.pal.accent)} ${fg(ctx.pal.onAccent)}`
    : `inline-block px-6 py-3 rounded-lg font-semibold text-sm border ${bd(ctx.pal.border)} ${fg(ctx.pal.text)}`,
});

const heading = (ctx: BlockContext, level: 1 | 2 | 3, text: string, size: string): SpecNode => ({ kind: 'heading', level, text, css: `${size} font-bold leading-tight ${fg(ctx.pal.text)}` });
const lead = (ctx: BlockContext, text: string, size = 'text-lg'): SpecNode => ({ kind: 'text', html: text, css: `${size} leading-relaxed ${fg(ctx.pal.muted)}` });

function card(ctx: BlockContext, title: string, text: string): SpecNode {
  return {
    kind: 'container', direction: 'col', css: `flex-1 gap-2 p-6 rounded-xl border ${bg(ctx.pal.card)} ${bd(ctx.pal.border)}`,
    children: [heading(ctx, 3, title, 'text-lg'), lead(ctx, text, 'text-base')],
  };
}

function grid(ctx: BlockContext, key: 'grid3' | 'grid6'): SpecNode {
  const g = ctx.copy[key];
  const title = ctx.t(`${ctx.at}.title`, 'Section title', fill(g.title, { ...ctx.vars }), 120);
  const items = (g.items as { title: string; text: string }[]).map((it, i) => card(ctx, ctx.t(`${ctx.at}.item${i + 1}.title`, `Box ${i + 1} title`, fill(it.title, ctx.vars), 80), ctx.t(`${ctx.at}.item${i + 1}.text`, `Box ${i + 1} text`, fill(it.text, ctx.vars), 240)));
  const row = (cards: SpecNode[]): SpecNode => ({ kind: 'container', direction: 'col', css: 'gap-6 md:flex-row', children: cards });
  const rows = key === 'grid3' ? [row(items)] : [row(items.slice(0, 3)), row(items.slice(3))];
  return section(ctx, key === 'grid3' ? 'bg' : 'bgAlt', [heading(ctx, 2, title, 'text-3xl'), ...rows]);
}

export const BLOCKS: Record<string, (ctx: BlockContext) => SpecNode> = {
  hero(ctx) {
    const h = ctx.copy.hero;
    const title = ctx.landing
      ? ctx.t(`${ctx.at}.title`, 'Heading', fill(h.title, ctx.vars), 120)
      : ctx.t(`${ctx.at}.title`, 'Heading', ctx.pageTitle, 120);
    const text = ctx.t(`${ctx.at}.lead`, 'Lead text', fill(h.lead, ctx.vars), 300);
    const buttons: SpecNode[] = [button(ctx, ctx.t(`${ctx.at}.primary`, 'First button', fill(h.primary, ctx.vars), 40), ctx.contactHref)];
    if (ctx.landing) buttons.push(button(ctx, ctx.t(`${ctx.at}.secondary`, 'Second button', fill(h.secondary, ctx.vars), 40), ctx.secondHref, 'outline'));
    const h1 = ctx.claimH1();
    return section(ctx, 'bg', [{
      kind: 'container', direction: 'col', css: 'gap-10 md:flex-row md:items-center',
      children: [
        { kind: 'container', direction: 'col', css: 'flex-1 gap-5', children: [heading(ctx, h1 ? 1 : 2, title, 'text-4xl md:text-5xl'), lead(ctx, text), { kind: 'container', direction: 'row', css: 'flex-wrap gap-3 pt-2', children: buttons }] },
        { kind: 'container', direction: 'col', css: 'flex-1', children: [{ kind: 'image', alt: ctx.t(`${ctx.at}.imageAlt`, 'Picture description', h.imageAlt, 160), css: 'w-full h-auto rounded-2xl' }] },
      ],
    }], 'py-20');
  },

  banner(ctx) {
    const b = ctx.copy.banner;
    return {
      kind: 'container', semantic: 'section', css: `w-full px-6 py-4 ${fontClass(ctx.font)} ${bg(ctx.pal.bgAlt)} ${fg(ctx.pal.text)}`,
      children: [{
        kind: 'container', direction: 'row', css: 'max-w-5xl mx-auto w-full flex-wrap items-center justify-center gap-3 text-center',
        children: [
          { kind: 'text', html: ctx.t(`${ctx.at}.message`, 'Message', fill(b.message, ctx.vars), 160), css: `text-sm ${fg(ctx.pal.text)}` },
          { kind: 'link', text: ctx.t(`${ctx.at}.link`, 'Link text', fill(b.link, ctx.vars), 40), href: ctx.contactHref, css: `text-sm font-semibold underline underline-offset-4 ${fg(ctx.pal.text)}` },
        ],
      }],
    };
  },

  cta(ctx) {
    const c = ctx.copy.cta;
    return section(ctx, 'bg', [{
      kind: 'container', direction: 'col', css: `items-center gap-4 p-10 text-center rounded-2xl border ${bg(ctx.pal.card)} ${bd(ctx.pal.border)}`,
      children: [
        heading(ctx, 2, ctx.t(`${ctx.at}.title`, 'Heading', fill(c.title, ctx.vars), 120), 'text-3xl'),
        lead(ctx, ctx.t(`${ctx.at}.line`, 'Line', fill(c.line, ctx.vars), 200)),
        button(ctx, ctx.t(`${ctx.at}.button`, 'Button', fill(c.button, ctx.vars), 40), ctx.contactHref),
      ],
    }], 'py-12');
  },

  'box-grid-3': (ctx) => grid(ctx, 'grid3'),
  'box-grid-6': (ctx) => grid(ctx, 'grid6'),

  form(ctx) {
    const f = ctx.copy.form;
    const field = `w-full rounded-lg border px-3 py-2 text-base ${bg(ctx.pal.card)} ${bd(ctx.pal.border)} ${fg(ctx.pal.text)}`;
    const fields: SpecFormField[] = FORM_FIELDS.map((x) => ({ ...x, label: ctx.t(`${ctx.at}.field.${x.name}`, `Label of ${x.name}`, x.label, 60) }));
    const anchor = ctx.claimContactAnchor();
    const node = section(ctx, 'bgAlt', [
      heading(ctx, 2, ctx.t(`${ctx.at}.title`, 'Heading', fill(f.title, ctx.vars), 120), 'text-3xl'),
      lead(ctx, ctx.t(`${ctx.at}.lead`, 'Lead text', fill(f.lead, ctx.vars), 200)),
      {
        kind: 'form', fields, submitLabel: ctx.t(`${ctx.at}.submit`, 'Button', fill(f.submit, ctx.vars), 40),
        css: 'max-w-xl w-full', fieldCss: field, labelCss: `text-sm font-medium ${fg(ctx.pal.text)}`,
        buttonCss: `self-start px-6 py-3 rounded-lg font-semibold text-sm ${bg(ctx.pal.accent)} ${fg(ctx.pal.onAccent)}`,
      },
    ]);
    return anchor && node.kind === 'container' ? { ...node, anchor: 'contact' } : node;
  },
};

/** The title of a page that has no hero: a plain band with the page's h1, so that every page has one heading of the first level. */
export function titleBand(ctx: BlockContext): SpecNode {
  ctx.claimH1();
  return section(ctx, 'bgAlt', [heading(ctx, 1, ctx.pageTitle, 'text-4xl')], 'py-12');
}

export interface NavLink { title: string; href: string }

export function headerNode(ctx: BlockContext, links: NavLink[], withButton: boolean): SpecNode {
  const nav: SpecNode[] = links.map((l) => ({ kind: 'link', text: l.title, href: l.href, css: `text-sm ${fg(ctx.pal.muted)}` }));
  return {
    kind: 'container', semantic: 'header', direction: 'row', css: `w-full flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4 border-b ${fontClass(ctx.font)} ${bg(ctx.pal.bg)} ${bd(ctx.pal.border)}`,
    children: [
      { kind: 'link', text: ctx.vars.name, href: '/', css: `text-xl font-bold ${fg(ctx.pal.text)}` },
      { kind: 'container', direction: 'row', css: 'flex-wrap items-center gap-5', children: [
        ...nav,
        ...(withButton ? [button(ctx, ctx.t('header.button', 'Header button', ctx.copy.headerButton, 30), ctx.contactHref)] : []),
      ] },
    ],
  };
}

export function footerNode(ctx: BlockContext, links: NavLink[]): SpecNode {
  return {
    kind: 'container', semantic: 'footer', direction: 'col', css: `w-full gap-4 px-6 py-10 border-t ${fontClass(ctx.font)} ${bg(ctx.pal.bgAlt)} ${bd(ctx.pal.border)}`,
    children: [
      { kind: 'container', direction: 'col', css: 'max-w-5xl mx-auto w-full gap-4', children: [
        { kind: 'text', html: `<strong>${ctx.vars.name.replace(/[<>&]/g, '')}</strong>`, css: `text-lg ${fg(ctx.pal.text)}` },
        { kind: 'container', direction: 'row', css: 'flex-wrap gap-5', children: links.map((l) => ({ kind: 'link' as const, text: l.title, href: l.href, css: `text-sm ${fg(ctx.pal.muted)}` })) },
        { kind: 'text', html: ctx.t('footer.line', 'Footer line', ctx.copy.footerLine, 120), css: `text-sm ${fg(ctx.pal.muted)}` },
      ] },
    ],
  };
}

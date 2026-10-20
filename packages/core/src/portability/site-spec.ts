// Expands a site specification (docs/plans/ai/ai-site-spec.md, schema in @whoobe-cms/schema) into a website bundle, which the existing
// importer (import.ts) reads. Pure: no database, no clock, no randomness. The same spec always gives the same bundle, so the dry run and
// the import describe the same result. What the person or the model never writes - ids, the document root, the defaults of an editor
// element, the template that places the header and the footer - is added here.
import { createHash } from 'node:crypto';
import { sanitizeRichText, validateSiteSpec, type SiteSpec, type SiteSpecIssue, type SpecFormField, type SpecNode } from '@whoobe-cms/schema';
import type { BundlePage, BundleSnippet, BundleTemplate, BundleTheme, WebsiteBundle } from './bundle.js';

/** What already exists here, for the specs that point to a theme or a snippet by name (the caller reads it from the database). */
export interface SiteSpecExisting {
  themes: Record<string, { id: string }>;
  snippets: Record<string, { id: string; node: unknown }>;
}

export class SiteSpecError extends Error {
  constructor(readonly issues: SiteSpecIssue[]) {
    super(issues.map((i) => `${i.where}: ${i.message}`).join('; '));
  }
}

export interface ExpandOptions {
  existing?: SiteSpecExisting;
  /** Written into `exportedAt`; the bundle is otherwise independent of the clock. */
  now?: string;
}

/** A UUID derived from a label, so that the references inside the bundle (layout -> snippet) survive the id rewrite of the importer. */
function uuid(label: string): string {
  const h = createHash('sha1').update(`whoobe-site-spec:${label}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The root path a spec's website gets: the one it names, or one made from its name. */
export function siteSpecRootPath(spec: { website: { name: string; rootPath?: string } }): string {
  return spec.website.rootPath ?? `/${slugOf(spec.website.name)}`;
}

const slugOf = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';

/** Placeholder picture, the same pattern the in-product generator uses (picsum, seeded by the node id); a person chooses the real one. */
const placeholder = (id: string): string => `https://picsum.photos/seed/${id}/1200/800`;

interface Ctx { rootPath: string; next: () => string }

/** A full editor element: the fields ElementsClass.js gives every element, then the ones of its kind. */
function base(id: string, over: Record<string, unknown>): Record<string, unknown> {
  return {
    id, blocks: [], css: { css: '', container: '' }, tailwind: {}, font: '', style: '', content: '', description: '', categories: [], alpine: {},
    events: { display: null, hide: null, mouseenter: null, mouseleave: null, click: null, focus: null, blur: null, keydown: null },
    data: {}, gsap: { animation: null, ease: null, duration: 0, delay: 0 }, link: '', anchor: '', image: { url: null },
    type: 'element', tag: 'element', editable: false, icon: 'highlight_alt', helper: null, dialog: null, dataBinding: null, name: '', element: 'div',
    ...over,
  };
}

/** A link to a page of this site carries the website's root path, like every link of a Whoobe website; the publisher takes it off. */
function target(href: string, rootPath: string): string {
  if (href.startsWith('/') && !href.startsWith('//')) return href === '/' ? rootPath : rootPath + href;
  return href;
}

function expandNode(node: SpecNode, ctx: Ctx): Record<string, unknown> {
  const id = ctx.next();
  switch (node.kind) {
    case 'container':
      return base(id, {
        type: 'container', tag: 'flex', element: 'div',
        // like the editor's own Flexbox(): `container` holds the structure (flex, its direction), `css` the classes a person edits (the Custom CSS box and every
        // control of the Advanced panel read and write `css.css`, and the classes of `container` would win over what they add)
        css: { css: node.css ?? '', container: ['flex', node.direction ? `flex-${node.direction}` : ''].filter(Boolean).join(' ') },
        ...(node.semantic ? { semantic: node.semantic } : {}),
        ...(node.anchor ? { anchor: node.anchor } : {}),
        blocks: node.children.map((c) => expandNode(c, ctx)),
      });
    case 'heading':
      return base(id, { element: 'h', level: node.level, content: node.text, icon: 'title', editable: true, helper: 'blocks/helpers/Heading.vue', dialog: 'md:w-40', css: { css: node.css ?? '', container: '' } });
    case 'text':
      return base(id, { element: 'p', label: 'Rich Text', icon: 'subject', content: sanitizeRichText(node.html), editable: true, css: { css: node.css ?? '', container: '' } });
    case 'link': {
      const external = /^https?:\/\//i.test(node.href);
      return base(id, {
        element: 'a', label: 'Span', icon: 'text_format', content: node.text, editable: true, link: target(node.href, ctx.rootPath),
        css: { css: node.css ?? '', container: '' }, ...(external ? { linkTarget: '_blank' } : {}),
      });
    }
    case 'image':
      return base(id, { element: 'img', label: 'Image', icon: 'insert_photo', css: { css: node.css ?? 'w-full h-auto', container: '' }, image: { url: placeholder(id), alt: node.alt } });
    case 'form': {
      // The Form element of the editor with its own inputs, exactly as the editor builds them (ElementsClass.js Form/inputElement/InputSubmit), created
      // disconnected: formConfig.enabled is false and there is no target, no redirect, no notification, no action. A developer connects it later.
      const control = (field: SpecFormField, formId: string, inputId: string): Record<string, unknown> => {
        const css = { css: node.fieldCss ?? '', container: '' };
        if (field.type === 'textarea') {
          return base(ctx.next(), { element: 'textarea', tag: 'input', type: 'textarea', placeholder: '', css, data: { attributes: { name: field.name, id: inputId, placeholder: '', ...(field.required ? { required: true } : {}) } } });
        }
        const type = field.type === 'phone' ? 'tel' : field.type;
        return base(ctx.next(), { element: 'input', tag: 'input', type, placeholder: '', value: '', content: '', icon: 'input', css, data: { attributes: { name: field.name, id: inputId, placeholder: '', required: field.required === true, type } } });
      };
      const fields = node.fields.map((field) => {
        const inputId = `${id}-${field.name}`;
        return base(ctx.next(), {
          type: 'container', tag: 'flex', element: 'div', css: { css: 'gap-1', container: 'flex flex-col' },
          blocks: [
            base(ctx.next(), { element: 'label', icon: 'label', content: field.label, editable: true, css: { css: node.labelCss ?? '', container: '' }, data: { attributes: { for: inputId } } }),
            control(field, id, inputId),
          ],
        });
      });
      const submit = base(ctx.next(), {
        element: 'button', tag: 'submit', type: 'button', value: node.submitLabel, content: node.submitLabel, buttonIcon: '', buttonIconPosition: 'before', buttonIconWidth: 16, buttonIconHeight: 16,
        editable: true, css: { css: node.buttonCss ?? '', container: '' }, data: { attributes: { type: 'submit' } },
      });
      return base(id, {
        type: 'container', tag: 'form', element: 'form', semantic: 'form', css: { css: ['gap-4', node.css ?? ''].filter(Boolean).join(' '), container: 'flex flex-col' },
        data: { attributes: { name: 'form', id: `form-${id}`, action: '', method: 'post' } },
        formConfig: { enabled: false, targetClassId: '', successMessage: '', errorMessage: '', successRedirectUrl: '', errorRedirectUrl: '', notify: { enabled: false, mailTemplateId: '', templatePageId: '', recipientEmail: '', subject: '' } },
        blocks: [...fields, submit],
      });
    }
    case 'snippet':
      throw new Error('a snippet reference is expanded by the page, not as an element');
  }
}

/** A copy of a node tree with new ids, like dropping a snippet in the editor. */
function withFreshIds(value: unknown, next: () => string): unknown {
  if (Array.isArray(value)) return value.map((v) => withFreshIds(v, next));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = k === 'id' && typeof v === 'string' ? next() : withFreshIds(v, next);
    return out;
  }
  return value;
}

export interface ExpandResult {
  bundle: WebsiteBundle;
  /** Themes and snippets the spec points to by name, for the check step of the dashboard. */
  references: { themes: string[]; snippets: string[] };
}

/**
 * Validates a spec and expands it. Throws `SiteSpecError` (with the issues, each with its place) when the file is not valid, or when
 * it points to a theme or snippet that does not exist here.
 */
export function expandSiteSpec(input: unknown, options: ExpandOptions = {}): ExpandResult {
  const checked = validateSiteSpec(input);
  if (!checked.ok) throw new SiteSpecError(checked.issues);
  const spec: SiteSpec = checked.spec;
  const existing = options.existing ?? { themes: {}, snippets: {} };
  const missing: SiteSpecIssue[] = [];

  const rootPath = siteSpecRootPath(spec);
  let counter = 0;
  const ctx: Ctx = { rootPath, next: () => `ss-${(++counter).toString(36).padStart(4, '0')}` };

  // theme
  const themes: BundleTheme[] = [];
  let themeId: string | null = null;
  const referencedThemes: string[] = [];
  if (spec.theme?.use !== undefined) {
    referencedThemes.push(spec.theme.use);
    const found = existing.themes[spec.theme.use];
    if (found) themeId = found.id;
    else missing.push({ path: 'theme.use', where: '"theme"', message: `no theme named "${spec.theme.use}" exists here` });
  } else if (spec.theme?.name !== undefined) {
    themeId = uuid(`theme:${spec.theme.name}`);
    themes.push({ id: themeId, name: spec.theme.name, colors: spec.theme.colors ?? [], fonts: spec.theme.fonts ?? [], styles: '', tailwindClasses: '' });
  }

  // snippets: the ones the file defines go into the bundle; the ones it points to are looked up here
  const snippets: BundleSnippet[] = [];
  const byKey = new Map<string, { id: string; node: unknown }>();
  const referencedSnippets: string[] = [];
  (spec.snippets ?? []).forEach((s, i) => {
    if (s.use !== undefined) {
      referencedSnippets.push(s.use);
      const found = existing.snippets[s.use];
      if (found) byKey.set(s.key, found);
      else missing.push({ path: `snippets[${i}].use`, where: `snippet "${s.use}"`, message: `no snippet named "${s.use}" exists here` });
      return;
    }
    const node = expandNode(s.node!, ctx);
    const id = uuid(`snippet:${s.key}`);
    byKey.set(s.key, { id, node });
    snippets.push({ id, name: s.name!, category: s.category!, icon: null, node, themeId, notes: null, thumbnail: null, locked: false });
  });
  if (missing.length) throw new SiteSpecError(missing);

  // pages: the same slug in two locales is one page in two languages (one translation group)
  const pages: BundlePage[] = spec.pages.map((p) => {
    const locale = p.locale ?? spec.website.defaultLocale;
    const root = base(ctx.next(), {
      type: 'container', tag: 'document', icon: 'dashboard', element: 'div', css: { css: '', container: 'flex flex-col' },
      blocks: p.sections.map((section) => {
        if (section.kind !== 'snippet') return expandNode(section, ctx);
        const lib = byKey.get(section.use)!;
        const copy = withFreshIds(lib.node, ctx.next) as Record<string, unknown>;
        copy.sourceSnippetId = lib.id;
        return copy;
      }),
    });
    return {
      id: null, translationGroupId: uuid(`group:${p.slug}`), locale, slug: p.slug, title: p.title, category: p.category ?? '', kind: 'content',
      published: false, workflowState: null, content: root,
      seo: { metaTitle: p.title, metaDescription: p.description ?? '', canonicalUrl: null, robots: { index: true, follow: true }, ogTitle: p.title, ogDescription: p.description ?? '', ogImage: null },
      sitemap: null, search: null, pimcoreId: null, path: null, themeId,
    };
  });

  // the template that places the layout snippets around every page
  const websiteTemplates: BundleTemplate[] = [];
  const layout = spec.layout ?? {};
  const place = (k: string | undefined, className: string) => (k ? { pageIds: [], snippetIds: [byKey.get(k)!.id], className } : undefined);
  const slots = {
    header: place(layout.header, 'w-full'), aside: place(layout.aside, ''), footer: place(layout.footer, 'w-full'), notFound404: place(layout.notFound404, 'w-full'),
  };
  if (Object.values(slots).some(Boolean)) {
    websiteTemplates.push({
      id: null, name: 'Site layout', description: 'Created from a site specification.', isDefault: true, pathPatterns: [], locale: null,
      layout: { ...Object.fromEntries(Object.entries(slots).filter(([, v]) => v)), main: { pageIds: [] }, body: { pageIds: [] } },
    });
  }

  const bundle: WebsiteBundle = {
    version: 2,
    exportedAt: options.now ?? '',
    website: {
      id: null, name: spec.website.name, rootPath, domains: [], defaultLocale: spec.website.defaultLocale, supportedLocales: spec.website.supportedLocales,
      settings: spec.website.description ? { description: spec.website.description } : {}, themeId,
    },
    themes, pages, websiteTemplates, websitePaths: [], snippets, dataComponents: [], dataClasses: [], dataObjects: [], assets: [],
  };
  return { bundle, references: { themes: referencedThemes, snippets: referencedSnippets } };
}

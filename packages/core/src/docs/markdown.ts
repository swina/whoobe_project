// Markdown -> HTML for documentation pages (docs/plans/docs-sites/docs-site-plan.md section 4). Pure: no I/O.
//
// The HTML is safe BY CONSTRUCTION, not by sanitising the whole output afterwards (sanitizeRichText drops the `id`
// attributes the heading anchors need): this renderer is the only producer of tags and attributes, every value is
// escaped, URLs are checked against a scheme allow-list, and raw HTML written in the Markdown is escaped (inline) or
// passed through sanitizeRichText on its own (a whole block).
import { Marked, type Tokens, type TokenizerAndRendererExtension } from 'marked';
import { sanitizeRichText } from '@whoobe-cms/schema';

export interface Heading { depth: number; text: string; id: string }

export interface RenderContext {
  /** Path of the document being rendered, relative to the source folder ("guide/install.md"). */
  currentPath: string;
  /** Address of the document at that path (relative to the source folder), or null when there is none. */
  docRoute(docPath: string): string | null;
  /** URL of the asset at that path (relative to the source folder), or null when there is none. */
  assetUrl(assetPath: string): string | null;
}

export interface RenderResult {
  html: string;
  headings: Heading[];
  /** Plain text for the search index. */
  text: string;
  warnings: string[];
}

const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const ADMONITIONS = ['note', 'tip', 'info', 'warning', 'danger'] as const;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** "Install & run" -> "install-run". Keeps letters and digits of any script. */
export function slugify(text: string): string {
  const s = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
  return s || 'section';
}

/** Resolves `href` against the folder of `from`; null when it climbs out of the source folder. */
export function resolveRelative(from: string, href: string): string | null {
  const out: string[] = from.split('/').slice(0, -1);
  for (const part of href.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (out.length === 0) return null; out.pop(); } else out.push(part);
  }
  return out.join('/');
}

type Target = { kind: 'external' | 'internal' | 'anchor' | 'blocked' | 'doc' | 'asset' | 'missing'; href: string };

function classify(raw: string, ctx: RenderContext, warnings: string[], what: 'link' | 'image'): Target {
  const href = raw.trim();
  if (href === '') return { kind: 'blocked', href: '#' };
  const probe = href.replace(/[\u0000- ]/g, '');   // "java\nscript:" is still a scheme to a browser
  if (probe.startsWith('//')) { warnings.push(`${what} to "${href}" removed: protocol-relative address`); return { kind: 'blocked', href: '#' }; }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(probe)?.[1]?.toLowerCase();
  if (scheme) {
    if (ALLOWED_SCHEMES.has(scheme) && !(what === 'image' && scheme !== 'https' && scheme !== 'http')) return { kind: 'external', href };
    warnings.push(`${what} to "${href.slice(0, 40)}" removed: the ${scheme}: address is not allowed`);
    return { kind: 'blocked', href: '#' };
  }
  if (href.startsWith('#')) return { kind: 'anchor', href };
  if (href.startsWith('/')) return { kind: 'internal', href };            // an address of the host, left as written
  const hashAt = href.search(/[?#]/);
  const pathPart = hashAt === -1 ? href : href.slice(0, hashAt);
  const tail = hashAt === -1 ? '' : href.slice(hashAt);
  let decoded = pathPart;
  try { decoded = decodeURIComponent(pathPart); } catch { /* keep as written */ }
  const resolved = resolveRelative(ctx.currentPath, decoded);
  if (resolved === null) { warnings.push(`${what} "${href}" points outside the documentation folder`); return { kind: 'missing', href: '#' }; }
  if (what === 'link' && /\.(md|markdown)$/i.test(resolved)) {
    const route = ctx.docRoute(resolved);
    if (route === null) { warnings.push(`link to "${href}": no such document`); return { kind: 'missing', href: '#' }; }
    return { kind: 'doc', href: route + (tail.startsWith('?') ? '' : tail) };
  }
  const url = ctx.assetUrl(resolved);
  if (url === null) { warnings.push(`${what} "${href}": no such file`); return { kind: 'missing', href: what === 'link' ? '#' : '' }; }
  return { kind: 'asset', href: url + tail };
}

/** Plain text of inline/block tokens (for headings and for the search index). */
function plain(tokens: readonly unknown[] | undefined, sep: string): string {
  if (!tokens) return '';
  const parts: string[] = [];
  const walk = (t: any): void => {
    if (!t || typeof t !== 'object') return;
    if (t.type === 'html' || t.type === 'space' || t.type === 'hr' || t.type === 'image') { if (t.type === 'image' && t.text) parts.push(t.text); return; }
    if (t.type === 'br') { parts.push(' '); return; }
    if (t.type === 'codespan' || t.type === 'escape') { parts.push(String(t.text ?? '')); return; }
    if (t.type === 'code') { parts.push(String(t.text ?? '')); parts.push(sep); return; }
    if (Array.isArray(t.items)) { for (const it of t.items) walk(it); return; }
    if (Array.isArray(t.header)) { for (const c of t.header) walk(c); parts.push(sep); }
    if (Array.isArray(t.rows)) { for (const r of t.rows) { for (const c of r) walk(c); parts.push(sep); } return; }
    if (Array.isArray(t.tokens)) { for (const c of t.tokens) walk(c); if (t.type !== 'strong' && t.type !== 'em' && t.type !== 'link' && t.type !== 'del') parts.push(sep); return; }
    if (typeof t.text === 'string') { parts.push(t.text); }
  };
  for (const t of tokens) walk(t);
  return parts.join('').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
}

export interface ImageAttrs { width?: string; align?: 'left' | 'center' | 'right'; float?: 'left' | 'right' }

/** `width=50% align=center` -> validated attributes. Only digits with a unit and three keywords get through: the values are
 *  written into a style attribute and a class, so nothing else may. Problems are returned, the image is still shown. */
export function parseImageAttrs(raw: string): { attrs: ImageAttrs; problems: string[] } {
  const attrs: ImageAttrs = {};
  const problems: string[] = [];
  for (const part of raw.trim().split(/\s+/).filter(Boolean)) {
    const eq = part.indexOf('=');
    const key = (eq < 0 ? part : part.slice(0, eq)).toLowerCase();
    const value = eq < 0 ? '' : part.slice(eq + 1).toLowerCase();
    if (key === 'width') {
      const m = /^(\d{1,4}(?:\.\d{1,2})?)(px|%|rem|em|vw)?$/.exec(value);
      const n = m ? parseFloat(m[1]) : NaN;
      const unit = m?.[2] ?? 'px';
      if (!m || !(n > 0) || ((unit === '%' || unit === 'vw') && n > 100)) problems.push(`image width "${value}" ignored (use 50%, 300px ...)`);
      else attrs.width = `${m[1]}${unit}`;
    } else if (key === 'align') {
      if (value === 'left' || value === 'center' || value === 'right') attrs.align = value; else problems.push(`image align "${value}" ignored (left, center or right)`);
    } else if (key === 'float') {
      if (value === 'left' || value === 'right') attrs.float = value; else problems.push(`image float "${value}" ignored (left or right)`);
    } else {
      problems.push(`image attribute "${part.slice(0, 20)}" ignored`);
    }
  }
  return { attrs, problems };
}

function imageTag(src: string, alt: string, title: string | null | undefined, attrs: ImageAttrs): string {
  const classes = ['doc-img'];
  if (attrs.float) classes.push(`doc-img-float-${attrs.float}`);
  else if (attrs.align) classes.push(`doc-img-${attrs.align}`);
  const style = attrs.width ? ` style="width:${attrs.width}"` : '';
  const t = title ? ` title="${escapeHtml(title)}"` : '';
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${t} loading="lazy" class="${classes.join(' ')}"${style} />`;
}

export function renderMarkdown(markdown: string, ctx: RenderContext): RenderResult {
  const warnings: string[] = [];
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  const uniqueId = (base: string): string => {
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };

  const admonition: TokenizerAndRendererExtension = {
    name: 'admonition',
    level: 'block',
    start: (src: string) => { const i = src.indexOf(':::'); return i < 0 ? undefined : i; },
    tokenizer(src: string) {
      const m = /^:::(note|tip|info|warning|danger)(?:[ \t]+([^\n]*))?\r?\n([\s\S]*?)\r?\n:::[ \t]*(?:\r?\n|$)/.exec(src);
      if (!m) return undefined;
      return { type: 'admonition', raw: m[0], kind: m[1], title: (m[2] ?? '').trim(), tokens: this.lexer.blockTokens(m[3], []) } as any;
    },
    renderer(token: any) {
      const kind = (ADMONITIONS as readonly string[]).includes(token.kind) ? token.kind : 'note';
      const title = token.title || kind.charAt(0).toUpperCase() + kind.slice(1);
      return `<div class="doc-admonition doc-admonition-${kind}"><p class="doc-admonition-title">${escapeHtml(title)}</p>${(this as any).parser.parse(token.tokens)}</div>\n`;
    },
  };

  // ![alt](path "title"){width=50% align=center}
  const imageAttrsExt: TokenizerAndRendererExtension = {
    name: 'imageAttrs',
    level: 'inline',
    start: (src: string) => { const i = src.indexOf('!['); return i < 0 ? undefined : i; },
    tokenizer(src: string) {
      const m = /^!\[((?:[^\[\]\\]|\\.)*)\]\(\s*(<[^>\n]*>|[^\s)]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\)\{([^{}\n]*)\}/.exec(src);
      if (!m) return undefined;
      return { type: 'imageAttrs', raw: m[0], text: m[1], href: m[2].replace(/^<|>$/g, ''), title: m[3] ?? null, attrs: m[4] } as any;
    },
    renderer(token: any) {
      const { attrs, problems } = parseImageAttrs(token.attrs);
      warnings.push(...problems);
      const target = classify(token.href, ctx, warnings, 'image');
      if (target.href === '' || target.kind === 'blocked') return escapeHtml(token.text);
      return imageTag(target.href, token.text, token.title, attrs);
    },
  };

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(this: any, { tokens, depth }: Tokens.Heading) {
        const text = plain(tokens, ' ');
        const id = uniqueId(slugify(text));
        headings.push({ depth, text, id });
        const inner = this.parser.parseInline(tokens);
        return `<h${depth} id="${id}">${inner}<a class="doc-anchor" href="#${id}" aria-label="Link to this section">#</a></h${depth}>\n`;
      },
      link(this: any, { href, title, tokens }: Tokens.Link) {
        const target = classify(href, ctx, warnings, 'link');
        const inner = this.parser.parseInline(tokens);
        const t = title ? ` title="${escapeHtml(title)}"` : '';
        const rel = target.kind === 'external' && /^https?:/i.test(target.href) ? ' rel="noopener noreferrer"' : '';
        // data-doc marks an address INSIDE the documentation site (relative to its root), so a viewer can prefix the site's own
        // path without touching an absolute address the author wrote for the host ("/dam-asset/...", "/pricing")
        const doc = target.kind === 'doc' ? ' data-doc="1"' : '';
        return `<a href="${escapeHtml(target.href)}"${t}${rel}${doc}>${inner}</a>`;
      },
      image({ href, title, text }: Tokens.Image) {
        const target = classify(href, ctx, warnings, 'image');
        if (target.href === '' || target.kind === 'blocked') return escapeHtml(text);
        return imageTag(target.href, text, title, {});
      },
      code({ text, lang }: Tokens.Code) {
        const l = (lang ?? '').trim().split(/\s+/)[0] ?? '';
        const cls = /^[\w+#.-]{1,30}$/.test(l) ? ` class="language-${escapeHtml(l)}"` : '';
        return `<pre class="doc-code"><code${cls}>${escapeHtml(text)}</code></pre>\n`;
      },
      html({ text, block }: Tokens.HTML | Tokens.Tag) {
        // a whole block can be sanitised on its own; an inline fragment ("<b>" alone) cannot, so it is shown as text
        return block ? sanitizeRichText(text) : escapeHtml(text);
      },
    },
    extensions: [admonition, imageAttrsExt],
  });

  const tokens = marked.lexer(markdown);
  const html = marked.parser(tokens);
  return { html, headings, text: plain(tokens, '\n'), warnings };
}

// The index (table of contents) of a documentation site (docs/plans/docs-sites/docs-site-plan.md section 3). Pure: no I/O.
//
// Two sources: the AUTOMATIC index, rebuilt from the tree of Markdown files (folders are sections), and a MANUAL one
// written in `_nav.yml`. Both end as the same NavNode tree; the reading order (previous/next) and the breadcrumbs derive from it.
import { load } from 'js-yaml';
import type { FrontMatter } from './front-matter.js';

export interface DocEntry {
  /** Path relative to the source folder, "guide/01-install.md". */
  path: string;
  frontMatter: FrontMatter;
  /** First level-1 heading of the body, if any (a fallback title). */
  firstHeading?: string;
}

export type NavNode =
  | { type: 'doc'; title: string; path: string; route: string }
  /** A folder. `path`/`route` are set when the folder has its own landing document (index.md / README.md). */
  | { type: 'section'; title: string; items: NavNode[]; path?: string; route?: string }
  | { type: 'link'; title: string; href: string };

export interface NavResult {
  items: NavNode[];
  /** Everything worth telling the author (clashing addresses, entries pointing nowhere ...). */
  warnings: string[];
}

const LANDING = /^(index|readme)\.(md|markdown)$/i;
const MD = /\.(md|markdown)$/i;
const NUMBER_PREFIX = /^\d+[-_.]\s*/;
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** "01-getting_started" -> "Getting started" */
export function humanize(name: string): string {
  const s = name.replace(MD, '').replace(NUMBER_PREFIX, '').replace(/[-_]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : name;
}

export function docTitle(d: DocEntry): string {
  return d.frontMatter.title || d.firstHeading || humanize(d.path.split('/').pop() ?? d.path);
}

/** The address of a document inside the site: numeric prefixes and the extension go, index/README stand for their folder. */
export function docRouteOf(d: Pick<DocEntry, 'path' | 'frontMatter'>): string {
  const parts = d.path.split('/');
  const file = parts.pop() as string;
  const dirs = parts.map((p) => p.replace(NUMBER_PREFIX, '') || p);
  if (LANDING.test(file) && !d.frontMatter.slug) return '/' + dirs.join('/') + (dirs.length ? '/' : '');
  const name = d.frontMatter.slug || file.replace(MD, '').replace(NUMBER_PREFIX, '') || file.replace(MD, '');
  return '/' + [...dirs, name].join('/');
}

function byOrderThenName(a: { order?: number; name: string }, b: { order?: number; name: string }): number {
  const ao = a.order ?? Number.POSITIVE_INFINITY;
  const bo = b.order ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao < bo ? -1 : 1;
  return natural.compare(a.name, b.name);
}

interface FolderBuild { name: string; landing?: DocEntry; docs: DocEntry[]; folders: Map<string, FolderBuild> }

function emptyFolder(name: string): FolderBuild { return { name, docs: [], folders: new Map() }; }

/** Adds a clash warning and returns the documents that own their address (first one wins). */
function checkRoutes(docs: DocEntry[], warnings: string[]): Map<string, string> {
  const owners = new Map<string, string>();
  for (const d of [...docs].sort((a, b) => natural.compare(a.path, b.path))) {
    const r = docRouteOf(d);
    const prev = owners.get(r);
    if (prev) warnings.push(`"${d.path}" has the same address (${r}) as "${prev}"`);
    else owners.set(r, d.path);
  }
  return owners;
}

/** Index rebuilt from the tree of documents. */
export function buildAutoNav(allDocs: DocEntry[]): NavResult {
  const warnings: string[] = [];
  checkRoutes(allDocs, warnings);
  const root = emptyFolder('');
  for (const d of allDocs) {
    if (d.frontMatter.hidden) continue;
    const parts = d.path.split('/');
    const file = parts.pop() as string;
    let node = root;
    for (const p of parts) {
      let next = node.folders.get(p);
      if (!next) { next = emptyFolder(p); node.folders.set(p, next); }
      node = next;
    }
    if (LANDING.test(file) && !node.landing) node.landing = d; else node.docs.push(d);
  }

  const toNodes = (f: FolderBuild): NavNode[] => {
    type Item = { order?: number; name: string; node: NavNode };
    const items: Item[] = [];
    for (const d of f.docs) items.push({ order: d.frontMatter.order, name: d.path.split('/').pop() as string, node: { type: 'doc', title: docTitle(d), path: d.path, route: docRouteOf(d) } });
    for (const sub of f.folders.values()) {
      const children = toNodes(sub);
      if (children.length === 0 && !sub.landing) continue;
      const l = sub.landing;
      items.push({
        order: l?.frontMatter.order,
        name: sub.name,
        node: { type: 'section', title: l ? docTitle(l) : humanize(sub.name), items: children, ...(l ? { path: l.path, route: docRouteOf(l) } : {}) },
      });
    }
    return items.sort(byOrderThenName).map((i) => i.node);
  };

  const items = toNodes(root);
  if (root.landing) items.unshift({ type: 'doc', title: docTitle(root.landing), path: root.landing.path, route: docRouteOf(root.landing) });
  return { items, warnings };
}

/** Parses `_nav.yml`; the problems are returned, never thrown. */
export function parseNavYaml(text: string): { entries: NavEntry[]; errors: string[] } {
  const errors: string[] = [];
  let data: unknown;
  try { data = load(text); } catch (e) { return { entries: [], errors: [`not valid YAML: ${(e as Error).message.split('\n')[0]}`] }; }
  if (data === null || data === undefined) return { entries: [], errors };
  if (!Array.isArray(data)) return { entries: [], errors: ['the index must be a list'] };
  const walk = (list: unknown[], where: string): NavEntry[] => {
    const out: NavEntry[] = [];
    list.forEach((raw, i) => {
      const at = `${where}${i + 1}`;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push(`entry ${at}: expected "doc", "link" or "title" with "items"`); return; }
      const r = raw as Record<string, unknown>;
      const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim() : undefined;
      if (typeof r.doc === 'string' && r.doc.trim()) out.push({ doc: r.doc.trim().replace(/^\/+/, ''), title });
      else if (typeof r.link === 'string' && r.link.trim()) {
        if (!/^https?:\/\//i.test(r.link.trim()) && !r.link.trim().startsWith('/')) { errors.push(`entry ${at}: a link must start with http://, https:// or /`); return; }
        out.push({ link: r.link.trim(), title: title ?? r.link.trim() });
      } else if (Array.isArray(r.items) && title) {
        out.push({ title, doc: typeof r.index === 'string' ? r.index.trim().replace(/^\/+/, '') : undefined, items: walk(r.items, `${at}.`) });
      } else errors.push(`entry ${at}: expected "doc", "link" or "title" with "items"`);
    });
    return out;
  };
  return { entries: walk(data, ''), errors };
}

export interface NavEntry { title?: string; doc?: string; link?: string; items?: NavEntry[] }

/** The manual index applied to the documents that exist; documents it does not mention go in "Other" at the end. */
export function buildManualNav(entries: NavEntry[], allDocs: DocEntry[]): NavResult {
  const warnings: string[] = [];
  checkRoutes(allDocs, warnings);
  const byPath = new Map(allDocs.map((d) => [d.path, d]));
  const listed = new Set<string>();
  const convert = (list: NavEntry[]): NavNode[] => {
    const out: NavNode[] = [];
    for (const e of list) {
      if (e.items) {
        const landing = e.doc ? byPath.get(e.doc) : undefined;
        if (e.doc && !landing) warnings.push(`index entry "${e.doc}" does not exist`);
        if (landing) listed.add(landing.path);
        out.push({ type: 'section', title: e.title as string, items: convert(e.items), ...(landing ? { path: landing.path, route: docRouteOf(landing) } : {}) });
      } else if (e.doc) {
        const d = byPath.get(e.doc);
        if (!d) { warnings.push(`index entry "${e.doc}" does not exist`); continue; }
        listed.add(d.path);
        out.push({ type: 'doc', title: e.title || docTitle(d), path: d.path, route: docRouteOf(d) });
      } else if (e.link) out.push({ type: 'link', title: e.title || e.link, href: e.link });
    }
    return out;
  };
  const items = convert(entries);
  const rest = allDocs.filter((d) => !listed.has(d.path) && !d.frontMatter.hidden);
  if (rest.length) {
    warnings.push(`${rest.length} document(s) are not in the index: ${rest.slice(0, 5).map((d) => d.path).join(', ')}${rest.length > 5 ? ' ...' : ''}`);
    items.push({ type: 'section', title: 'Other', items: rest.sort((a, b) => natural.compare(a.path, b.path)).map((d): NavNode => ({ type: 'doc', title: docTitle(d), path: d.path, route: docRouteOf(d) })) });
  }
  return { items, warnings };
}

/** Pages in reading order (sections' own landing page first). */
export function flattenNav(items: NavNode[]): { title: string; path: string; route: string }[] {
  const out: { title: string; path: string; route: string }[] = [];
  const walk = (list: NavNode[]): void => {
    for (const n of list) {
      if (n.type === 'doc') out.push({ title: n.title, path: n.path, route: n.route });
      else if (n.type === 'section') { if (n.path && n.route) out.push({ title: n.title, path: n.path, route: n.route }); walk(n.items); }
    }
  };
  walk(items);
  return out;
}

export function prevNext(items: NavNode[], path: string): { prev: { title: string; route: string } | null; next: { title: string; route: string } | null } {
  const flat = flattenNav(items);
  const i = flat.findIndex((p) => p.path === path);
  if (i < 0) return { prev: null, next: null };
  const pick = (p: typeof flat[number] | undefined) => (p ? { title: p.title, route: p.route } : null);
  return { prev: pick(flat[i - 1]), next: pick(flat[i + 1]) };
}

/** Section titles leading to a document, e.g. ["Guides", "Install"]. */
export function breadcrumbs(items: NavNode[], path: string): { title: string; route?: string }[] {
  const trail: { title: string; route?: string }[] = [];
  const walk = (list: NavNode[], acc: { title: string; route?: string }[]): boolean => {
    for (const n of list) {
      if (n.type === 'doc' && n.path === path) { trail.push(...acc, { title: n.title, route: n.route }); return true; }
      if (n.type === 'section') {
        const here = { title: n.title, route: n.route };
        if (n.path === path) { trail.push(...acc, here); return true; }
        if (walk(n.items, [...acc, here])) return true;
      }
    }
    return false;
  };
  walk(items, []);
  return trail;
}

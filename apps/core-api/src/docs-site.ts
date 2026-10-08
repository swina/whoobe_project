// Documentation sites (docs/plans/docs-sites/docs-site-plan.md): a website whose `settings.kind` is "docs" is built from
// the Markdown assets of a DAM folder. This module loads that folder, builds the index and renders one page. The Markdown
// work itself (parsing, rendering, index) is the pure code in @whoobe-cms/core/docs; this file only adds the reading of
// the assets (through asset-processor, like the system log viewer) and the choice of which documents may be shown.
import { listAssetsUnderFolder, type AssetRecord, type WebsiteRecord } from '@whoobe-cms/core/server';
import {
  parseDocument, renderMarkdown, buildAutoNav, buildManualNav, parseNavYaml, docRouteOf, docTitle, prevNext, breadcrumbs,
  type DocEntry, type NavNode, type FrontMatter,
} from '@whoobe-cms/core/docs';

export interface DocsConfig {
  sourceFolder: string;
  homeDoc: string | null;
  navFile: string;
  title: string;
}

export class DocsConfigError extends Error {}

const MD = /\.(md|markdown)$/i;

/** The folder must be an absolute DAM path without tricks; null when the website is not a documentation site. */
export function docsConfigOf(website: Pick<WebsiteRecord, 'name' | 'settings'>): DocsConfig | null {
  const settings = (website.settings ?? {}) as Record<string, any>;
  if (settings.kind !== 'docs') return null;
  const d = (settings.docs ?? {}) as Record<string, unknown>;
  const raw = typeof d.sourceFolder === 'string' ? d.sourceFolder.trim() : '';
  const folder = '/' + raw.split('/').filter(Boolean).join('/');
  if (!raw || folder === '/' || raw.split('/').some((p) => p === '..' || p === '.') || /[\u0000-\u001f\\]/.test(raw)) {
    throw new DocsConfigError('The documentation source folder is not set or not valid');
  }
  return {
    sourceFolder: folder,
    homeDoc: typeof d.homeDoc === 'string' && d.homeDoc.trim() ? d.homeDoc.trim().replace(/^\/+/, '') : null,
    navFile: typeof d.navFile === 'string' && /^[\w.-]+\.ya?ml$/i.test(d.navFile.trim()) ? d.navFile.trim() : '_nav.yml',
    title: typeof d.title === 'string' && d.title.trim() ? d.title.trim() : website.name,
  };
}

export interface ContentReader { (asset: AssetRecord): Promise<string | null> }

/** Reads an asset's text from asset-processor with the service token; cached per asset version. */
export function createContentReader(baseUrl: string, serviceToken: string, fetchImpl: typeof fetch = fetch, maxEntries = 500): ContentReader {
  const cache = new Map<string, string>();
  return async (asset) => {
    const key = `${asset.id}:${asset.version}:${new Date(asset.updatedAt as any).getTime()}`;
    const hit = cache.get(key);
    if (hit !== undefined) { cache.delete(key); cache.set(key, hit); return hit; }
    const headers: Record<string, string> = {};
    if (serviceToken) headers.Authorization = `Bearer ${serviceToken}`;
    const res = await fetchImpl(`${baseUrl}/dam-asset/${encodeURIComponent(asset.s3Key)}`, { headers });
    if (!res.ok) return null;
    const text = await res.text();
    cache.set(key, text);
    if (cache.size > maxEntries) cache.delete(cache.keys().next().value as string);
    return text;
  };
}

export interface LoadedDoc { asset: AssetRecord; path: string; entry: DocEntry; body: string; route: string; warnings: string[] }

export interface LoadedDocsSite {
  config: DocsConfig;
  docs: LoadedDoc[];
  nav: NavNode[];
  navSource: 'auto' | 'manual';
  /** The index rebuilt from the tree of files, whichever one is in use (the editor offers it as a starting point). */
  autoNav: NavNode[];
  /** Text of the index file when there is one (the editor shows it). */
  navText: string | null;
  warnings: string[];
  /** Every other file of the folder (images, pdf ...) by path relative to the source folder. */
  files: Map<string, AssetRecord>;
}

const firstH1 = (body: string): string | undefined => /^#[ \t]+(.+?)[ \t#]*$/m.exec(body)?.[1]?.trim();

export async function loadDocsSite(config: DocsConfig, read: ContentReader, opts: { publicOnly: boolean }): Promise<LoadedDocsSite> {
  const prefix = config.sourceFolder + '/';
  const all = (await listAssetsUnderFolder(config.sourceFolder)).filter((a) => a.pimcorePath.startsWith(prefix));
  const visible = opts.publicOnly ? all.filter((a) => a.isPublic) : all;
  const rel = (a: AssetRecord) => a.pimcorePath.slice(prefix.length);

  const files = new Map<string, AssetRecord>();
  const mdAssets: AssetRecord[] = [];
  let navAsset: AssetRecord | undefined;
  // the index file only names documents that are present (the public view lists the public ones), so it is read whatever its own visibility
  navAsset = all.find((a) => rel(a) === config.navFile);
  for (const a of visible) {
    const r = rel(a);
    if (r === config.navFile) continue;
    if (MD.test(r)) mdAssets.push(a);
    else files.set(r, a);
  }

  const warnings: string[] = [];
  const docs: LoadedDoc[] = [];
  for (const asset of mdAssets.sort((a, b) => a.pimcorePath.localeCompare(b.pimcorePath))) {
    const text = await read(asset);
    if (text === null) { warnings.push(`${rel(asset)}: could not be read from storage`); continue; }
    const parsed = parseDocument(text);
    const entry: DocEntry = { path: rel(asset), frontMatter: parsed.frontMatter as FrontMatter, firstHeading: firstH1(parsed.body) };
    docs.push({ asset, path: entry.path, entry, body: parsed.body, route: docRouteOf(entry), warnings: parsed.warnings.map((w) => `${entry.path}: ${w}`) });
  }
  for (const d of docs) warnings.push(...d.warnings);

  const entries = docs.map((d) => d.entry);
  let navSource: 'auto' | 'manual' = 'auto';
  let navText: string | null = null;
  let nav: NavNode[];
  if (navAsset) {
    const text = await read(navAsset);
    navText = text;
    const parsed = text === null ? { entries: [], errors: [`${config.navFile} could not be read`] } : parseNavYaml(text);
    if (parsed.errors.length) {
      warnings.push(...parsed.errors.map((e) => `${config.navFile}: ${e}`), 'the automatic index is used until the index file is fixed');
      const auto = buildAutoNav(entries);
      nav = auto.items; warnings.push(...auto.warnings);
    } else {
      const manual = buildManualNav(parsed.entries, entries);
      nav = manual.items; navSource = 'manual'; warnings.push(...manual.warnings);
    }
  } else {
    const auto = buildAutoNav(entries);
    nav = auto.items; warnings.push(...auto.warnings);
  }
  return { config, docs, nav, navSource, autoNav: buildAutoNav(entries).items, navText, warnings, files };
}

/** Which document an address stands for ("" or "/" = the home page). */
export function findDocByRoute(site: LoadedDocsSite, address: string): LoadedDoc | null {
  const clean = '/' + address.split('/').filter(Boolean).join('/');
  const same = (r: string) => '/' + r.split('/').filter(Boolean).join('/') === clean;
  const hit = site.docs.find((d) => same(d.route));
  if (hit) return hit;
  if (clean === '/') {
    if (site.config.homeDoc) { const h = site.docs.find((d) => d.path === site.config.homeDoc); if (h) return h; }
    const first = site.docs.find((d) => !d.entry.frontMatter.hidden);
    return first ?? null;
  }
  return null;
}

export interface RenderedDocPage {
  title: string;
  description: string | null;
  html: string;
  headings: { depth: number; text: string; id: string }[];
  breadcrumbs: { title: string; route?: string }[];
  prev: { title: string; route: string } | null;
  next: { title: string; route: string } | null;
  route: string;
  path: string;
  updatedAt: string | null;
  warnings: string[];
}

export function renderDocPage(site: LoadedDocsSite, doc: LoadedDoc): RenderedDocPage {
  const byPath = new Map(site.docs.map((d) => [d.path, d]));
  const rendered = renderMarkdown(doc.body, {
    currentPath: doc.path,
    docRoute: (p) => byPath.get(p)?.route ?? null,
    assetUrl: (p) => { const a = site.files.get(p); return a ? `/dam-asset/${a.s3Key.split('/').map(encodeURIComponent).join('/')}` : null; },
  });
  const { prev, next } = prevNext(site.nav, doc.path);
  return {
    title: docTitle(doc.entry),
    description: doc.entry.frontMatter.description ?? null,
    html: rendered.html,
    headings: rendered.headings.filter((h) => h.depth >= 2 && h.depth <= 3),
    breadcrumbs: breadcrumbs(site.nav, doc.path),
    prev, next,
    route: doc.route,
    path: doc.path,
    updatedAt: doc.asset.updatedAt ? new Date(doc.asset.updatedAt as any).toISOString() : null,
    warnings: [...doc.warnings, ...rendered.warnings.map((w) => `${doc.path}: ${w}`)],
  };
}

/** What the dashboard needs to list a site: documents with their titles and visibility, the index and the warnings. */
export function describeDocsSite(site: LoadedDocsSite) {
  return {
    config: site.config,
    navSource: site.navSource,
    nav: site.nav,
    autoNav: site.autoNav,
    navFile: site.config.navFile,
    navText: site.navText,
    documents: site.docs.map((d) => ({ path: d.path, title: docTitle(d.entry), route: d.route, hidden: !!d.entry.frontMatter.hidden, isPublic: d.asset.isPublic, version: d.asset.version, sizeBytes: d.asset.sizeBytes, s3Key: d.asset.s3Key })),
    files: [...site.files.keys()].sort(),
    warnings: site.warnings,
  };
}

/** Renders text that is not saved yet (the editor's live preview) as it would be at `path`, with the folder's real links and files. */
export function renderDraft(site: LoadedDocsSite, path: string, markdown: string) {
  const parsed = parseDocument(markdown);
  const byPath = new Map(site.docs.map((d) => [d.path, d]));
  const rendered = renderMarkdown(parsed.body, {
    currentPath: path,
    docRoute: (p) => byPath.get(p)?.route ?? (p === path ? docRouteOf({ path, frontMatter: parsed.frontMatter }) : null),
    assetUrl: (p) => { const a = site.files.get(p); return a ? `/dam-asset/${a.s3Key.split('/').map(encodeURIComponent).join('/')}` : null; },
  });
  return {
    title: parsed.frontMatter.title || firstH1(parsed.body) || path.split('/').pop() || path,
    html: rendered.html,
    headings: rendered.headings.filter((h) => h.depth >= 2 && h.depth <= 3),
    warnings: [...parsed.warnings, ...rendered.warnings],
  };
}

/** Checks the text of an index file without saving it: the problems, the resulting index and what it leaves out. */
export function checkNavText(site: LoadedDocsSite, text: string) {
  const parsed = parseNavYaml(text);
  if (parsed.errors.length) return { ok: false as const, errors: parsed.errors, warnings: [] as string[], nav: [] as NavNode[] };
  const built = buildManualNav(parsed.entries, site.docs.map((d) => d.entry));
  return { ok: true as const, errors: [] as string[], warnings: built.warnings, nav: built.items };
}

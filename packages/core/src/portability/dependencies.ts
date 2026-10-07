import type { BundleAsset, BundleClass, BundleComponent, BundleObject, BundlePage, BundleSnippet, BundleTheme } from './bundle.js';
import { collectAssetPathRefs, collectDataBindingClassNames, collectUuids } from './refs.js';

// What the export has to add to a website so that the bundle is complete: everything that the website's own content
// points at, followed transitively. Database access is injected (`DependencyResolvers`) so the walk is testable.

export interface AssetSource {
  id: string;
  pimcorePath: string;
  s3Key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isPublic: boolean;
  metadata: unknown;
}

export interface DependencyResolvers {
  /** Entities whose id is in `ids` (unknown ids are simply absent from the result). */
  findByIds(ids: string[]): Promise<{
    pages: (BundlePage & { id: string; websiteId?: string | null })[];
    snippets: BundleSnippet[];
    dataObjects: BundleObject[];
    themes: (BundleTheme & { id: string })[];
  }>;
  getDataClassById(id: string): Promise<BundleClass | null>;
  getDataClassByName(name: string): Promise<BundleClass | null>;
  listDataObjectsOfClass(classId: string): Promise<BundleObject[]>;
  getDataComponentByName(name: string): Promise<BundleComponent | null>;
  /** Every asset record (id, path, key, ...): one query, then references are matched in memory. */
  listAssets(): Promise<AssetSource[]>;
}

export interface DependencyOptions {
  /** `all`: every object of each class a data binding names (what the site shows), plus the objects reached by id.
   *  `referenced`: only the objects reached by id. */
  dataObjects: 'all' | 'referenced';
}

export interface Dependencies {
  themes: BundleTheme[];
  /** Module pages of other websites (or of none) that a layout or a link uses. */
  externalPages: BundlePage[];
  snippets: BundleSnippet[];
  dataComponents: BundleComponent[];
  dataClasses: BundleClass[];
  dataObjects: BundleObject[];
  assets: BundleAsset[];
}

const pageDocument = (p: BundlePage) => ({ content: p.content, seo: p.seo, sitemap: p.sitemap, search: p.search, themeId: p.themeId });

/** Class names a class refers to (`relationTarget`) and the component types it allows, found anywhere in its fields. */
function classLinks(fields: unknown): { classNames: Set<string>; componentNames: Set<string> } {
  const classNames = new Set<string>();
  const componentNames = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== 'object') return;
    const rec = v as Record<string, unknown>;
    if (typeof rec.relationTarget === 'string' && rec.relationTarget) classNames.add(rec.relationTarget);
    if (Array.isArray(rec.allowedComponentTypes)) for (const n of rec.allowedComponentTypes) if (typeof n === 'string') componentNames.add(n);
    Object.values(rec).forEach(walk);
  };
  walk(fields);
  return { classNames, componentNames };
}

/**
 * @param documents JSON of the website itself (settings, page contents, template layouts, menus): the starting points
 * @param ownPageIds ids of the website's own pages (they are exported by the caller, not as external pages)
 * @param ownThemeIds ids of the themes the caller already exports
 */
export async function collectDependencies(
  documents: unknown[],
  ownPageIds: ReadonlySet<string>,
  ownThemeIds: ReadonlySet<string>,
  resolvers: DependencyResolvers,
  options: DependencyOptions = { dataObjects: 'all' },
): Promise<Dependencies> {
  const assetsList = await resolvers.listAssets();
  const assetsById = new Map(assetsList.map((a) => [a.id, a]));
  const lookup = {
    byPath: new Map(assetsList.map((a) => [a.pimcorePath, a.id])),
    byKey: new Map(assetsList.map((a) => [a.s3Key, a.id])),
  };

  const themes = new Map<string, BundleTheme>();
  const externalPages = new Map<string, BundlePage>();
  const snippets = new Map<string, BundleSnippet>();
  const objects = new Map<string, BundleObject>();
  const classesByName = new Map<string, BundleClass>();
  const components = new Map<string, BundleComponent>();
  const assets = new Map<string, BundleAsset>();
  const seenIds = new Set<string>([...ownPageIds, ...ownThemeIds]);
  const classesWithObjects = new Set<string>();

  let queue: unknown[] = [...documents];

  const addAsset = (id: string): void => {
    const a = assetsById.get(id);
    if (!a || assets.has(id)) return;
    assets.set(id, { id: a.id, pimcorePath: a.pimcorePath, filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes, isPublic: a.isPublic, metadata: a.metadata });
  };

  const addClass = async (c: BundleClass | null, withObjects: boolean): Promise<void> => {
    if (!c) return;
    const isNew = !classesByName.has(c.name);
    if (isNew) {
      classesByName.set(c.name, c);
      const { classNames, componentNames } = classLinks(c.fields);
      for (const name of componentNames) {
        if (components.has(name)) continue;
        const comp = await resolvers.getDataComponentByName(name);
        if (comp) components.set(name, comp);
      }
      for (const name of classNames) await addClass(await resolvers.getDataClassByName(name), false);
    }
    if (withObjects && !classesWithObjects.has(c.name)) {
      classesWithObjects.add(c.name);
      for (const o of await resolvers.listDataObjectsOfClass(c.id)) {
        if (objects.has(o.id)) continue;
        objects.set(o.id, o);
        seenIds.add(o.id);
        queue.push({ attributes: o.attributes, parentId: o.parentId });
      }
    }
  };

  while (queue.length) {
    const batch = queue;
    queue = [];

    const ids = new Set<string>();
    for (const doc of batch) {
      for (const id of collectUuids(doc)) {
        if (seenIds.has(id)) continue;
        ids.add(id);
      }
      for (const id of collectAssetPathRefs(doc, lookup)) addAsset(id);
      if (options.dataObjects === 'all') {
        for (const name of collectDataBindingClassNames(doc)) await addClass(await resolvers.getDataClassByName(name), true);
      } else {
        for (const name of collectDataBindingClassNames(doc)) await addClass(await resolvers.getDataClassByName(name), false);
      }
    }
    for (const id of ids) { seenIds.add(id); addAsset(id); }

    if (ids.size === 0) continue;
    const found = await resolvers.findByIds([...ids]);
    for (const t of found.themes) if (!themes.has(t.id)) themes.set(t.id, t);
    for (const p of found.pages) {
      if (externalPages.has(p.id)) continue;
      const { websiteId: _w, ...page } = p;
      externalPages.set(p.id, { ...page, external: true });
      queue.push(pageDocument(p));
    }
    for (const s of found.snippets) {
      if (snippets.has(s.id)) continue;
      snippets.set(s.id, s);
      queue.push({ node: s.node, themeId: s.themeId });
    }
    for (const o of found.dataObjects) {
      if (objects.has(o.id)) continue;
      objects.set(o.id, o);
      queue.push({ attributes: o.attributes, parentId: o.parentId });
      await addClass(await resolvers.getDataClassById(o.classId), false);
    }
  }

  // The class of every exported object must be there, even one reached only through a class that has no data binding.
  for (const o of objects.values()) {
    if (![...classesByName.values()].some((c) => c.id === o.classId)) await addClass(await resolvers.getDataClassById(o.classId), false);
  }

  return {
    themes: [...themes.values()],
    externalPages: [...externalPages.values()],
    snippets: [...snippets.values()],
    dataComponents: [...components.values()],
    dataClasses: [...classesByName.values()],
    dataObjects: [...objects.values()],
    assets: [...assets.values()],
  };
}

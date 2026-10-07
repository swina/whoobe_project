import { findBundleEntitiesByIds } from '../db/bundle-records.js';
import { listAssets } from '../db/asset-records.js';
import { getDataClass, getDataClassByName } from '../db/data-classes-records.js';
import { getDataComponentByName } from '../db/data-components-records.js';
import { listDataObjects } from '../db/data-objects-records.js';
import { getTheme } from '../db/themes-records.js';
import { getWebsite } from '../db/websites-records.js';
import { listWebsitePaths } from '../db/website-paths-records.js';
import { listWebsiteTemplates } from '../db/website-templates-records.js';
import { listWhoobePages } from '../db/whoobe-pages-records.js';
import type { BundleObject, BundlePage, BundleTheme, WebsiteBundle } from './bundle.js';
import { collectDependencies, type DependencyOptions, type DependencyResolvers } from './dependencies.js';

const toTheme = (t: { id: string; name: string; colors: { name: string; hex: string }[]; fonts: string[]; styles: string; tailwindClasses: string }): BundleTheme =>
  ({ id: t.id, name: t.name, colors: t.colors, fonts: t.fonts, styles: t.styles, tailwindClasses: t.tailwindClasses });

const toObject = (o: BundleObject & { [k: string]: unknown }): BundleObject => ({
  id: o.id, classId: o.classId, key: o.key, path: o.path, parentId: o.parentId, translationGroupId: o.translationGroupId,
  locale: o.locale, published: o.published, workflowState: o.workflowState, attributes: o.attributes,
});

const toPage = (p: any): BundlePage => ({
  id: p.id, translationGroupId: p.translationGroupId, locale: p.locale, slug: p.slug, title: p.title, category: p.category,
  kind: p.kind, published: p.published, workflowState: p.workflowState, content: p.content, seo: p.seo, sitemap: p.sitemap,
  search: p.search, pimcoreId: p.pimcoreId, path: p.path, themeId: p.themeId,
});

/** The database side of the dependency walk. */
export const dbDependencyResolvers: DependencyResolvers = {
  async findByIds(ids) {
    const found = await findBundleEntitiesByIds(ids);
    return {
      pages: found.pages.map((p) => ({ ...toPage(p), id: p.id, websiteId: p.websiteId })),
      snippets: found.snippets.map((s) => ({ id: s.id, name: s.name, category: s.category, icon: s.icon, node: s.node, themeId: s.themeId, notes: s.notes, thumbnail: s.thumbnail })),
      dataObjects: found.dataObjects.map((o) => toObject(o as any)),
      themes: found.themes.map(toTheme) as (BundleTheme & { id: string })[],
    };
  },
  async getDataClassById(id) {
    const c = await getDataClass(id);
    return c ? { id: c.id, name: c.name, label: c.label, fields: c.fields, viewConfig: c.viewConfig ?? null } : null;
  },
  async getDataClassByName(name) {
    const c = await getDataClassByName(name);
    return c ? { id: c.id, name: c.name, label: c.label, fields: c.fields, viewConfig: c.viewConfig ?? null } : null;
  },
  async listDataObjectsOfClass(classId) {
    return (await listDataObjects(classId)).map((o) => toObject(o as any));
  },
  async getDataComponentByName(name) {
    const c = await getDataComponentByName(name);
    return c ? { name: c.name, label: c.label, fields: c.fields } : null;
  },
  async listAssets() {
    return (await listAssets()).map((a) => ({ id: a.id, pimcorePath: a.pimcorePath, s3Key: a.s3Key, filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes, isPublic: a.isPublic, metadata: a.metadata }));
  },
};

/** The complete bundle of a website, or null when there is no such website. */
export async function buildWebsiteBundle(websiteId: string, options?: DependencyOptions): Promise<WebsiteBundle | null> {
  const website = await getWebsite(websiteId);
  if (!website) return null;

  const [pageRows, templates, menus] = await Promise.all([listWhoobePages(website.id), listWebsiteTemplates(website.id), listWebsitePaths(website.id)]);
  const pages = pageRows.map(toPage);

  // The theme of the website and the themes of its pages; the dependency walk adds the ones snippets use.
  const themes = new Map<string, BundleTheme>();
  for (const id of new Set([website.themeId, ...pages.map((p) => p.themeId)])) {
    if (!id) continue;
    const t = await getTheme(id);
    if (t) themes.set(t.id, toTheme(t));
  }

  const documents: unknown[] = [
    website.settings,
    ...pages.map((p) => ({ content: p.content, seo: p.seo, sitemap: p.sitemap, search: p.search })),
    ...templates.map((t) => t.layout),
    ...menus.map((m) => m.items),
  ];
  const dep = await collectDependencies(documents, new Set(pages.map((p) => p.id!)), new Set(themes.keys()), dbDependencyResolvers, options);
  for (const t of dep.themes) if (t.id && !themes.has(t.id)) themes.set(t.id, t);

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    website: {
      id: website.id,
      name: website.name,
      rootPath: website.rootPath,
      domains: website.domains,
      defaultLocale: website.defaultLocale,
      supportedLocales: website.supportedLocales,
      settings: website.settings as Record<string, unknown> | null,
      themeId: website.themeId,
    },
    themes: [...themes.values()],
    pages: [...pages, ...dep.externalPages],
    websiteTemplates: templates.map((t) => ({ id: t.id, name: t.name, description: t.description, layout: t.layout as Record<string, unknown>, pathPatterns: t.pathPatterns, locale: t.locale ?? null, isDefault: t.isDefault })),
    websitePaths: menus.map((m) => ({ id: m.id, name: m.name, items: m.items as unknown as Record<string, unknown>[] })),
    snippets: dep.snippets,
    dataComponents: dep.dataComponents,
    dataClasses: dep.dataClasses,
    dataObjects: dep.dataObjects,
    assets: dep.assets,
  };
}

// Website bundle, version 2: everything a website needs to be a twin on another installation. The JSON is the
// manifest; the files of the assets travel next to it (a .zip with `bundle.json` and `assets/`, built by the admin
// dashboard). Every entity keeps its original `id` so that references inside the JSON can be rewritten on import.

export interface BundleTheme { id: string | null; name: string; colors: { name: string; hex: string }[]; fonts: string[]; styles: string; tailwindClasses: string }

export interface BundlePage {
  id: string | null;
  translationGroupId: string;
  locale: string;
  slug: string;
  title: string;
  category: string;
  kind: string;
  published: boolean;
  workflowState: string | null;
  content: unknown;
  seo: unknown;
  sitemap: unknown;
  search: unknown;
  pimcoreId: string | null;
  path: string | null;
  themeId: string | null;
  /** True for a module page of another website (or of none) that a layout of this one uses. */
  external?: boolean;
}

export interface BundleTemplate { id: string | null; name: string; description: string | null; layout: Record<string, unknown>; pathPatterns: string[]; locale: string | null; isDefault: boolean }
export interface BundleMenu { id: string | null; name: string; items: Record<string, unknown>[] }
export interface BundleSnippet { id: string; name: string; category: string; icon: string | null; node: unknown; themeId: string | null; notes: string | null; thumbnail: string | null; /** absent in bundles made before snippets could be locked */ locked?: boolean }
export interface BundleComponent { name: string; label: string; fields: unknown[] }
export interface BundleClass { id: string; name: string; label: string; fields: unknown[]; viewConfig: unknown }
export interface BundleObject {
  id: string;
  classId: string;
  key: string;
  path: string;
  parentId: string | null;
  translationGroupId: string;
  locale: string;
  published: boolean;
  workflowState: string | null;
  attributes: Record<string, unknown>;
}

export interface BundleAsset {
  id: string;
  pimcorePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isPublic: boolean;
  metadata: unknown;
  /** Path of the file inside the .zip; set by the client that builds the archive. Absent: references only. */
  file?: string;
}

export interface WebsiteBundle {
  version: 2;
  exportedAt: string;
  website: {
    id: string | null;
    name: string;
    rootPath: string;
    domains: string[];
    defaultLocale: string;
    supportedLocales: string[];
    settings: Record<string, unknown> | null;
    themeId: string | null;
  };
  themes: BundleTheme[];
  pages: BundlePage[];
  websiteTemplates: BundleTemplate[];
  websitePaths: BundleMenu[];
  snippets: BundleSnippet[];
  dataComponents: BundleComponent[];
  dataClasses: BundleClass[];
  dataObjects: BundleObject[];
  assets: BundleAsset[];
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Accepts a version 1 or 2 export and returns a version 2 bundle (what v1 did not carry is empty), or a message. */
export function parseWebsiteBundle(raw: unknown): { bundle: WebsiteBundle } | { error: string } {
  const r = raw as Record<string, any> | null;
  if (!r || typeof r !== 'object') return { error: 'Invalid export payload: not an object' };
  if (r.version !== 1 && r.version !== 2) return { error: 'Invalid export payload: expected version 1 or 2' };
  const w = r.website;
  if (!w || typeof w !== 'object' || typeof w.name !== 'string' || !w.name) return { error: 'Invalid export payload: website name is missing' };
  const bundle: WebsiteBundle = {
    version: 2,
    exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt : '',
    website: {
      id: typeof w.id === 'string' ? w.id : null,
      name: w.name,
      rootPath: typeof w.rootPath === 'string' ? w.rootPath : '',
      domains: arr<string>(w.domains),
      defaultLocale: typeof w.defaultLocale === 'string' ? w.defaultLocale : 'en',
      supportedLocales: arr<string>(w.supportedLocales).length ? arr<string>(w.supportedLocales) : ['en'],
      settings: w.settings && typeof w.settings === 'object' ? w.settings : {},
      themeId: typeof w.themeId === 'string' ? w.themeId : null,
    },
    themes: arr<BundleTheme>(r.themes).map((t) => ({ ...t, id: t.id ?? null })),
    pages: arr<BundlePage>(r.pages).map((p) => ({ ...p, id: p.id ?? null })),
    websiteTemplates: arr<BundleTemplate>(r.websiteTemplates).map((t) => ({ ...t, id: t.id ?? null, locale: t.locale ?? null })),
    websitePaths: arr<BundleMenu>(r.websitePaths).map((m) => ({ ...m, id: m.id ?? null })),
    snippets: arr<BundleSnippet>(r.snippets),
    dataComponents: arr<BundleComponent>(r.dataComponents),
    dataClasses: arr<BundleClass>(r.dataClasses),
    dataObjects: arr<BundleObject>(r.dataObjects),
    assets: arr<BundleAsset>(r.assets),
  };
  return { bundle };
}

// Imports a site specification as a new website: checks it, applies the person's choices about themes and snippets that already exist, expands it
// into a bundle and hands the bundle to the importer. `dryRun` does everything but the writes, and answers with the same numbers the import will
// produce. Nothing here calls a model or any outside service.
import { validateSiteSpec, type SiteSpec } from '@whoobe-cms/schema';
import { listThemes } from '../db/themes-records.js';
import { listWhoobeOneSnippets } from '../db/whoobe-one-snippet-records.js';
import { getWebsiteByRootPath } from '../db/websites-records.js';
import { isReservedRootPath } from '../routing/site-roots.js';
import { importWebsiteBundle, ImportError, type ImportReport } from './import.js';
import { expandSiteSpec, SiteSpecError, siteSpecRootPath, type SiteSpecExisting } from './site-spec.js';

export type SiteSpecChoice = 'existing' | 'new';

/** What the person decided for the names that are already taken here. Absent means `new`: an existing item is never changed or replaced. */
export interface SiteSpecChoices {
  themes?: Record<string, SiteSpecChoice>;
  snippets?: Record<string, SiteSpecChoice>;
}

export interface SiteSpecConflict {
  kind: 'theme' | 'snippet';
  /** The name the file gives it, which already exists here. */
  name: string;
  choice: SiteSpecChoice;
  /** With `new`: the name it will have (a free one). */
  createdAs?: string;
}

export interface SiteSpecSummary {
  website: { name: string; rootPath: string; rootPathTaken: boolean; locales: string[] };
  pages: { slug: string; title: string; locale: string }[];
  snippets: { name: string; action: 'create' | 'use-existing' }[];
  theme: { name: string; action: 'create' | 'use-existing' } | null;
  layout: string[];
}

export interface SiteSpecOutcome {
  dryRun: boolean;
  conflicts: SiteSpecConflict[];
  summary: SiteSpecSummary;
  /** The importer's report; absent in a dry run when the root path is taken (nothing can be imported until it is changed). */
  report?: ImportReport;
  website?: { id: string; name: string; rootPath: string };
}

export interface SiteSpecImportOptions {
  dryRun?: boolean;
  choices?: SiteSpecChoices;
  /** Changes made in the check step before anything else, so the links (which carry the root path) follow. */
  website?: { name?: string; rootPath?: string };
}

const freeName = (name: string, taken: Set<string>): string => {
  for (let n = 2; ; n++) { const candidate = `${name} (${n})`; if (!taken.has(candidate)) return candidate; }
};

/** The existing themes and snippets, by name (the first of each name when several share it). */
export async function loadSiteSpecExisting(): Promise<SiteSpecExisting> {
  const themes: SiteSpecExisting['themes'] = {};
  for (const t of await listThemes()) if (!(t.name in themes)) themes[t.name] = { id: t.id };
  const snippets: SiteSpecExisting['snippets'] = {};
  for (const s of await listWhoobeOneSnippets()) if (!(s.name in snippets)) snippets[s.name] = { id: s.id, node: s.node };
  return { themes, snippets };
}

/**
 * Applies the choices to the names the file defines (D10 of docs/plans/ai/ai-site-spec.md): `existing` turns the definition into a reference to
 * the one that is here, `new` gives the new one a free name. Pure; returns the adjusted spec and what was decided.
 */
export function applySiteSpecChoices(spec: SiteSpec, existing: SiteSpecExisting, choices: SiteSpecChoices = {}): { spec: SiteSpec; conflicts: SiteSpecConflict[] } {
  const conflicts: SiteSpecConflict[] = [];
  const out: SiteSpec = JSON.parse(JSON.stringify(spec));
  const takenThemes = new Set([...Object.keys(existing.themes), ...(out.theme?.name ? [out.theme.name] : [])]);
  const takenSnippets = new Set([...Object.keys(existing.snippets), ...(out.snippets ?? []).flatMap((s) => (s.name ? [s.name] : []))]);

  if (out.theme?.name !== undefined && out.theme.name in existing.themes) {
    const name = out.theme.name;
    if (choices.themes?.[name] === 'existing') {
      out.theme = { use: name };
      conflicts.push({ kind: 'theme', name, choice: 'existing' });
    } else {
      const createdAs = freeName(name, takenThemes);
      out.theme.name = createdAs; takenThemes.add(createdAs);
      conflicts.push({ kind: 'theme', name, choice: 'new', createdAs });
    }
  }

  for (const s of out.snippets ?? []) {
    if (s.name === undefined || !(s.name in existing.snippets)) continue;
    const name = s.name;
    if (choices.snippets?.[name] === 'existing') {
      delete s.name; delete s.category; delete s.node; s.use = name;
      conflicts.push({ kind: 'snippet', name, choice: 'existing' });
    } else {
      // the name taken is the existing one's; the file's own definition gets a free name
      const createdAs = freeName(name, takenSnippets);
      s.name = createdAs; takenSnippets.add(createdAs);
      conflicts.push({ kind: 'snippet', name, choice: 'new', createdAs });
    }
  }
  return { spec: out, conflicts };
}

export async function importSiteSpec(input: unknown, options: SiteSpecImportOptions = {}): Promise<SiteSpecOutcome> {
  const dryRun = options.dryRun === true;
  // changes of the check step go in before validation, so a bad root path is reported like any other error
  let raw = input;
  if (options.website && input && typeof input === 'object' && !Array.isArray(input)) {
    const r = input as { website?: Record<string, unknown> };
    raw = { ...r, website: { ...(r.website ?? {}), ...(options.website.name !== undefined ? { name: options.website.name } : {}), ...(options.website.rootPath !== undefined ? { rootPath: options.website.rootPath } : {}) } };
  }
  const checked = validateSiteSpec(raw);
  if (!checked.ok) throw new SiteSpecError(checked.issues);

  const existing = await loadSiteSpecExisting();
  const { spec, conflicts } = applySiteSpecChoices(checked.spec, existing, options.choices);
  const { bundle } = expandSiteSpec(spec, { existing });

  const rootPath = bundle.website.rootPath;
  if (isReservedRootPath(rootPath)) {
    throw new SiteSpecError([{ path: 'website.rootPath', where: '"website", "rootPath"', message: `"${rootPath}" is a name the host answers to itself (dashboard, editor or API): give the website another name or root path` }]);
  }
  const rootPathTaken = !!(await getWebsiteByRootPath(rootPath));
  const summary: SiteSpecSummary = {
    website: { name: bundle.website.name, rootPath, rootPathTaken, locales: bundle.website.supportedLocales },
    pages: bundle.pages.map((p) => ({ slug: p.slug, title: p.title, locale: p.locale })),
    snippets: [
      ...bundle.snippets.map((s) => ({ name: s.name, action: 'create' as const })),
      ...(spec.snippets ?? []).filter((s) => s.use !== undefined).map((s) => ({ name: s.use!, action: 'use-existing' as const })),
    ],
    theme: spec.theme?.use !== undefined ? { name: spec.theme.use, action: 'use-existing' } : spec.theme?.name !== undefined ? { name: spec.theme.name, action: 'create' } : null,
    layout: Object.keys(spec.layout ?? {}),
  };

  if (dryRun && rootPathTaken) return { dryRun, conflicts, summary };
  // pages come in as drafts: publishing is a separate permission (restorePublication stays off)
  const report = await importWebsiteBundle(bundle, { dryRun, keepNames: true });
  return { dryRun, conflicts, summary, report, ...(report.website.id ? { website: { id: report.website.id, name: report.website.name, rootPath: report.website.rootPath } } : {}) };
}


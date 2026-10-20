import { randomBytes, randomUUID } from 'node:crypto';
import { getAssetById, listAssets } from '../db/asset-records.js';
import { documentationFolderOf } from './export.js';
import { createDataClass, deleteDataClass, getDataClassByName } from '../db/data-classes-records.js';
import { createDataComponent, deleteDataComponent, getDataComponentByName } from '../db/data-components-records.js';
import { createDataObject, deleteDataObject, listDataObjects, updateDataObject } from '../db/data-objects-records.js';
import { emitBulkSummary } from '../db/object-events-records.js';
import { createTheme, deleteTheme, getTheme } from '../db/themes-records.js';
import { createWebsite, deleteWebsite, getWebsiteByRootPath } from '../db/websites-records.js';
import { createWebsitePath, deleteWebsitePath } from '../db/website-paths-records.js';
import { createWebsiteTemplate, deleteWebsiteTemplate } from '../db/website-templates-records.js';
import { createWhoobePage, deleteWhoobePage, updateWhoobePage } from '../db/whoobe-pages-records.js';
import { createWhoobeOneSnippet, deleteWhoobeOneSnippet } from '../db/whoobe-one-snippet-records.js';
import type { WebsiteBundle } from './bundle.js';
import { diffClassFields, planAssets, type AssetPlanItem } from './plan.js';
import { bindPageGatewayContent } from '../gateway/bind-page-content.js';
import { getGatewayEndpointByName } from '../db/gateway-records.js';
import { isReservedRootPath } from '../routing/site-roots.js';
import { collectGatewayEndpointNames, rewriteAssetPaths, rewriteIds } from './refs.js';

export interface ImportOptions {
  /** Report what would happen; write nothing. */
  dryRun?: boolean;
  /** Assets the caller has stored already (the files travel next to the bundle, the caller uploads them):
   *  old asset id -> the record it became here. */
  assetMap?: Record<string, { id: string; pimcorePath: string }>;
  /** Restore `published` and the workflow state of pages and objects. Off by default: putting content live is a
   *  separate permission (objects:publish), so the caller turns this on only for someone who holds it. */
  restorePublication?: boolean;
  /** A documentation website: the folder its files are stored in here. The caller that stores the files first (the dashboard) asks
   *  for it in a dry run and gives the same answer in the final call. Absent: the folder of the bundle if it is free here, else a free one. */
  docsFolder?: string;
  /** Use the name and the root path of the bundle as they are, instead of adding a suffix (a copy of an existing site needs the suffix, a site made
   *  from a specification does not: its links already carry the root path). A root path that is taken is a 409, in a dry run too. */
  keepNames?: boolean;
}

export interface ImportReport {
  dryRun: boolean;
  website: { id: string | null; name: string; rootPath: string };
  counts: {
    pages: number;
    externalPages: number;
    templates: number;
    menus: number;
    snippets: number;
    themes: number;
    classesCreated: number;
    classesReused: number;
    componentsCreated: number;
    componentsReused: number;
    objectsCreated: number;
    objectsReused: number;
  };
  classes: { name: string; action: 'create' | 'reuse'; differences: string[] }[];
  assets: AssetPlanItem[];
  /** Documentation websites: where the folder of the Markdown files was in the bundle, and where it goes here. */
  docs?: { sourceFolder: string; targetFolder: string };
  warnings: string[];
}

export class ImportError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const MAX_ENTITIES = 50_000;

function withDocsFolder(settings: Record<string, unknown>, folder: string): Record<string, unknown> {
  const d = (settings.docs ?? {}) as Record<string, unknown>;
  return { ...settings, docs: { ...d, sourceFolder: folder } };
}

/**
 * Imports a version 2 bundle as a new website (its name and root path get a suffix, like every earlier import), plus
 * what it needs: snippets, module pages, themes, data classes and components (reused when the name exists), data
 * objects (reused when the class has one with the same locale and key) and the assets the caller has stored.
 * Anything created is removed again if a step fails.
 */
export async function importWebsiteBundle(bundle: WebsiteBundle, options: ImportOptions = {}): Promise<ImportReport> {
  const dryRun = options.dryRun === true;
  const restorePublication = options.restorePublication === true;
  const warnings: string[] = [];
  const total = bundle.pages.length + bundle.dataObjects.length + bundle.snippets.length + bundle.assets.length;
  if (total > MAX_ENTITIES) throw new ImportError(`The bundle has ${total} entries; the limit is ${MAX_ENTITIES}`, 413);

  // --- assets: what is already here, what must be uploaded, what collides --------------------------------------
  const existingAssets = new Map((await listAssets()).map((a) => [a.pimcorePath, { id: a.id, sizeBytes: a.sizeBytes }]));

  // A documentation website is its folder: the files go to a folder of their own here. If the folder of the bundle is taken (the
  // same site is being copied on the same installation) the copy gets a free one, so editing it never touches the original;
  // the documents refer to each other and to their images with relative paths, so moving the folder as a whole keeps them valid.
  let docs: ImportReport['docs'];
  let planned = bundle.assets;
  const sourceFolder = documentationFolderOf(bundle.website.settings);
  if (sourceFolder) {
    let targetFolder: string;
    if (options.docsFolder !== undefined) {
      const wanted = documentationFolderOf({ kind: 'docs', docs: { sourceFolder: options.docsFolder } });
      if (!wanted) throw new ImportError('docsFolder is not a valid folder of the asset library');
      targetFolder = wanted;
    } else {
      const taken = (f: string) => [...existingAssets.keys()].some((p) => p.startsWith(`${f}/`));
      targetFolder = sourceFolder;
      for (let n = 1; taken(targetFolder); n++) targetFolder = n === 1 ? `${sourceFolder}-import` : `${sourceFolder}-import-${n}`;
    }
    if (targetFolder !== sourceFolder) {
      planned = bundle.assets.map((a) => (a.pimcorePath.startsWith(`${sourceFolder}/`) ? { ...a, pimcorePath: targetFolder + a.pimcorePath.slice(sourceFolder.length) } : a));
      warnings.push(`The documentation folder ${sourceFolder} is already used here: the files are stored in ${targetFolder}`);
    }
    docs = { sourceFolder, targetFolder };
  }
  const assetPlan = planAssets(planned, existingAssets);

  const idMap = new Map<string, string>();
  const pathMap = new Map<string, string>();
  const stored = options.assetMap ?? {};
  let notStored = 0;
  for (const item of assetPlan) {
    if (item.action === 'reuse' && item.existingId) { idMap.set(item.id, item.existingId); continue; }
    const got = stored[item.id];
    const record = got ? await getAssetById(got.id) : null;
    if (record) {
      idMap.set(item.id, record.id);
      if (record.pimcorePath !== item.pimcorePath) pathMap.set(item.pimcorePath, record.pimcorePath);
    } else if (!dryRun) notStored++;
  }
  if (notStored) warnings.push(`${notStored} asset(s) were not stored here: their references keep the old path or id and show nothing until the files are uploaded`);

  // --- classes and components: reuse by name -------------------------------------------------------------------
  const classReport: ImportReport['classes'] = [];
  const classPlan = new Map<string, { id: string | null }>();
  for (const c of bundle.dataClasses) {
    const here = await getDataClassByName(c.name);
    if (here) {
      const differences = diffClassFields(here.fields, c.fields);
      classReport.push({ name: c.name, action: 'reuse', differences });
      if (differences.length) warnings.push(`Class "${c.name}" exists here and differs: ${differences.join('; ')}`);
      classPlan.set(c.id, { id: here.id });
    } else {
      classReport.push({ name: c.name, action: 'create', differences: [] });
      classPlan.set(c.id, { id: null });
    }
  }
  const componentsToCreate: typeof bundle.dataComponents = [];
  for (const comp of bundle.dataComponents) if (!(await getDataComponentByName(comp.name))) componentsToCreate.push(comp);

  // --- data objects already here (same class, locale and key) --------------------------------------------------
  const objectHere = new Map<string, string>(); // bundle object id -> id of the object that exists here
  for (const o of bundle.dataObjects) {
    const target = classPlan.get(o.classId)?.id;
    if (!target) continue;
    // one listing per class is enough, but classes are few and this keeps the loop plain
    const rows = await listDataObjects(target);
    const same = rows.find((r) => r.locale === o.locale && r.key === o.key);
    if (same) objectHere.set(o.id, same.id);
  }

  const wasLive = bundle.pages.filter((p) => p.published).length + bundle.dataObjects.filter((o) => o.published && !objectHere.has(o.id)).length;
  if (!restorePublication && wasLive) warnings.push(`${wasLive} page(s) and object(s) were published in the bundle and are imported as drafts: publishing needs the objects:publish permission`);

  // Gateway forms and bindings: the endpoints are not in the bundle, and a binding row exists only for the website it was
  // saved for. The endpoints are looked up by name here; the bindings are made again for the new website below.
  const endpointNames = new Set<string>();
  for (const p of bundle.pages) for (const n of collectGatewayEndpointNames(p.content)) endpointNames.add(n);
  for (const n of endpointNames) {
    if (!(await getGatewayEndpointByName(n))) warnings.push(`Gateway endpoint "${n}" (used by forms or bindings of the pages) does not exist here: create it with the same name and route, then save the pages again`);
  }

  const counts: ImportReport['counts'] = {
    pages: bundle.pages.filter((p) => !p.external).length,
    externalPages: bundle.pages.filter((p) => p.external).length,
    templates: bundle.websiteTemplates.length,
    menus: bundle.websitePaths.length,
    snippets: bundle.snippets.length,
    themes: bundle.themes.length,
    classesCreated: classReport.filter((c) => c.action === 'create').length,
    classesReused: classReport.filter((c) => c.action === 'reuse').length,
    componentsCreated: componentsToCreate.length,
    componentsReused: bundle.dataComponents.length - componentsToCreate.length,
    objectsCreated: bundle.dataObjects.length - objectHere.size,
    objectsReused: objectHere.size,
  };

  // --- name and root path of the new website ----------------------------------------------------------------
  const basePath = bundle.website.rootPath || `/${bundle.website.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  let rootPath: string;
  let name: string;
  if (options.keepNames) {
    if (isReservedRootPath(basePath)) throw new ImportError(`The root path ${basePath} is a name the host answers to itself (dashboard, editor or API): choose another`, 400);
    if (await getWebsiteByRootPath(basePath)) throw new ImportError(`The root path ${basePath} is already used by another website: choose another name or root path`, 409);
    rootPath = basePath;
    name = bundle.website.name;
  } else {
    const suffix = randomBytes(4).toString('hex');
    rootPath = `${basePath}-${suffix}`;
    for (let n = 0; await getWebsiteByRootPath(rootPath); ) rootPath = `${basePath}-${suffix}-${++n}`;
    name = `${bundle.website.name} (import ${suffix})`;
  }

  const report: ImportReport = { dryRun, website: { id: null, name, rootPath }, counts, classes: classReport, assets: assetPlan, ...(docs ? { docs } : {}), warnings };
  if (dryRun) return report;

  // --- from here on, writes; `undo` removes what was created if a step fails ---------------------------------------
  const undo: (() => Promise<unknown>)[] = [];
  try {
    for (const comp of componentsToCreate) {
      const created = await createDataComponent({ name: comp.name, label: comp.label, fields: comp.fields as any });
      undo.push(() => deleteDataComponent(created.id));
    }
    for (const c of bundle.dataClasses) {
      const plan = classPlan.get(c.id)!;
      if (plan.id) { idMap.set(c.id, plan.id); continue; }
      const created = await createDataClass({ name: c.name, label: c.label, fields: c.fields as any, viewConfig: c.viewConfig as any });
      plan.id = created.id;
      idMap.set(c.id, created.id);
      undo.push(() => deleteDataClass(created.id));
    }

    // new ids first, so that every reference can be rewritten before any row is written
    const themeNewId = new Map<(typeof bundle.themes)[number], string>();
    bundle.themes.forEach((t, i) => {
      const fresh = randomUUID();
      themeNewId.set(t, fresh);
      if (t.id) idMap.set(t.id, fresh);
      else if (i === 0 && bundle.website.themeId) idMap.set(bundle.website.themeId, fresh); // version 1: the site's theme comes first
    });
    const newId = <T extends { id: string | null }>(items: T[]): Map<T, string> => {
      const m = new Map<T, string>();
      for (const it of items) { const fresh = randomUUID(); m.set(it, fresh); if (it.id) idMap.set(it.id, fresh); }
      return m;
    };
    const pageIds = newId(bundle.pages);
    const snippetIds = newId(bundle.snippets);
    const templateIds = newId(bundle.websiteTemplates);
    const objectIds = new Map<(typeof bundle.dataObjects)[number], string>();
    for (const o of bundle.dataObjects) {
      const fresh = objectHere.get(o.id) ?? randomUUID();
      objectIds.set(o, fresh);
      idMap.set(o.id, fresh);
    }
    const groups = new Map<string, string>();
    const group = (old: string): string => { let g = groups.get(old); if (!g) groups.set(old, (g = randomUUID())); return g; };
    const fix = <T>(v: T): T => rewriteAssetPaths(rewriteIds(v, idMap), pathMap);
    // A theme the bundle carries gets a new id (idMap). A theme id that is not in the bundle is kept when that theme exists here: a site made from
    // a specification points at a theme of the installation by name. Anything else is dropped, as before (a dangling reference would fail the insert).
    const themeRef = new Map<string, string | null>();
    const theme = async (old: string | null | undefined): Promise<string | null> => {
      if (!old) return null;
      if (idMap.has(old)) return idMap.get(old)!;
      if (!themeRef.has(old)) themeRef.set(old, (await getTheme(old)) ? old : null);
      return themeRef.get(old)!;
    };

    for (const t of bundle.themes) {
      const created = await createTheme({ id: themeNewId.get(t)!, name: t.name, colors: t.colors, fonts: t.fonts, styles: t.styles, tailwindClasses: t.tailwindClasses });
      undo.push(() => deleteTheme(created.id));
    }

    const website = await createWebsite({
      name,
      rootPath,
      domains: [],
      defaultLocale: bundle.website.defaultLocale,
      supportedLocales: bundle.website.supportedLocales,
      settings: docs ? withDocsFolder(fix(bundle.website.settings ?? {}), docs.targetFolder) : fix(bundle.website.settings ?? {}),
      themeId: await theme(bundle.website.themeId),
    });
    undo.push(() => deleteWebsite(website.id));
    report.website.id = website.id;

    const importedObjects: { classId: string; id: string }[] = [];
    for (const o of bundle.dataObjects) {
      if (objectHere.has(o.id)) continue;
      const created = await createDataObject({
        id: objectIds.get(o)!,
        classId: classPlan.get(o.classId)!.id!,
        key: o.key,
        path: o.path,
        translationGroupId: group(o.translationGroupId),
        locale: o.locale,
        attributes: fix(o.attributes),
      }, { silent: true });
      undo.push(() => deleteDataObject(created.id, { silent: true }));
      importedObjects.push({ classId: created.classId, id: created.id });
    }
    // parents and publication state once every object exists
    for (const o of bundle.dataObjects) {
      if (objectHere.has(o.id)) continue;
      const patch: Parameters<typeof updateDataObject>[1] = {};
      if (o.parentId && idMap.has(o.parentId)) patch.parentId = idMap.get(o.parentId)!;
      if (restorePublication && o.published) patch.published = true;
      if (restorePublication && o.workflowState) patch.workflowState = o.workflowState;
      if (Object.keys(patch).length) await updateDataObject(objectIds.get(o)!, patch, { silent: true });
    }

    for (const s of bundle.snippets) {
      const created = await createWhoobeOneSnippet({
        id: snippetIds.get(s)!, name: s.name, category: s.category, icon: s.icon, node: fix(s.node),
        themeId: await theme(s.themeId), notes: s.notes, thumbnail: s.thumbnail, locked: s.locked === true,
      });
      undo.push(() => deleteWhoobeOneSnippet(created.id));
    }

    for (const p of bundle.pages) {
      const content = fix(p.content);
      // new binding rows for the new website (bindings belong to one website); an endpoint that is missing here only
      // costs a warning above, the form then stays unbound until the endpoint exists and the page is saved
      try { await bindPageGatewayContent(content, website.id); } catch { /* the page is still imported */ }
      const created = await createWhoobePage({
        id: pageIds.get(p)!,
        translationGroupId: group(p.translationGroupId),
        locale: p.locale,
        slug: p.slug,
        title: p.title,
        category: p.category,
        kind: p.kind as 'content' | 'module' | 'app',
        content,
        seo: fix(p.seo) as any,
        sitemap: fix(p.sitemap) as any,
        search: fix(p.search) as any,
        pimcoreId: null,
        path: p.path,
        websiteId: website.id,
        themeId: await theme(p.themeId),
      });
      undo.push(() => deleteWhoobePage(created.id));
      if (restorePublication && (p.published || p.workflowState)) await updateWhoobePage(created.id, { published: p.published, workflowState: p.workflowState }, { silent: true });
    }

    for (const t of bundle.websiteTemplates) {
      const created = await createWebsiteTemplate({
        id: templateIds.get(t)!, websiteId: website.id, name: t.name, description: t.description, layout: fix(t.layout) as any,
        pathPatterns: t.pathPatterns, locale: t.locale, isDefault: t.isDefault,
      });
      undo.push(() => deleteWebsiteTemplate(created.id));
    }
    for (const m of bundle.websitePaths) {
      const created = await createWebsitePath({ websiteId: website.id, name: m.name, items: fix(m.items) as any });
      undo.push(() => deleteWebsitePath(created.id));
    }

    // A bundle is bulk by nature: one summary per class, sent only when the whole import succeeded (a failed one is undone and sends nothing).
    const byClass = new Map<string, string[]>();
    for (const o of importedObjects) byClass.set(o.classId, [...(byClass.get(o.classId) ?? []), o.id]);
    for (const [classId, ids] of byClass) await emitBulkSummary({ classId, kind: 'import', count: ids.length, ids, actor: { type: 'import' } });

    return report;
  } catch (error) {
    for (const step of undo.reverse()) { try { await step(); } catch { /* best effort */ } }
    throw error;
  }
}

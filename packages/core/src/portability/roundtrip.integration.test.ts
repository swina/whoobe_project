import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Needs a DISPOSABLE database: it migrates it and empties tables. Never point it at real data. Run with e.g.
//   docker run -d --rm --name pt -e POSTGRES_PASSWORD=pt -p 55432:5432 postgres:16-alpine
//   PORTABILITY_TEST_DATABASE_URL=postgres://postgres:pt@127.0.0.1:55432/postgres pnpm --filter @whoobe-cms/core test portability
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('website bundle: export, import on an empty installation, export again', () => {
  let db: typeof import('../db/client.js');
  let sql: import('drizzle-orm').SQL | any;
  let core: any;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('../db/client.js');
    const boot = await import('../db/bootstrap.js');
    await boot.runMigrations();
    core = {
      ...(await import('../db/asset-records.js')), ...(await import('../db/data-classes-records.js')), ...(await import('../db/data-components-records.js')),
      ...(await import('../db/data-objects-records.js')), ...(await import('../db/themes-records.js')), ...(await import('../db/websites-records.js')),
      ...(await import('../db/website-paths-records.js')), ...(await import('../db/website-templates-records.js')), ...(await import('../db/whoobe-pages-records.js')),
      ...(await import('../db/whoobe-one-snippet-records.js')), ...(await import('../db/gateway-records.js')), ...(await import('../gateway/bind-page-content.js')), ...(await import('./index.js')),
    };
    sql = (await import('drizzle-orm')).sql;
  });
  afterAll(async () => { await db?.closeDb(); });

  const wipe = async () => {
    for (const t of ['whoobe_pages', 'website_templates', 'website_paths', 'websites', 'whoobe_one_snippets', 'data_objects', 'data_classes', 'data_components', 'themes', 'assets', 'folders', 'search_documents', 'content_versions', 'gateway_bindings', 'gateway_routes', 'gateway_endpoints']) {
      await db.getDb().execute(sql.raw(`TRUNCATE TABLE "${t}" CASCADE`));
    }
  };

  const addAsset = (path: string, size: number) => core.upsertAssetRecord({ pimcorePath: path, filename: path.split('/').pop(), folderPath: path.slice(0, path.lastIndexOf('/')) || '/', sizeBytes: size, mimeType: 'image/png', fileType: 'image', s3Key: path.replace(/^\//, ''), isPublic: true, metadata: null });

  // canonical form: every uuid becomes u1, u2... in order of first appearance; fields that legitimately differ are dropped
  const canonical = (bundle: any) => {
    const copy = JSON.parse(JSON.stringify({ ...bundle, exportedAt: undefined, website: { ...bundle.website, name: undefined, rootPath: undefined, id: undefined } }));
    // rows come back from the database in no particular order: sort by something stable before numbering the ids
    const by: Record<string, string> = { pages: 'slug', snippets: 'name', websiteTemplates: 'name', websitePaths: 'name', dataClasses: 'name', dataComponents: 'name', dataObjects: 'key', assets: 'pimcorePath', themes: 'name' };
    // a module page that belonged to no website is an own page of the imported one: that is the one intended difference
    for (const p of copy.pages) delete p.external;
    for (const [list, key] of Object.entries(by)) copy[list].sort((a: any, b: any) => String(a[key]).localeCompare(String(b[key])));
    const seen = new Map<string, string>();
    const text = JSON.stringify(copy).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m) => { if (!seen.has(m)) seen.set(m, `u${seen.size + 1}`); return seen.get(m)!; });
    return JSON.parse(text);
  };

  it('keeps snippets, module pages, menus, objects and assets linked, and a second export equals the first', async () => {
    await wipe();
    const logo = await addAsset('/site/logo.png', 11);
    const photo = await addAsset('/site/maker.png', 22);
    await addAsset('/site/unused.png', 33);
    const theme = await core.createTheme({ name: 'Dark', colors: [{ name: 'bg', hex: '#000' }] });
    await core.createDataComponent({ name: 'Spec', label: 'Spec', fields: [] });
    const maker = await core.createDataClass({ name: 'Maker', label: 'Maker', fields: [{ name: 'logo', fieldType: 'image' }] });
    const product = await core.createDataClass({ name: 'Product', label: 'Product', fields: [{ name: 'maker', fieldType: 'manyToOneRelation', relationTarget: 'Maker' }, { name: 'parts', fieldType: 'fieldcollections', allowedComponentTypes: ['Spec'] }] });
    const acme = await core.createDataObject({ classId: maker.id, key: 'acme', locale: 'en', attributes: { logo: { assetId: photo.id } } });
    await core.updateDataObject(acme.id, { published: true });
    await core.createDataObject({ classId: product.id, key: 'rocket', locale: 'en', attributes: { maker: { id: acme.id } } });
    const snippet = await core.createWhoobeOneSnippet({ name: 'Logo', category: 'brand', node: { blocks: [{ image: { url: '/site/logo.png', assetId: logo.id } }, { dataBinding: { className: 'Product' } }] }, themeId: theme.id });
    const site = await core.createWebsite({ name: 'Shop', rootPath: '/shop', themeId: theme.id, supportedLocales: ['en', 'it'] });
    const header = await core.createWhoobePage({ slug: 'header', title: 'Header', kind: 'module', websiteId: site.id, content: { blocks: [] } });
    await core.updateWhoobePage(header.id, { published: true });
    const stray = await core.createWhoobePage({ slug: 'stray', title: 'Module of nobody', kind: 'module', websiteId: null, content: { blocks: [{ image: { url: '/site/logo.png' } }] } });
    const home = await core.createWhoobePage({ slug: 'home', title: 'Home', websiteId: site.id, themeId: theme.id, content: { blocks: [{ sourceSnippetId: snippet.id, link: { pageId: header.id } }] } });
    await core.updateWhoobePage(home.id, { published: true, workflowState: 'approved' });
    await core.createWebsiteTemplate({ websiteId: site.id, name: 'Main', isDefault: true, locale: 'it', layout: { header: { pageIds: [header.id, stray.id], snippetIds: [snippet.id] } } });
    await core.createWebsitePath({ websiteId: site.id, name: 'Main menu', items: [{ label: 'Home', pageId: home.id }] });

    const first = await core.buildWebsiteBundle(site.id);
    expect(first.version).toBe(2);
    expect(first.pages.map((p: any) => p.slug).sort()).toEqual(['header', 'home', 'stray']);
    expect(first.pages.find((p: any) => p.slug === 'stray').external).toBe(true);
    expect(first.snippets).toHaveLength(1);
    expect(first.dataClasses.map((c: any) => c.name).sort()).toEqual(['Maker', 'Product']);
    expect(first.dataComponents.map((c: any) => c.name)).toEqual(['Spec']);
    expect(first.dataObjects).toHaveLength(2);
    expect(first.assets.map((a: any) => a.pimcorePath).sort()).toEqual(['/site/logo.png', '/site/maker.png']);
    expect(first.websiteTemplates[0].locale).toBe('it');
    expect(first.themes.map((t: any) => t.name)).toEqual(['Dark']);

    // "another installation": nothing here, the files of the assets are stored there first (new ids)
    const wire = JSON.parse(JSON.stringify(first));
    await wipe();
    await addAsset('/other/filler.png', 1);
    const assetMap: Record<string, { id: string; pimcorePath: string }> = {};
    for (const a of wire.assets) { const r = await addAsset(a.pimcorePath, a.sizeBytes); assetMap[a.id] = { id: r.id, pimcorePath: r.pimcorePath }; }

    const dry = await core.importWebsiteBundle(core.parseWebsiteBundle(wire).bundle, { dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(dry.counts).toMatchObject({ pages: 2, externalPages: 1, snippets: 1, classesCreated: 2, objectsCreated: 2, componentsCreated: 1 });
    expect((await core.listWebsites()).length).toBe(0);
    expect((await core.listDataClasses()).length).toBe(0);

    const done = await core.importWebsiteBundle(core.parseWebsiteBundle(wire).bundle, { assetMap, restorePublication: true });
    expect(done.warnings).toEqual([]);
    const second = await core.buildWebsiteBundle(done.website.id);

    expect(canonical(second)).toEqual(canonical(first));
    expect(second.pages.find((p: any) => p.slug === 'stray').external).toBeUndefined();
    // the ids really are new, and the template points at the new snippet and pages
    const snip = await core.getWhoobeOneSnippet(second.snippets[0].id);
    expect(snip.id).not.toBe(snippet.id);
    const t = (await core.listWebsiteTemplates(done.website.id))[0];
    expect((t.layout as any).header.snippetIds).toEqual([snip.id]);
    expect((t.layout as any).header.pageIds).toHaveLength(2);
    expect(t.locale).toBe('it');
    const pageHome = (await core.listWhoobePages(done.website.id)).find((p: any) => p.slug === 'home');
    expect(pageHome.published).toBe(true);
    expect(pageHome.workflowState).toBe('approved');
    expect(pageHome.themeId).not.toBe(theme.id);
    expect(pageHome.themeId).not.toBeNull();
    expect((await core.getWebsite(done.website.id)).themeId).toBe(pageHome.themeId);
  });

  it('without permission to publish, everything comes in as a draft and the report says so', async () => {
    const site = (await core.listWebsites())[0];
    const wire = JSON.parse(JSON.stringify(await core.buildWebsiteBundle(site.id)));
    const done = await core.importWebsiteBundle(core.parseWebsiteBundle(wire).bundle, {});
    expect(done.warnings.join(' ')).toMatch(/imported as drafts/);
    expect((await core.listWhoobePages(done.website.id)).some((p: any) => p.published || p.workflowState)).toBe(false);
  });

  it('a second import reuses classes, components and objects, and moves an asset that collides', async () => {
    const site = (await core.listWebsites())[0];
    const bundle = await core.buildWebsiteBundle(site.id);
    const wire = JSON.parse(JSON.stringify(bundle));
    // same path, other size: a different file
    await db.getDb().execute(sql.raw(`UPDATE assets SET size_bytes = size_bytes + 1 WHERE pimcore_path = '/site/logo.png'`));
    const dry = await core.importWebsiteBundle(core.parseWebsiteBundle(wire).bundle, { dryRun: true });
    expect(dry.assets.find((a: any) => a.pimcorePath === '/site/logo.png')).toMatchObject({ action: 'conflict', targetPath: '/site/logo-imported.png' });
    expect(dry.assets.find((a: any) => a.pimcorePath === '/site/maker.png').action).toBe('reuse');
    const moved = await addAsset('/site/logo-imported.png', 11);
    const done = await core.importWebsiteBundle(core.parseWebsiteBundle(wire).bundle, { assetMap: { [wire.assets.find((a: any) => a.pimcorePath === '/site/logo.png').id]: { id: moved.id, pimcorePath: moved.pimcorePath } } });
    expect(done.counts).toMatchObject({ classesCreated: 0, classesReused: 2, componentsCreated: 0, objectsCreated: 0, objectsReused: 2 });
    expect((await core.listDataClasses()).length).toBe(2);
    expect((await core.listDataObjects()).length).toBe(2);
    const snippets = (await core.listWhoobeOneSnippets()).filter((s: any) => JSON.stringify(s.node).includes('logo-imported'));
    expect(snippets.length).toBe(1);
    expect(JSON.stringify(snippets[0].node)).toContain(moved.id);
  });

  it('removes what it created when a step fails', async () => {
    const before = (await core.listWebsites()).length;
    const snippetsBefore = (await core.listWhoobeOneSnippets()).length;
    const site = (await core.listWebsites())[0];
    const wire = JSON.parse(JSON.stringify(await core.buildWebsiteBundle(site.id)));
    wire.pages.push({ ...wire.pages[0], id: null }); // same (locale, slug) twice in one website: the unique index refuses it
    await expect(core.importWebsiteBundle(core.parseWebsiteBundle(wire).bundle)).rejects.toThrow();
    expect((await core.listWebsites()).length).toBe(before);
    expect((await core.listWhoobeOneSnippets()).length).toBe(snippetsBefore);
  });
});

describe.skipIf(!url)('website bundle: gateway forms', () => {
  let core: any;
  let db: typeof import('../db/client.js');
  let sql: any;
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('../db/client.js');
    core = {
      ...(await import('../db/websites-records.js')), ...(await import('../db/whoobe-pages-records.js')), ...(await import('../db/gateway-records.js')),
      ...(await import('../gateway/bind-page-content.js')), ...(await import('./index.js')),
    };
    sql = (await import('drizzle-orm')).sql;
  });

  const form = () => ({
    id: 'root', element: 'div', type: 'container', tag: 'document', css: { css: '', container: '' },
    blocks: [{ id: 'f1', element: 'form', type: 'container', tag: 'form', css: { css: '', container: '' }, formConfig: { gatewayEndpointName: 'Contact hook', gatewayRoutePath: 'contact' },
      blocks: [{ id: 'i1', element: 'input', type: 'element', tag: 'input', css: { css: '', container: '' }, data: { attributes: { name: 'email' } }, blocks: [] }] }],
  });

  it('a form comes with a binding of its own for the new website; a missing endpoint is reported', async () => {
    for (const t of ['whoobe_pages', 'websites', 'gateway_bindings', 'gateway_routes', 'gateway_endpoints']) await db.getDb().execute(sql.raw(`TRUNCATE TABLE "${t}" CASCADE`));
    const endpoint = await core.createGatewayEndpoint({ name: 'Contact hook', baseUrl: 'https://hooks.example.com', authType: 'none' });
    await core.createGatewayRoute({ endpointId: endpoint.id, method: 'POST', path: 'contact' });
    const site = await core.createWebsite({ name: 'Forms', rootPath: '/forms' });
    const content = form();
    await core.bindPageGatewayContent(content, site.id);
    const originalBinding = (content.blocks[0] as any).formConfig.gatewayBindingId;
    expect(originalBinding).toBeTruthy();
    await core.createWhoobePage({ slug: 'contact', title: 'Contact', websiteId: site.id, content });

    const wire = JSON.parse(JSON.stringify(await core.buildWebsiteBundle(site.id)));
    const done = await core.importWebsiteBundle(core.parseWebsiteBundle(wire).bundle, {});
    expect(done.warnings.filter((w: string) => /Gateway endpoint/.test(w))).toEqual([]);
    const page = (await core.listWhoobePages(done.website.id))[0];
    const newBinding = (page.content as any).blocks[0].formConfig.gatewayBindingId;
    expect(newBinding).toBeTruthy();
    expect(newBinding).not.toBe(originalBinding);
    const row = await core.getGatewayBindingById(newBinding);
    expect(row).toMatchObject({ websiteId: done.website.id, kind: 'submit', endpointId: endpoint.id });
    expect(row.paramKeys).toContain('email');

    // another installation: the endpoint is not there
    await core.deleteGatewayEndpoint(endpoint.id);
    const dry = await core.importWebsiteBundle(core.parseWebsiteBundle(wire).bundle, { dryRun: true });
    expect(dry.warnings.join(' ')).toMatch(/Gateway endpoint "Contact hook".*does not exist here/);
    const second = await core.importWebsiteBundle(core.parseWebsiteBundle(wire).bundle, {});
    const imported = (await core.listWhoobePages(second.website.id))[0];
    expect((imported.content as any).blocks[0].formConfig.gatewayBindingId, 'a stale binding id is dropped, not kept').toBeUndefined();
  });
});

describe.skipIf(!url)('DAM folders follow the assets', () => {
  let core: any;
  let db: typeof import('../db/client.js');
  let sql: any;
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('../db/client.js');
    core = await import('../db/asset-records.js');
    sql = (await import('drizzle-orm')).sql;
  });
  const asset = (path: string) => ({ pimcorePath: path, filename: path.split('/').pop()!, folderPath: path.slice(0, path.lastIndexOf('/')) || '/', sizeBytes: 1, mimeType: 'image/png', fileType: 'image', s3Key: path.replace(/^\//, ''), isPublic: false, metadata: null });
  const paths = async () => (await core.listFolders()).map((f: any) => `${f.parentPath}>${f.path}`).sort();

  it('storing an asset creates the folder and every ancestor, once, and leaves the root alone', async () => {
    for (const t of ['assets', 'folders']) await db.getDb().execute(sql.raw(`TRUNCATE TABLE "${t}" CASCADE`));
    await core.upsertAssetRecord(asset('/images/blog/cover.png'));
    await core.upsertAssetRecord(asset('/images/blog/second.png'));
    await core.upsertAssetRecord(asset('/top.png'));
    expect(await paths()).toEqual(['/>/images', '/images>/images/blog']);
    expect((await core.listFolders()).find((f: any) => f.path === '/images/blog').name).toBe('blog');
  });

  it('a folder that was customised is not touched', async () => {
    await db.getDb().execute(sql.raw(`UPDATE folders SET is_public = true WHERE path = '/images'`));
    await core.upsertAssetRecord(asset('/images/blog/third.png'));
    expect((await core.listFolders()).find((f: any) => f.path === '/images').isPublic).toBe(true);
  });

  it('repairMissingFolders gives folders to assets that were stored without any', async () => {
    await db.getDb().execute(sql.raw(`TRUNCATE TABLE "folders" CASCADE`));
    expect(await core.listFolders()).toEqual([]);
    expect(await core.repairMissingFolders()).toBe(2);
    expect(await paths()).toEqual(['/>/images', '/images>/images/blog']);
    expect(await core.repairMissingFolders()).toBe(0);
  });
});


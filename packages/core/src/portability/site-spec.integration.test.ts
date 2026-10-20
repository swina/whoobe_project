import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });   // a cold disposable database is slow on the first test

// Needs a DISPOSABLE database (it migrates it and empties tables). Same as roundtrip.integration.test.ts:
//   docker run -d --rm --name pt -e POSTGRES_PASSWORD=pt -p 55432:5432 postgres:16-alpine
//   PORTABILITY_TEST_DATABASE_URL=postgres://postgres:pt@127.0.0.1:55432/postgres pnpm --filter @whoobe-cms/core test site-spec.integration
const url = process.env.PORTABILITY_TEST_DATABASE_URL;
const whoobeDev = JSON.parse(readFileSync(new URL('./fixtures/whoobe-dev.site-spec.json', import.meta.url), 'utf8'));

describe.skipIf(!url)('site specification: expand, import on an installation, export again', () => {
  let db: typeof import('../db/client.js');
  let sql: import('drizzle-orm').SQL | any;
  let core: any;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('../db/client.js');
    await (await import('../db/bootstrap.js')).runMigrations();
    core = {
      ...(await import('../db/themes-records.js')), ...(await import('../db/websites-records.js')), ...(await import('../db/website-templates-records.js')),
      ...(await import('../db/whoobe-pages-records.js')), ...(await import('../db/whoobe-one-snippet-records.js')), ...(await import('./index.js')),
    };
    sql = (await import('drizzle-orm')).sql;
  });
  afterAll(async () => { await db?.closeDb(); });

  const wipe = async () => {
    for (const t of ['whoobe_pages', 'website_templates', 'website_paths', 'websites', 'whoobe_one_snippets', 'themes', 'search_documents', 'content_versions']) {
      await db.getDb().execute(sql.raw(`TRUNCATE TABLE "${t}" CASCADE`));
    }
  };

  /** What the dashboard reads before it expands a spec that points to things by name. */
  const existing = async () => ({
    themes: Object.fromEntries((await core.listThemes()).map((t: any) => [t.name, { id: t.id }])),
    snippets: Object.fromEntries((await core.listWhoobeOneSnippets()).map((s: any) => [s.name, { id: s.id, node: s.node }])),
  });

  const nodes = (n: any): any[] => [n, ...(n.blocks ?? []).flatMap(nodes)];
  type N = any;

  it('imports the site whoobe.dev as drafts with its own name and root path, and its links point at that root path', async () => {
    await wipe();
    await core.createTheme({ name: 'Whoobe Website', colors: [] });
    const benefits = await core.createWhoobeOneSnippet({ name: 'Whoobe Website - Benefits by role', category: 'content', node: { id: 'lib', type: 'container', blocks: [{ id: 'lib-p', type: 'element', element: 'p', content: 'Benefits', blocks: [] }] } });

    const { bundle } = core.expandSiteSpec(whoobeDev, { existing: await existing() });
    const dry = await core.importWebsiteBundle(core.parseWebsiteBundle(JSON.parse(JSON.stringify(bundle))).bundle, { dryRun: true, keepNames: true });
    expect(dry.website).toMatchObject({ name: 'whoobe.dev', rootPath: '/whoobe-dev' });
    expect(dry.counts).toMatchObject({ pages: 5, snippets: 2, themes: 0, templates: 1 });
    expect((await core.listWebsites()).length).toBe(0);

    const done = await core.importWebsiteBundle(core.parseWebsiteBundle(JSON.parse(JSON.stringify(bundle))).bundle, { keepNames: true });
    expect(done.warnings).toEqual([]);
    const site = (await core.listWebsites())[0];
    expect(site).toMatchObject({ name: 'whoobe.dev', rootPath: '/whoobe-dev' });
    const theme = (await core.listThemes())[0];
    expect(site.themeId).toBe(theme.id);

    const pages = await core.listWhoobePages(site.id);
    expect(pages.map((p: any) => p.slug).sort()).toEqual(['/', '/developers', '/platform', '/run', '/security']);
    expect(pages.every((p: any) => p.published === false)).toBe(true);
    const home = pages.find((p: any) => p.slug === '/');
    expect(nodes(home.content).filter((n: N) => n.sourceSnippetId).map((n: N) => n.sourceSnippetId)).toEqual([benefits.id]);

    // every link to a page of the site starts with the root path the website really has
    const own = (await core.listWhoobeOneSnippets()).filter((x: any) => x.name.startsWith('whoobe.dev'));
    const internal = [...pages.map((p: any) => p.content), ...own.map((x: any) => x.node)].flatMap(nodes).filter((n: N) => n.element === 'a' && n.link && !/^(https?:|mailto:|tel:|#)/.test(n.link));
    expect(internal.length).toBeGreaterThan(5);
    expect(internal.filter((n: N) => !(n.link === '/whoobe-dev' || n.link.startsWith('/whoobe-dev/')))).toEqual([]);

    // the layout points at the snippets that were created, not at the ids of the file
    const snippets = (await core.listWhoobeOneSnippets()).filter((s: any) => s.name.startsWith('whoobe.dev'));
    const tpl = (await core.listWebsiteTemplates(site.id))[0];
    expect((tpl.layout as any).header.snippetIds).toEqual([snippets.find((s: any) => s.name === 'whoobe.dev header').id]);
    expect((tpl.layout as any).footer.snippetIds).toEqual([snippets.find((s: any) => s.name === 'whoobe.dev footer').id]);
    expect(tpl.isDefault).toBe(true);

    // a second import under the same root path is refused, in a dry run too, and writes nothing
    for (const dryRun of [true, false]) {
      await expect(core.importWebsiteBundle(core.parseWebsiteBundle(JSON.parse(JSON.stringify(bundle))).bundle, { dryRun, keepNames: true })).rejects.toMatchObject({ status: 409 });
    }
    expect((await core.listWebsites()).length).toBe(1);
    expect((await core.listWhoobeOneSnippets()).length).toBe(3);
  });

  it('keeps the two languages of a page in one translation group', async () => {
    await wipe();
    const spec = {
      version: 1, website: { name: 'Duo', defaultLocale: 'en', supportedLocales: ['en', 'it'] },
      pages: [
        { slug: '/', title: 'Home', sections: [{ kind: 'text', html: 'Hello' }] },
        { slug: '/', title: 'Casa', locale: 'it', sections: [{ kind: 'text', html: 'Ciao' }] },
      ],
    };
    const { bundle } = core.expandSiteSpec(spec);
    await core.importWebsiteBundle(core.parseWebsiteBundle(JSON.parse(JSON.stringify(bundle))).bundle, { keepNames: true });
    const site = (await core.listWebsites())[0];
    const pages = await core.listWhoobePages(site.id);
    expect(pages.map((p: any) => p.locale).sort()).toEqual(['en', 'it']);
    expect(new Set(pages.map((p: any) => p.translationGroupId)).size).toBe(1);
  });

  it('drops a theme id that is neither in the bundle nor here, as before', async () => {
    await wipe();
    const { bundle } = core.expandSiteSpec({ version: 1, website: { name: 'Lost', defaultLocale: 'en', supportedLocales: ['en'] }, pages: [{ slug: '/', title: 'Home', sections: [{ kind: 'text', html: 'x' }] }] });
    const ghost = '00000000-0000-4000-8000-0000000000aa';
    const wire = JSON.parse(JSON.stringify({ ...bundle, website: { ...bundle.website, themeId: ghost }, pages: bundle.pages.map((p: any) => ({ ...p, themeId: ghost })) }));
    await core.importWebsiteBundle(core.parseWebsiteBundle(wire).bundle, { keepNames: true });
    const site = (await core.listWebsites())[0];
    expect(site.themeId).toBeNull();
    expect((await core.listWhoobePages(site.id))[0].themeId).toBeNull();
  });

  it('without keepNames the importer still adds its suffix (copies of a site)', async () => {
    await wipe();
    const { bundle } = core.expandSiteSpec({ version: 1, website: { name: 'Copy', defaultLocale: 'en', supportedLocales: ['en'] }, pages: [{ slug: '/', title: 'Home', sections: [{ kind: 'text', html: 'x' }] }] });
    const done = await core.importWebsiteBundle(core.parseWebsiteBundle(JSON.parse(JSON.stringify(bundle))).bundle, {});
    expect(done.website.rootPath).toMatch(/^\/copy-[0-9a-f]{8}$/);
  });
});

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

  describe('importSiteSpec: what the dashboard calls', () => {
    const spec = (over: Record<string, unknown> = {}): any => ({
      version: 1,
      website: { name: 'Acme', defaultLocale: 'en', supportedLocales: ['en'] },
      theme: { name: 'Acme', colors: [{ name: 'brand', hex: '#7C3AED' }], fonts: [] },
      snippets: [{ key: 'header', name: 'Acme header', category: 'navigation', node: { kind: 'container', children: [{ kind: 'link', text: 'Home', href: '/' }, { kind: 'link', text: 'About', href: '/about' }] } }],
      layout: { header: 'header' },
      pages: [{ slug: '/', title: 'Home', sections: [{ kind: 'text', html: 'Hi' }] }, { slug: '/about', title: 'About', sections: [{ kind: 'text', html: 'About us' }] }],
      ...over,
    });

    it('a check writes nothing and says what would happen, a refused file says where', async () => {
      await wipe();
      const dry = await core.importSiteSpec(spec(), { dryRun: true });
      expect(dry.dryRun).toBe(true);
      expect(dry.conflicts).toEqual([]);
      expect(dry.summary).toMatchObject({ website: { name: 'Acme', rootPath: '/acme', rootPathTaken: false }, theme: { name: 'Acme', action: 'create' }, layout: ['header'] });
      expect(dry.summary.pages.map((p: any) => p.slug)).toEqual(['/', '/about']);
      expect(dry.report.counts).toMatchObject({ pages: 2, snippets: 1, themes: 1 });
      expect(dry.website).toBeUndefined();
      expect((await core.listWebsites()).length).toBe(0);
      expect((await core.listThemes()).length).toBe(0);

      const bad = spec(); bad.pages[0].sections = [{ kind: 'link', text: '', href: '/nowhere' }];
      const err = await core.importSiteSpec(bad, { dryRun: false }).catch((e: any) => e);
      expect(err).toBeInstanceOf(core.SiteSpecError);
      expect(err.issues.map((i: any) => i.where)).toContain('page "Home", section 1, "text"');
      expect((await core.listWebsites()).length).toBe(0);
    });

    it('imports as a draft and leaves existing themes and snippets alone: by default new ones under a free name', async () => {
      await wipe();
      const theme = await core.createTheme({ name: 'Acme', colors: [{ name: 'old', hex: '#000000' }] });
      const snippet = await core.createWhoobeOneSnippet({ name: 'Acme header', category: 'old', node: { id: 'old', blocks: [] } });

      const dry = await core.importSiteSpec(spec(), { dryRun: true });
      expect(dry.conflicts).toEqual([
        { kind: 'theme', name: 'Acme', choice: 'new', createdAs: 'Acme (2)' },
        { kind: 'snippet', name: 'Acme header', choice: 'new', createdAs: 'Acme header (2)' },
      ]);
      const done = await core.importSiteSpec(spec(), {});
      expect(done.dryRun).toBe(false);
      expect(done.website).toMatchObject({ name: 'Acme', rootPath: '/acme' });

      const themes = await core.listThemes();
      expect(themes.map((t: any) => t.name).sort()).toEqual(['Acme', 'Acme (2)']);
      expect(themes.find((t: any) => t.id === theme.id).colors).toEqual([{ name: 'old', hex: '#000000' }]);
      const snippets = await core.listWhoobeOneSnippets();
      expect(snippets.map((s: any) => s.name).sort()).toEqual(['Acme header', 'Acme header (2)']);
      expect(snippets.find((s: any) => s.id === snippet.id).category).toBe('old');

      const site = (await core.listWebsites())[0];
      expect(site.themeId).toBe(themes.find((t: any) => t.name === 'Acme (2)').id);
      const pages = await core.listWhoobePages(site.id);
      expect(pages.length).toBe(2);
      expect(pages.every((p: any) => p.published === false)).toBe(true);
    });

    it('uses the existing theme and snippet when the person chooses to', async () => {
      await wipe();
      const theme = await core.createTheme({ name: 'Acme', colors: [] });
      const snippet = await core.createWhoobeOneSnippet({ name: 'Acme header', category: 'navigation', node: { id: 'hdr', type: 'container', blocks: [{ id: 'hdr-a', type: 'element', element: 'a', content: 'Home', link: '/', blocks: [] }] } });
      const done = await core.importSiteSpec(spec(), { choices: { themes: { Acme: 'existing' }, snippets: { 'Acme header': 'existing' } } });
      expect(done.conflicts.map((c: any) => c.choice)).toEqual(['existing', 'existing']);
      expect((await core.listThemes()).length).toBe(1);
      expect((await core.listWhoobeOneSnippets()).length).toBe(1);
      const site = (await core.listWebsites())[0];
      expect(site.themeId).toBe(theme.id);
      const tpl = (await core.listWebsiteTemplates(site.id))[0];
      expect((tpl.layout as any).header.snippetIds).toEqual([snippet.id]);
    });

    it('refuses a root path the host answers to itself, from the name too', async () => {
      await wipe();
      for (const website of [{ name: 'Acme', rootPath: '/api' }, { name: 'Settings' }]) {
        const bad = spec(); bad.website = { ...bad.website, ...website };
        await expect(core.importSiteSpec(bad, { dryRun: true })).rejects.toThrowError(/answers to itself/);
      }
      // the importer says no on its own as well
      const { bundle } = core.expandSiteSpec({ ...spec(), website: { name: 'X', rootPath: '/editor', defaultLocale: 'en', supportedLocales: ['en'] } });
      await expect(core.importWebsiteBundle(core.parseWebsiteBundle(JSON.parse(JSON.stringify(bundle))).bundle, { keepNames: true })).rejects.toMatchObject({ status: 400 });
      expect((await core.listWebsites()).length).toBe(0);
    });

    it('a root path that is taken is reported in the check and refused on import; a new one is applied to the links too', async () => {
      await wipe();
      await core.importSiteSpec(spec(), {});
      const dry = await core.importSiteSpec(spec(), { dryRun: true });
      expect(dry.summary.website).toMatchObject({ rootPath: '/acme', rootPathTaken: true });
      expect(dry.report).toBeUndefined();
      await expect(core.importSiteSpec(spec(), {})).rejects.toMatchObject({ status: 409 });
      expect((await core.listWebsites()).length).toBe(1);

      const again = await core.importSiteSpec(spec(), { website: { name: 'Acme two', rootPath: '/acme-two' } });
      expect(again.website).toMatchObject({ name: 'Acme two', rootPath: '/acme-two' });
      const site = (await core.listWebsites()).find((w: any) => w.rootPath === '/acme-two');
      const links = (await core.listWhoobePages(site.id)).flatMap((p: any) => nodes(p.content)).filter((n: any) => n.element === 'a');
      expect(links.every((n: any) => n.link.startsWith('/acme-two'))).toBe(true);
      // and a root path that is not valid is an error of the file, like any other
      await expect(core.importSiteSpec(spec(), { dryRun: true, website: { rootPath: 'no slash' } })).rejects.toBeInstanceOf(core.SiteSpecError);
    });
  });
});

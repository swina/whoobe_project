import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });   // a cold disposable database is slow on the first test

// Needs a DISPOSABLE database (it migrates it and empties tables), like portability/roundtrip.integration.test.ts:
//   docker run -d --rm --name pt -e POSTGRES_PASSWORD=pt -p 55433:5432 postgres:16-alpine
//   PORTABILITY_TEST_DATABASE_URL=postgres://postgres:pt@127.0.0.1:55433/postgres pnpm --filter @whoobe-cms/core test wizard.integration
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('template wizard: the site it composes is imported as a draft website', () => {
  let db: typeof import('../db/client.js');
  let sql: any;
  let core: any;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('../db/client.js');
    await (await import('../db/bootstrap.js')).runMigrations();
    core = {
      ...(await import('../db/themes-records.js')), ...(await import('../db/websites-records.js')), ...(await import('../db/website-templates-records.js')),
      ...(await import('../db/whoobe-pages-records.js')), ...(await import('../db/whoobe-one-snippet-records.js')), ...(await import('../portability/index.js')), ...(await import('./index.js')),
    };
    sql = (await import('drizzle-orm')).sql;
  });
  afterAll(async () => { await db?.closeDb(); });

  const wipe = async () => {
    for (const t of ['whoobe_pages', 'website_templates', 'website_paths', 'websites', 'whoobe_one_snippets', 'themes', 'search_documents', 'content_versions']) {
      await db.getDb().execute(sql.raw(`TRUNCATE TABLE "${t}" CASCADE`));
    }
  };
  const nodes = (n: any): any[] => [n, ...(n.blocks ?? []).flatMap(nodes)];

  it('imports a landing page and inner pages with their blocks, a contact form that is not connected, and header and footer around every page', async () => {
    await wipe();
    const spec = core.wizardToSiteSpec({
      name: 'Seaview', sector: 'tourism', context: 'hotel', theme: { background: '#323932' }, accent: '#F5B942', font: 'serif', headerButton: true,
      pages: core.suggestedStructure('tourism'),
    });
    const dry = await core.importSiteSpec(spec, { dryRun: true });
    expect(dry.summary).toMatchObject({ website: { name: 'Seaview', rootPath: '/seaview', rootPathTaken: false }, theme: { name: 'Seaview theme', action: 'create' }, layout: ['header', 'footer'] });
    expect(dry.summary.pages).toHaveLength(4);
    expect((await core.listWebsites()).length).toBe(0);

    const done = await core.importSiteSpec(spec, {});
    const site = (await core.listWebsites())[0];
    expect(site).toMatchObject({ name: 'Seaview', rootPath: '/seaview' });
    const theme = (await core.listThemes())[0];
    expect(theme).toMatchObject({ name: 'Seaview theme' });
    expect(theme.colors.map((c: any) => c.hex)).toContain('#323932');
    expect(site.themeId).toBe(theme.id);

    const pages = await core.listWhoobePages(site.id);
    expect(pages.map((p: any) => p.slug).sort()).toEqual(['/', '/contact', '/rooms', '/the-area']);
    expect(pages.every((p: any) => p.published === false)).toBe(true);

    // the form is a template of fields and sends nowhere
    const contact = pages.find((p: any) => p.slug === '/contact');
    const form = nodes(contact.content).find((n) => n.element === 'form');
    expect(form.formConfig).toMatchObject({ enabled: false, targetClassId: '', notify: { enabled: false, recipientEmail: '' } });
    expect(nodes(form).filter((n) => n.element === 'input' || n.element === 'textarea').map((n) => n.data.attributes.name)).toEqual(['name', 'email', 'message']);

    // every link to a page of the site starts with its root path; the buttons lead to the contact form
    const snippets = (await core.listWhoobeOneSnippets()).filter((s: any) => s.name.startsWith('Seaview'));
    expect(snippets.map((s: any) => s.name).sort()).toEqual(['Seaview footer', 'Seaview header']);
    const links = [...pages.map((p: any) => p.content), ...snippets.map((s: any) => s.node)].flatMap(nodes).filter((n) => n.element === 'a' && n.link && !/^(https?:|mailto:|tel:)/.test(n.link));
    expect(links.length).toBeGreaterThan(10);
    expect(links.filter((n) => !(n.link === '/seaview' || n.link.startsWith('/seaview/')))).toEqual([]);
    expect(links.some((n) => n.link === '/seaview/contact#contact')).toBe(true);

    const tpl = (await core.listWebsiteTemplates(site.id))[0];
    expect(tpl.isDefault).toBe(true);
    expect((tpl.layout as any).header.snippetIds).toEqual([snippets.find((s: any) => s.name === 'Seaview header').id]);
    expect((tpl.layout as any).footer.snippetIds).toEqual([snippets.find((s: any) => s.name === 'Seaview footer').id]);
    expect(done.summary.pages).toHaveLength(4);
  });

  it('uses a snippet of the library in a position, without changing it', async () => {
    await wipe();
    const hero = await core.createWhoobeOneSnippet({ name: 'My hero', category: 'hero', node: { id: 'lib-hero', type: 'container', blocks: [{ id: 'lib-h1', type: 'element', element: 'h', level: 1, content: 'Mine', blocks: [] }] } });
    const spec = core.wizardToSiteSpec({
      name: 'Own', sector: 'it', theme: { preset: 'light' }, font: 'sans',
      pages: [{ title: 'Home', blocks: [{ snippet: 'My hero', category: 'hero' }, { type: 'box-grid-3' }, { type: 'cta' }] }],
    });
    const dry = await core.importSiteSpec(spec, { dryRun: true });
    expect(dry.summary.snippets.filter((s: any) => s.action === 'use-existing').map((s: any) => s.name)).toEqual(['My hero']);
    await core.importSiteSpec(spec, {});
    const site = (await core.listWebsites())[0];
    const page = (await core.listWhoobePages(site.id))[0];
    expect(nodes(page.content).filter((n) => n.sourceSnippetId).map((n) => n.sourceSnippetId)).toEqual([hero.id]);
    // one h1 on the page: the one of the snippet, no band was added
    expect(nodes(page.content).filter((n) => n.element === 'h' && n.level === 1).map((n) => n.content)).toEqual(['Mine']);
    expect((await core.getWhoobeOneSnippet(hero.id)).node.blocks[0].content).toBe('Mine');
    expect((await core.listWhoobeOneSnippets()).filter((s: any) => s.name === 'My hero')).toHaveLength(1);
  });

  it('a company colour that is hard to read still gives a readable site: the palette is stored in the theme', async () => {
    await wipe();
    const spec = core.wizardToSiteSpec({ name: 'Grey', sector: 'consultant', theme: { background: '#808080' }, font: 'sans', pages: [{ title: 'Home', blocks: [{ type: 'hero' }, { type: 'form' }] }] });
    await core.importSiteSpec(spec, {});
    const theme = (await core.listThemes())[0];
    const { contrast } = core;
    const hex = Object.fromEntries(theme.colors.map((c: any) => [c.name, c.hex]));
    expect(contrast(hex.text, hex.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex.accent, hex.background)).toBeGreaterThanOrEqual(3);
  });
});

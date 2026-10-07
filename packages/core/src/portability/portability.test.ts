import { describe, expect, it } from 'vitest';
import {
  collectGatewayEndpointNames, collectAssetPathRefs, collectDataBindingClassNames, collectDependencies, collectUuids, diffClassFields, parseWebsiteBundle,
  planAssets, rewriteAssetPaths, rewriteIds, uniqueAssetPath, type DependencyResolvers,
} from './index.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('ids', () => {
  const tree = { a: [{ pageId: id(1), nested: { snippetIds: [id(2), id(3)] } }], html: `<a href="/public/assets/${id(4)}">x</a>`, n: 5, ok: true, none: null };

  it('collects every uuid, also inside a longer string', () => {
    expect([...collectUuids(tree)].sort()).toEqual([id(1), id(2), id(3), id(4)]);
  });

  it('rewrites known ids only, deep and inside strings, without touching the input', () => {
    const copy = JSON.stringify(tree);
    const out = rewriteIds(tree, new Map([[id(1), id(11)], [id(4), id(14)]]));
    expect(out.a[0].pageId).toBe(id(11));
    expect(out.a[0].nested.snippetIds).toEqual([id(2), id(3)]);
    expect(out.html).toBe(`<a href="/public/assets/${id(14)}">x</a>`);
    expect(out.n).toBe(5);
    expect(out.none).toBeNull();
    expect(JSON.stringify(tree)).toBe(copy);
  });

  it('matches upper-case ids', () => {
    expect(rewriteIds(id(1).toUpperCase(), new Map([[id(1), id(2)]]))).toBe(id(2));
  });
});

describe('data bindings', () => {
  it('finds the class of every binding in an element tree', () => {
    const tree = { blocks: [{ dataBinding: { className: 'Product' } }, { blocks: [{ dataBinding: { className: 'News', objectId: id(1) } }, { dataBinding: null }] }] };
    expect([...collectDataBindingClassNames(tree)].sort()).toEqual(['News', 'Product']);
  });
});

describe('asset paths', () => {
  const lookup = { byPath: new Map([['/uploads/hero.jpg', id(1)], ['/uploads/a b.png', id(2)]]), byKey: new Map([['uploads/hero.jpg', id(1)], ['uploads/a b.png', id(2)]]) };

  it('finds a path used as a whole string and a /dam-asset/ url inside a string', () => {
    const content = { image: { url: '/uploads/hero.jpg' }, style: 'background:url(http://h:3002/dam-asset/uploads/a%20b.png?x=1)', other: '/uploads/none.jpg' };
    expect([...collectAssetPathRefs(content, lookup)].sort()).toEqual([id(1), id(2)]);
  });

  it('rewrites a moved path in both forms', () => {
    const map = new Map([['/uploads/hero.jpg', '/uploads/hero-imported.jpg'], ['/uploads/a b.png', '/uploads/a b-imported.png']]);
    const out = rewriteAssetPaths({ u: '/uploads/hero.jpg', s: 'url(http://h/dam-asset/uploads/a%20b.png?x=1)', k: '/uploads/keep.jpg' }, map);
    expect(out).toEqual({ u: '/uploads/hero-imported.jpg', s: 'url(http://h/dam-asset/uploads/a%20b-imported.png?x=1)', k: '/uploads/keep.jpg' });
  });

  it('builds a free path next to the old one', () => {
    expect(uniqueAssetPath('/a/b.png', new Set(['/a/b.png']))).toBe('/a/b-imported.png');
    expect(uniqueAssetPath('/a/b.png', new Set(['/a/b-imported.png']))).toBe('/a/b-imported-2.png');
    expect(uniqueAssetPath('/a/noext', new Set())).toBe('/a/noext-imported');
    expect(uniqueAssetPath('/a.b/noext', new Set())).toBe('/a.b/noext-imported');
  });
});

describe('asset plan', () => {
  const asset = (n: number, path: string, size: number) => ({ id: id(n), pimcorePath: path, filename: path.split('/').pop()!, mimeType: 'image/png', sizeBytes: size, isPublic: false, metadata: null });
  it('uploads what is new, reuses what is identical, moves what collides', () => {
    const plan = planAssets([asset(1, '/a.png', 10), asset(2, '/b.png', 20), asset(3, '/c.png', 30)], new Map([['/b.png', { id: id(92), sizeBytes: 20 }], ['/c.png', { id: id(93), sizeBytes: 31 }]]));
    expect(plan.map((p) => [p.action, p.targetPath, p.existingId])).toEqual([
      ['upload', '/a.png', undefined], ['reuse', '/b.png', id(92)], ['conflict', '/c-imported.png', id(93)],
    ]);
  });
});

describe('class fields', () => {
  it('reports missing fields and changed types, ignores extra installed fields', () => {
    const installed = [{ name: 'title', fieldType: 'input' }, { name: 'extra', fieldType: 'input' }];
    const incoming = [{ name: 'title', fieldType: 'textarea' }, { name: 'price', fieldType: 'number' }];
    expect(diffClassFields(installed, incoming)).toEqual(['field "title" is input here, textarea in the bundle', 'field "price" is missing here']);
    expect(diffClassFields(installed, [{ name: 'title', fieldType: 'input' }])).toEqual([]);
  });
});

describe('parseWebsiteBundle', () => {
  it('rejects what is not an export', () => {
    expect('error' in parseWebsiteBundle(null)).toBe(true);
    expect('error' in parseWebsiteBundle({ version: 3, website: { name: 'x' } })).toBe(true);
    expect('error' in parseWebsiteBundle({ version: 2, website: {} })).toBe(true);
  });
  it('lifts a version 1 export to a bundle with the new sections empty', () => {
    const r = parseWebsiteBundle({ version: 1, website: { name: 'S', rootPath: '/s', themeId: id(9) }, pages: [{ slug: 'a', locale: 'en', translationGroupId: id(1) }], themes: [{ name: 'T' }] });
    if ('error' in r) throw new Error(r.error);
    expect(r.bundle.version).toBe(2);
    expect(r.bundle.pages[0].id).toBeNull();
    expect(r.bundle.themes[0].id).toBeNull();
    expect(r.bundle.snippets).toEqual([]);
    expect(r.bundle.dataObjects).toEqual([]);
    expect(r.bundle.website.supportedLocales).toEqual(['en']);
  });
});

describe('collectDependencies', () => {
  const page = (n: number, extra: Record<string, unknown> = {}) => ({ id: id(n), translationGroupId: id(n + 500), locale: 'en', slug: `p${n}`, title: `P${n}`, category: '', kind: 'module', published: true, workflowState: null, content: { blocks: [] }, seo: null, sitemap: null, search: null, pimcoreId: null, path: null, themeId: null, websiteId: null, ...extra });
  const snippet = (n: number, node: unknown) => ({ id: id(n), name: `S${n}`, category: 'c', icon: null, node, themeId: null, notes: null, thumbnail: null });
  const cls = { id: id(40), name: 'Product', label: 'Product', fields: [{ name: 'maker', fieldType: 'manyToOneRelation', relationTarget: 'Maker' }, { name: 'parts', fieldType: 'fieldcollections', allowedComponentTypes: ['Spec'] }], viewConfig: null };
  const maker = { id: id(41), name: 'Maker', label: 'Maker', fields: [], viewConfig: null };
  const obj = (n: number, classId: string, attributes: Record<string, unknown>) => ({ id: id(n), classId, key: `o${n}`, path: '/', parentId: null, translationGroupId: id(n + 600), locale: 'en', published: true, workflowState: null, attributes });
  const assetsList = [
    { id: id(70), pimcorePath: '/img/logo.png', s3Key: 'img/logo.png', filename: 'logo.png', mimeType: 'image/png', sizeBytes: 5, isPublic: true, metadata: null },
    { id: id(71), pimcorePath: '/img/maker.png', s3Key: 'img/maker.png', filename: 'maker.png', mimeType: 'image/png', sizeBytes: 6, isPublic: true, metadata: null },
    { id: id(72), pimcorePath: '/img/unused.png', s3Key: 'img/unused.png', filename: 'unused.png', mimeType: 'image/png', sizeBytes: 7, isPublic: true, metadata: null },
  ];
  const store = {
    pages: [page(10), page(11, { websiteId: id(1) })],
    snippets: [snippet(20, { blocks: [{ image: { url: '/img/logo.png' } }, { dataBinding: { className: 'Product' } }] })],
    objects: [obj(50, id(40), { maker: { id: id(51) }, hero: { assetId: id(71) } }), obj(51, id(41), { name: 'ACME' }), obj(52, id(40), { maker: null })],
  };
  const resolvers: DependencyResolvers & { calls: number } = {
    calls: 0,
    async findByIds(ids) {
      this.calls++;
      const s = new Set(ids);
      return { pages: store.pages.filter((p) => s.has(p.id)), snippets: store.snippets.filter((x) => s.has(x.id)), dataObjects: store.objects.filter((o) => s.has(o.id)), themes: [] };
    },
    async getDataClassById(cid) { return [cls, maker].find((c) => c.id === cid) ?? null; },
    async getDataClassByName(name) { return [cls, maker].find((c) => c.name === name) ?? null; },
    async listDataObjectsOfClass(cid) { return store.objects.filter((o) => o.classId === cid); },
    async getDataComponentByName(name) { return name === 'Spec' ? { name: 'Spec', label: 'Spec', fields: [] } : null; },
    async listAssets() { return assetsList; },
  };

  const docs = [{ layout: { header: { pageIds: [id(10)], snippetIds: [id(20)] } } }];

  it('follows layout -> module page and snippet -> data binding -> class, objects, relations, components, assets', async () => {
    const dep = await collectDependencies(docs, new Set(), new Set(), resolvers, { dataObjects: 'all' });
    expect(dep.externalPages.map((p) => p.id)).toEqual([id(10)]);
    expect(dep.externalPages[0].external).toBe(true);
    expect((dep.externalPages[0] as any).websiteId).toBeUndefined();
    expect(dep.snippets.map((s) => s.id)).toEqual([id(20)]);
    expect(dep.dataClasses.map((c) => c.name).sort()).toEqual(['Maker', 'Product']);
    expect(dep.dataComponents.map((c) => c.name)).toEqual(['Spec']);
    expect(dep.dataObjects.map((o) => o.id).sort()).toEqual([id(50), id(51), id(52)]);
    expect(dep.assets.map((a) => a.id).sort()).toEqual([id(70), id(71)]);
  });

  it('with `referenced` takes only the objects reached by id', async () => {
    const dep = await collectDependencies([{ x: id(50) }], new Set(), new Set(), resolvers, { dataObjects: 'referenced' });
    expect(dep.dataObjects.map((o) => o.id).sort()).toEqual([id(50), id(51)]);
    expect(dep.dataClasses.map((c) => c.name).sort()).toEqual(['Maker', 'Product']);
  });

  it('does not export the website\'s own pages as external ones, and stops on cycles', async () => {
    store.snippets.push(snippet(21, { link: id(21) }));
    const dep = await collectDependencies([{ a: id(11), b: id(21) }], new Set([id(11)]), new Set(), resolvers);
    expect(dep.externalPages).toEqual([]);
    expect(dep.snippets.map((s) => s.id)).toEqual([id(21)]);
  });
});

describe('gateway endpoint names', () => {
  it('finds the endpoint of a form and of a binding, at any depth', () => {
    const tree = { blocks: [{ formConfig: { gatewayEndpointName: 'Brevo', gatewayRoutePath: 'contacts' }, blocks: [{ gatewayBinding: { endpointName: 'Products', fieldPath: 'x' } }] }, { formConfig: {}, gatewayBinding: null }] };
    expect([...collectGatewayEndpointNames(tree)].sort()).toEqual(['Brevo', 'Products']);
    expect(collectGatewayEndpointNames({ a: 1 }).size).toBe(0);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applySiteSpecChoices, collectUuids, expandSiteSpec, fillSnippetPlaceholders, parseWebsiteBundle, rewriteIds, SiteSpecError, type SiteSpecExisting } from './index.js';

const whoobeDev = JSON.parse(readFileSync(new URL('./fixtures/whoobe-dev.site-spec.json', import.meta.url), 'utf8'));
const existing: SiteSpecExisting = {
  themes: { 'Whoobe Website': { id: '11111111-1111-4111-8111-111111111111' } },
  snippets: { 'Whoobe Website - Benefits by role': { id: '22222222-2222-4222-8222-222222222222', node: { id: 'lib-1', type: 'container', blocks: [{ id: 'lib-2', type: 'element', element: 'p', content: 'Benefits', blocks: [] }] } } },
};

const small = () => ({
  version: 1 as const,
  website: { name: 'Acme Studio', defaultLocale: 'en', supportedLocales: ['en', 'it'], description: 'A studio' },
  theme: { name: 'Acme', colors: [{ name: 'brand', hex: '#7C3AED' }], fonts: ['Inter'] },
  snippets: [
    { key: 'header', name: 'Acme header', category: 'navigation', node: { kind: 'container' as const, direction: 'row' as const, semantic: 'header' as const, children: [{ kind: 'link' as const, text: 'Home', href: '/' }, { kind: 'link' as const, text: 'GitHub', href: 'https://github.com/x' }] } },
  ],
  layout: { header: 'header' },
  pages: [
    { slug: '/', title: 'Home', sections: [{ kind: 'container' as const, children: [{ kind: 'heading' as const, level: 1 as const, text: 'Hello' }, { kind: 'text' as const, html: 'Hi <strong>you</strong><script>alert(1)</script><img src=x onerror=alert(1)>' }, { kind: 'image' as const, alt: 'A workshop' }, { kind: 'link' as const, text: 'Prices', href: '/pricing#plans' }] }, { kind: 'snippet' as const, use: 'header' }] },
    { slug: '/pricing', title: 'Pricing', sections: [{ kind: 'text' as const, html: 'Prices' }] },
    { slug: '/', title: 'Ciao', locale: 'it', sections: [{ kind: 'text' as const, html: 'Ciao' }] },
  ],
});

/** Every element of a tree, depth first. */
const nodes = (n: any): any[] => [n, ...(n.blocks ?? []).flatMap(nodes)];

describe('expandSiteSpec', () => {
  it('gives a bundle the importer accepts', () => {
    const { bundle } = expandSiteSpec(small());
    const parsed = parseWebsiteBundle(JSON.parse(JSON.stringify(bundle)));
    expect('bundle' in parsed).toBe(true);
    expect(bundle.version).toBe(2);
    expect(bundle.website).toMatchObject({ name: 'Acme Studio', rootPath: '/acme-studio', defaultLocale: 'en', supportedLocales: ['en', 'it'], settings: { description: 'A studio' } });
    expect(bundle.themes).toHaveLength(1);
    expect(bundle.snippets).toHaveLength(1);
    expect(bundle.pages).toHaveLength(3);
    expect(bundle.pages.every((p) => p.published === false && p.kind === 'content')).toBe(true);
  });

  it('creates the website path (menu) linking the pages of the default language by id', () => {
    const { bundle } = expandSiteSpec(small());
    expect(bundle.websitePaths).toHaveLength(1);
    const items = bundle.websitePaths[0].items as { label: string; pageId: string; path: string }[];
    const def = bundle.pages.filter((p) => p.locale === bundle.website.defaultLocale);
    expect(items.map((i) => i.pageId)).toEqual(def.map((p) => p.id));
    expect(items.map((i) => i.path)).toEqual(def.map((p) => p.slug));
    expect(def.every((p) => p.id)).toBe(true);
  });

  it('is deterministic: the same spec gives the same bundle', () => {
    expect(JSON.stringify(expandSiteSpec(small()).bundle)).toBe(JSON.stringify(expandSiteSpec(small()).bundle));
  });

  it('puts the layout snippet in a default template by an id the importer rewrites', () => {
    const { bundle } = expandSiteSpec(small());
    const tpl = bundle.websiteTemplates[0];
    expect(tpl.isDefault).toBe(true);
    const ids = [...collectUuids(tpl.layout)];
    expect(ids).toEqual([bundle.snippets[0].id]);
    const fresh = '99999999-9999-4999-8999-999999999999';
    expect(JSON.stringify(rewriteIds(tpl.layout, new Map([[bundle.snippets[0].id, fresh]])))).toContain(fresh);
  });

  it('links the two languages of a page and keeps the locale', () => {
    const { bundle } = expandSiteSpec(small());
    const [home, , ciao] = bundle.pages;
    expect(home.locale).toBe('en');
    expect(ciao.locale).toBe('it');
    expect(home.translationGroupId).toBe(ciao.translationGroupId);
    expect(bundle.pages[1].translationGroupId).not.toBe(home.translationGroupId);
  });

  it('writes links the way a Whoobe website stores them', () => {
    const { bundle } = expandSiteSpec(small());
    const links = nodes(bundle.snippets[0].node).filter((n) => n.element === 'a');
    expect(links.map((l) => l.link)).toEqual(['/acme-studio', 'https://github.com/x']);
    expect(links[0].linkTarget).toBeUndefined();
    expect(links[1].linkTarget).toBe('_blank');
    const pageLink = nodes(bundle.pages[0].content).find((n) => n.element === 'a');
    expect(pageLink.link).toBe('/acme-studio/pricing#plans');
  });

  it('cleans the formatted text of anything that runs', () => {
    const { bundle } = expandSiteSpec(small());
    const text = nodes(bundle.pages[0].content).find((n) => n.element === 'p');
    expect(text.content).toContain('<strong>you</strong>');
    expect(text.content).not.toMatch(/script|onerror|alert/);
  });

  it('gives an image a placeholder, not an address from the file', () => {
    const { bundle } = expandSiteSpec(small());
    const img = nodes(bundle.pages[0].content).find((n) => n.element === 'img');
    expect(img.image.url).toBe(`https://picsum.photos/seed/${img.id}/1200/800`);
    expect(img.image.alt).toBe('A workshop');
  });

  it('copies a snippet into a page with new ids and the id of its source', () => {
    const { bundle } = expandSiteSpec(small());
    const section = (bundle.pages[0].content as any).blocks[1];
    expect(section.sourceSnippetId).toBe(bundle.snippets[0].id);
    const own = new Set(nodes(bundle.snippets[0].node).map((n) => n.id));
    expect(nodes(section).every((n) => !own.has(n.id))).toBe(true);
  });

  it('gives every element of the bundle a different id', () => {
    const { bundle } = expandSiteSpec(small());
    const all = [...bundle.snippets.map((s) => s.node), ...bundle.pages.map((p) => p.content)].flatMap(nodes).map((n) => n.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('refuses a file that is not valid, with the places', () => {
    const bad = small();
    (bad.pages[0].sections[0] as any).children[3].text = '';
    try { expandSiteSpec(bad); expect.unreachable(); } catch (e) {
      expect(e).toBeInstanceOf(SiteSpecError);
      expect((e as SiteSpecError).issues[0].where).toBe('page "Home", section 1, element 4, "text"');
    }
  });

  it('uses a theme and a snippet that exist here, and says which it used', () => {
    const spec: any = { ...small(), theme: { use: 'Whoobe Website' }, snippets: [...small().snippets, { key: 'benefits', use: 'Whoobe Website - Benefits by role' }] };
    spec.pages[1].sections.push({ kind: 'snippet', use: 'benefits' });
    const { bundle, references } = expandSiteSpec(spec, { existing });
    expect(bundle.themes).toHaveLength(0);
    expect(bundle.website.themeId).toBe('11111111-1111-4111-8111-111111111111');
    expect(bundle.snippets).toHaveLength(1);
    expect(references).toEqual({ themes: ['Whoobe Website'], snippets: ['Whoobe Website - Benefits by role'] });
    const copy = (bundle.pages[1].content as any).blocks[1];
    expect(copy.sourceSnippetId).toBe('22222222-2222-4222-8222-222222222222');
    expect(copy.id).not.toBe('lib-1');
  });

  it('names a theme or snippet that does not exist here', () => {
    const spec: any = { ...small(), theme: { use: 'Nope' } };
    expect(() => expandSiteSpec(spec, { existing })).toThrowError(/no theme named "Nope"/);
    const spec2: any = { ...small(), snippets: [{ key: 'x', use: 'Nope' }], layout: undefined };
    spec2.pages = [{ slug: '/', title: 'Home', sections: [{ kind: 'snippet', use: 'x' }] }];
    expect(() => expandSiteSpec(spec2, { existing })).toThrowError(/no snippet named "Nope"/);
  });
});

describe('the specification of the site whoobe.dev', () => {
  it('is valid and expands to a bundle the importer accepts', () => {
    const { bundle, references } = expandSiteSpec(whoobeDev, { existing });
    expect(bundle.pages.map((p) => p.slug)).toEqual(['/', '/platform', '/security', '/run', '/developers']);
    expect(bundle.snippets.map((s) => s.name)).toEqual(['whoobe.dev header', 'whoobe.dev footer']);
    expect(references.snippets).toEqual(['Whoobe Website - Benefits by role']);
    expect('bundle' in parseWebsiteBundle(JSON.parse(JSON.stringify(bundle)))).toBe(true);
  });

  it('has no link or button without its text (the bug of 2026-10-20) and no link without a target', () => {
    const { bundle } = expandSiteSpec(whoobeDev, { existing });
    const all = [...bundle.snippets.map((s) => s.node), ...bundle.pages.map((p) => p.content)].flatMap(nodes);
    const links = all.filter((n) => n.element === 'a');
    expect(links.length).toBeGreaterThan(40);
    expect(links.filter((l) => !String(l.content).trim())).toEqual([]);
    expect(links.filter((l) => !l.link)).toEqual([]);
  });

  it('keeps links to the pages of the site under the root path', () => {
    const { bundle } = expandSiteSpec(whoobeDev, { existing });
    const links = nodes(bundle.snippets[0].node).filter((n) => n.element === 'a').map((n) => n.link);
    expect(links).toContain('/whoobe-dev');
    expect(links).toContain('/whoobe-dev/platform');
    expect(links).toContain('/whoobe-dev/blog');
  });
});

describe('applySiteSpecChoices (D10: the person decides, nothing existing is touched)', () => {
  const clash = (): any => ({ ...small(), theme: { name: 'Whoobe Website', colors: [], fonts: [] }, snippets: [{ ...small().snippets[0], name: 'Whoobe Website - Benefits by role' }] });

  it('creates new ones under a free name by default', () => {
    const { spec, conflicts } = applySiteSpecChoices(clash(), existing);
    expect(spec.theme).toMatchObject({ name: 'Whoobe Website (2)' });
    expect(spec.snippets![0].name).toBe('Whoobe Website - Benefits by role (2)');
    expect(conflicts).toEqual([
      { kind: 'theme', name: 'Whoobe Website', choice: 'new', createdAs: 'Whoobe Website (2)' },
      { kind: 'snippet', name: 'Whoobe Website - Benefits by role', choice: 'new', createdAs: 'Whoobe Website - Benefits by role (2)' },
    ]);
  });

  it('uses the existing ones when the person says so, and the spec then points at them', () => {
    const { spec, conflicts } = applySiteSpecChoices(clash(), existing, { themes: { 'Whoobe Website': 'existing' }, snippets: { 'Whoobe Website - Benefits by role': 'existing' } });
    expect(spec.theme).toEqual({ use: 'Whoobe Website' });
    expect(spec.snippets![0]).toEqual({ key: 'header', use: 'Whoobe Website - Benefits by role' });
    expect(conflicts.map((c) => c.choice)).toEqual(['existing', 'existing']);
    const { bundle } = expandSiteSpec(spec, { existing });
    expect(bundle.themes).toHaveLength(0);
    expect(bundle.snippets).toHaveLength(0);
  });

  it('skips a free name that is taken by another snippet of the file', () => {
    const spec = clash();
    spec.snippets.push({ key: 'footer', name: 'Whoobe Website - Benefits by role (2)', category: 'x', node: spec.snippets[0].node });
    const { spec: out } = applySiteSpecChoices(spec, existing);
    expect(out.snippets![0].name).toBe('Whoobe Website - Benefits by role (3)');
  });

  it('leaves a file without clashes as it is and does not change its input', () => {
    const s = small();
    const copy = JSON.stringify(s);
    const { spec, conflicts } = applySiteSpecChoices(s, existing);
    expect(conflicts).toEqual([]);
    expect(JSON.stringify(spec)).toBe(copy);
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe('a form in a specification', () => {
  const withForm = (over: Record<string, unknown> = {}): any => {
    const spec = small();
    (spec.pages[1].sections as any[]).push({ kind: 'form', fields: [{ name: 'name', label: 'Your name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'phone', label: 'Phone', type: 'phone' }, { name: 'message', label: 'Message', type: 'textarea' }], submitLabel: 'Send', css: 'p-6', fieldCss: 'rounded border p-2', labelCss: 'text-sm', buttonCss: 'px-4 py-2', ...over });
    return spec;
  };
  const formOf = (spec: any) => nodes(expandSiteSpec(spec).bundle.pages[1].content).find((n) => n.element === 'form');

  it('becomes the Form element of the editor with its fields, labels and button', () => {
    const form = formOf(withForm());
    expect(form).toMatchObject({ type: 'container', tag: 'form', semantic: 'form' });
    const inputs = nodes(form).filter((n) => n.element === 'input' || n.element === 'textarea');
    expect(inputs.map((n) => [n.element, n.data.attributes.name, n.data.attributes.type ?? n.type])).toEqual([['input', 'name', 'text'], ['input', 'email', 'email'], ['input', 'phone', 'tel'], ['textarea', 'message', 'textarea']]);
    expect(inputs.slice(0, 2).every((n) => n.data.attributes.required === true)).toBe(true);
    // each label points at its own control
    const labels = nodes(form).filter((n) => n.element === 'label');
    expect(labels.map((l) => l.content)).toEqual(['Your name', 'Email', 'Phone', 'Message']);
    expect(labels.map((l) => l.data.attributes.for)).toEqual(inputs.map((n) => n.data.attributes.id));
    expect(new Set(inputs.map((n) => n.data.attributes.id)).size).toBe(4);
    const button = nodes(form).find((n) => n.element === 'button');
    expect(button).toMatchObject({ tag: 'submit', content: 'Send', data: { attributes: { type: 'submit' } } });
    expect(form.css.css).toContain('p-6');
    expect(inputs[0].css.css).toBe('rounded border p-2');
  });

  it('is created disconnected: no target, no redirect, no notification, no action, nothing that sends', () => {
    const form = formOf(withForm());
    expect(form.formConfig).toEqual({ enabled: false, targetClassId: '', successMessage: '', errorMessage: '', successRedirectUrl: '', errorRedirectUrl: '', notify: { enabled: false, mailTemplateId: '', templatePageId: '', recipientEmail: '', subject: '' } });
    expect(form.data.attributes.action).toBe('');
    expect(form.formConfig.gatewayBindingId).toBeUndefined();
    expect(form.formConfig.gatewayEndpointName).toBeUndefined();
    // and no element of the form carries a link, a target or a data binding
    const everything = JSON.stringify(nodes(form));
    expect(everything).not.toMatch(/"(link|dataBinding|gatewayBindingId|targetClassId)":"[^"]/);
    expect(nodes(form).every((n) => !n.link && n.dataBinding === null)).toBe(true);
  });

  it('cannot be told where to send, whatever the file says', () => {
    for (const key of ['action', 'target', 'targetClassId', 'recipientEmail', 'notify', 'formConfig', 'endpoint']) {
      expect(() => expandSiteSpec(withForm({ [key]: 'x' }))).toThrowError(SiteSpecError);
    }
  });
});

describe('where the classes go, for the editor', () => {
  it('a container keeps its structure in css.container and the classes of the file in css.css, like an element the editor makes', () => {
    const spec = small();
    (spec.pages[0].sections as any[]).push({ kind: 'container', direction: 'row', css: 'gap-6 p-4 bg-[#123456]', children: [{ kind: 'text', html: 'x', css: 'text-sm' }] });
    const box = nodes(expandSiteSpec(spec).bundle.pages[0].content).find((n) => n.css.css.includes('bg-[#123456]'));
    expect(box.css).toEqual({ css: 'gap-6 p-4 bg-[#123456]', container: 'flex flex-row' });
    expect(nodes(expandSiteSpec(spec).bundle.pages[0].content)[0].css.container).toBe('flex flex-col');
  });

  it('a form and its field wrappers do the same', () => {
    const spec = small();
    (spec.pages[1].sections as any[]).push({ kind: 'form', fields: [{ name: 'a', label: 'A', type: 'text' }], submitLabel: 'Send', css: 'p-6' });
    const form = nodes(expandSiteSpec(spec).bundle.pages[1].content).find((n) => n.element === 'form');
    expect(form.css).toEqual({ css: 'gap-4 p-6', container: 'flex flex-col' });
    expect(form.blocks[0].css).toEqual({ css: 'gap-1', container: 'flex flex-col' });
  });
});

describe('fillSnippetPlaceholders', () => {
  const vars = { name: 'Acme <b>Ltd', context: 'hotel', thing: 'hotel', sector: 'Tourism' };

  it('fills {name}, {context}, {thing} and {sector} in the texts, with plain text, and leaves an unknown placeholder', () => {
    const out = fillSnippetPlaceholders({ content: 'Hi {name}, your {context} / {thing} in {sector} {other}', image: { alt: 'View of {name}', src: '/a/{name}.png' } }, vars);
    expect(out.content).toBe('Hi Acme bLtd, your hotel / hotel in Tourism {other}');   // `<` and `>` of the value are removed
    expect(out.image.alt).toBe('View of Acme bLtd');
    expect(out.image.src).toBe('/a/{name}.png');
  });

  it('leaves ids, kinds, classes, styles and links alone, and does not change its input', () => {
    const node = { id: '{name}', type: 'element', css: { css: 'w-{name}' }, style: '{name}', link: '/{name}', blocks: [{ content: '{name}' }] };
    const copy = JSON.stringify(node);
    expect(fillSnippetPlaceholders(node, vars)).toEqual({ ...node, blocks: [{ content: 'Acme bLtd' }] });
    expect(JSON.stringify(node)).toBe(copy);
  });
});

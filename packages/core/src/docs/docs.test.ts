import { describe, it, expect } from 'vitest';
import { parseDocument } from './front-matter.js';
import { renderMarkdown, slugify, resolveRelative, type RenderContext } from './markdown.js';
import { buildAutoNav, buildManualNav, parseNavYaml, docRouteOf, flattenNav, prevNext, breadcrumbs, type DocEntry } from './navigation.js';

const ctx = (currentPath = 'guide/install.md'): RenderContext => ({
  currentPath,
  docRoute: (p) => ({ 'guide/usage.md': '/guide/usage', 'index.md': '/', 'api/index.md': '/api/' } as Record<string, string>)[p] ?? null,
  assetUrl: (p) => ({ 'img/a b.png': '/dam-asset/docs/img/a%20b.png', 'files/x.pdf': '/dam-asset/docs/files/x.pdf' } as Record<string, string>)[p] ?? null,
});

describe('parseDocument', () => {
  it('reads the front matter and leaves the body', () => {
    const r = parseDocument('---\ntitle: Install\norder: 20\nhidden: true\nslug: setup\ndescription: Short\n---\n# Hello\n');
    expect(r.frontMatter).toEqual({ title: 'Install', order: 20, hidden: true, slug: 'setup', description: 'Short' });
    expect(r.body).toBe('# Hello\n');
    expect(r.warnings).toEqual([]);
  });
  it('a file without front matter is all body; a BOM and CRLF are tolerated', () => {
    expect(parseDocument('# T\ntext').body).toBe('# T\ntext');
    expect(parseDocument('﻿---\r\ntitle: A\r\n---\r\nbody').frontMatter.title).toBe('A');
  });
  it('bad values are ignored with a warning, bad YAML never throws', () => {
    const r = parseDocument('---\norder: soon\nslug: "a b/../c"\nhidden: maybe\n---\nx');
    expect(r.frontMatter).toEqual({});
    expect(r.warnings.length).toBe(3);
    const bad = parseDocument('---\ntitle: [unclosed\n---\nbody');
    expect(bad.frontMatter).toEqual({});
    expect(bad.body).toBe('body');
    expect(bad.warnings[0]).toMatch(/front matter ignored/);
  });
});

describe('slugify / resolveRelative', () => {
  it('slugifies headings', () => {
    expect(slugify('Install & run it!')).toBe('install-run-it');
    expect(slugify('Città è bella')).toBe('citta-e-bella');
    expect(slugify('日本語 title')).toBe('日本語-title');
    expect(slugify('???')).toBe('section');
  });
  it('resolves relative paths and refuses to leave the folder', () => {
    expect(resolveRelative('guide/install.md', 'usage.md')).toBe('guide/usage.md');
    expect(resolveRelative('guide/install.md', '../img/a.png')).toBe('img/a.png');
    expect(resolveRelative('guide/install.md', './x/./y.md')).toBe('guide/x/y.md');
    expect(resolveRelative('guide/install.md', '../../etc/passwd')).toBeNull();
    expect(resolveRelative('install.md', '../x.md')).toBeNull();
  });
});

describe('renderMarkdown', () => {
  it('headings get stable unique ids and an anchor; the list is returned', () => {
    const r = renderMarkdown('# Title\n\n## Setup\n\n## Setup\n\n### Sub *part*', ctx());
    expect(r.headings).toEqual([
      { depth: 1, text: 'Title', id: 'title' }, { depth: 2, text: 'Setup', id: 'setup' },
      { depth: 2, text: 'Setup', id: 'setup-1' }, { depth: 3, text: 'Sub part', id: 'sub-part' },
    ]);
    expect(r.html).toContain('<h2 id="setup-1">Setup<a class="doc-anchor" href="#setup-1"');
  });
  it('rewrites links to documents and assets, keeps external ones, flags the broken ones', () => {
    const r = renderMarkdown('[u](usage.md#top) [root](../index.md) [api](../api/index.md) [pdf](../files/x.pdf) [ext](https://example.org/a) [mail](mailto:a@b.co) [gone](nope.md) ![i](../img/a%20b.png) ![gone](none.png)', ctx());
    expect(r.html).toContain('href="/guide/usage#top" data-doc="1"');
    expect(r.html).not.toMatch(/href="https:[^>]*data-doc/);   // only the addresses inside the site are marked
    expect(r.html).toContain('href="/"');
    expect(r.html).toContain('href="/api/"');
    expect(r.html).toContain('href="/dam-asset/docs/files/x.pdf"');
    expect(r.html).toContain('<a href="https://example.org/a" rel="noopener noreferrer">ext</a>');
    expect(r.html).toContain('href="mailto:a@b.co"');
    expect(r.html).toContain('src="/dam-asset/docs/img/a%20b.png"');
    expect(r.warnings.some((w) => w.includes('nope.md'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('none.png'))).toBe(true);
  });
  it('removes dangerous addresses', () => {
    const r = renderMarkdown('[a](javascript:alert(1)) [b](JaVa\nScRiPt:alert(1)) [c](data:text/html,x) [d](//evil.example/x) [e](vbscript:x) ![f](data:image/png;base64,AAA) ![g](javascript:x)', ctx());
    expect(r.html).not.toMatch(/javascript:|vbscript:|data:|\/\/evil/i);
    expect(r.html).toContain('href="#"');
  });
  it('raw HTML: a block is sanitised, scripts and handlers die, inline fragments are shown as text', () => {
    const r = renderMarkdown('<div onclick="x()"><script>alert(1)</script><b>ok</b></div>\n\ntext <img src=x onerror=alert(1)> more', ctx());
    expect(r.html).not.toMatch(/<script/i);
    expect(r.html).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i);    // a real tag with a handler (escaped text is inert)
    expect(r.html).not.toContain('<img');
    expect(r.html).toContain('<b>ok</b>');
    expect(r.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
  it('an XSS corpus never produces an executable tag, handler or script URL', () => {
    const corpus = ['<img src=x onerror=alert(1)>', '<svg onload=alert(1)>', '<iframe src="javascript:alert(1)"></iframe>', '"><script>alert(1)</script>',
      '[x](javascript:alert(1))', '![x](javascript:alert(1))', '<a href="javascript:alert(1)">x</a>', '`<script>alert(1)</script>`',
      '```html\n<script>alert(1)</script>\n```', '# <img src=x onerror=alert(1)>', '[x](<javascript:alert(1)>)', '<details open ontoggle=alert(1)>',
      ':::tip <img src=x onerror=alert(1)>\nbody\n:::'];
    for (const x of corpus) {
      const { html } = renderMarkdown(x, ctx());
      const stripped = html.replace(/<pre[\s\S]*?<\/pre>/g, '');   // code is escaped text, inert
      expect(stripped, x).not.toMatch(/<(script|iframe|svg|object|embed|form|style|link|meta)\b/i);
      expect(stripped, x).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i);
      expect(html, x).not.toMatch(/(href|src)="\s*javascript:/i);
    }
  });
  it('code blocks are escaped and carry their language', () => {
    const r = renderMarkdown('```ts\nconst a = "<b>" && 1\n```\n\n```$$$\nx\n```', ctx());
    expect(r.html).toContain('<pre class="doc-code"><code class="language-ts">const a = &quot;&lt;b&gt;&quot; &amp;&amp; 1</code></pre>');
    expect(r.html).toContain('<code>x</code>');
  });
  it('admonitions, tables and task lists', () => {
    const r = renderMarkdown(':::warning Careful\nDo not **do** this\n:::\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo', ctx());
    expect(r.html).toContain('<div class="doc-admonition doc-admonition-warning"><p class="doc-admonition-title">Careful</p>');
    expect(r.html).toContain('<strong>do</strong>');
    expect(r.html).toContain('<table>');
    expect(r.html).toContain('type="checkbox"');
  });
  it('gives plain text for the search index (no markup, no html, headings and code included)', () => {
    const r = renderMarkdown('# Title\n\nSome **bold** and `code`.\n\n- one\n- two\n\n<div>hidden html</div>\n\n```\nnpm install\n```\n', ctx());
    expect(r.text).toContain('Title');
    expect(r.text).toContain('Some bold and code.');
    expect(r.text).toContain('one');
    expect(r.text).toContain('npm install');
    expect(r.text).not.toMatch(/[*`<>]|hidden html/);
  });
});

const doc = (path: string, fm: DocEntry['frontMatter'] = {}, firstHeading?: string): DocEntry => ({ path, frontMatter: fm, firstHeading });

describe('addresses', () => {
  it('drops the extension and numeric prefixes; index and README stand for the folder; slug wins', () => {
    expect(docRouteOf(doc('index.md'))).toBe('/');
    expect(docRouteOf(doc('guide/01-install.md'))).toBe('/guide/install');
    expect(docRouteOf(doc('02-guide/README.md'))).toBe('/guide/');
    expect(docRouteOf(doc('guide/install.md', { slug: 'setup' }))).toBe('/guide/setup');
  });
});

describe('automatic index (from the tree of files)', () => {
  const docs = [
    doc('index.md', { title: 'Welcome' }),
    doc('guide/index.md', { title: 'Guides' }),
    doc('guide/02-usage.md', {}, 'Using it'),
    doc('guide/01-install.md', { title: 'Install' }),
    doc('guide/hidden.md', { hidden: true }),
    doc('api/endpoints.md'),
    doc('api/auth.md', { order: 1 }),
    doc('changelog.md'),
    doc('10-faq.md'), doc('2-intro.md'),
  ];
  const nav = buildAutoNav(docs);
  it('folders are sections, a landing file is the section page, ordering by order then natural name', () => {
    expect(nav.items.map((n) => n.title)).toEqual(['Welcome', 'Intro', 'Faq', 'Api', 'Changelog', 'Guides']);
    const guides = nav.items.find((n) => n.title === 'Guides') as any;
    expect(guides.route).toBe('/guide/');
    expect(guides.items.map((n: any) => n.title)).toEqual(['Install', 'Using it']);
    const api = nav.items.find((n) => n.title === 'Api') as any;
    expect(api.items.map((n: any) => n.title)).toEqual(['Auth', 'Endpoints']);
  });
  it('hidden documents are not listed; a clash of addresses is reported', () => {
    expect(JSON.stringify(nav.items)).not.toContain('hidden.md');
    const clash = buildAutoNav([doc('a/x.md'), doc('a/x.markdown')]);
    expect(clash.warnings[0]).toMatch(/same address/);
  });
  it('reading order, previous/next and breadcrumbs follow the index', () => {
    expect(flattenNav(nav.items).map((p) => p.path).slice(0, 3)).toEqual(['index.md', '2-intro.md', '10-faq.md']);
    const { prev, next } = prevNext(nav.items, 'guide/01-install.md');
    expect(prev?.route).toBe('/guide/');
    expect(next?.route).toBe('/guide/usage');
    expect(prevNext(nav.items, 'index.md').prev).toBeNull();
    expect(breadcrumbs(nav.items, 'guide/02-usage.md').map((b) => b.title)).toEqual(['Guides', 'Using it']);
  });
});

describe('manual index (_nav.yml)', () => {
  const docs = [doc('a.md', { title: 'A' }), doc('b.md', { title: 'B' }), doc('c/d.md', { title: 'D' }), doc('h.md', { hidden: true })];
  it('parses the YAML and reports problems instead of throwing', () => {
    const ok = parseNavYaml('- title: Start\n  items:\n    - doc: a.md\n    - doc: /c/d.md\n      title: Dee\n- link: https://example.org\n  title: Site\n');
    expect(ok.errors).toEqual([]);
    expect(ok.entries[0].items?.[1]).toEqual({ doc: 'c/d.md', title: 'Dee' });
    expect(parseNavYaml('- title: [x').errors[0]).toMatch(/not valid YAML/);
    expect(parseNavYaml('title: x').errors[0]).toMatch(/must be a list/);
    expect(parseNavYaml('- link: javascript:alert(1)').errors[0]).toMatch(/link must start/);
    expect(parseNavYaml('- nonsense: 1').errors[0]).toMatch(/entry 1/);
  });
  it('applies it to the existing documents, warns about missing entries, collects the rest under Other', () => {
    const { entries } = parseNavYaml('- title: Start\n  items:\n    - doc: a.md\n    - doc: nope.md\n- link: https://example.org\n');
    const nav = buildManualNav(entries, docs);
    expect(nav.items[0]).toMatchObject({ type: 'section', title: 'Start' });
    expect((nav.items[0] as any).items).toHaveLength(1);
    expect(nav.items[1]).toMatchObject({ type: 'link', href: 'https://example.org' });
    const other = nav.items[2] as any;
    expect(other.title).toBe('Other');
    expect(other.items.map((n: any) => n.path)).toEqual(['b.md', 'c/d.md']);   // hidden.md stays out
    expect(nav.warnings.some((w) => w.includes('nope.md'))).toBe(true);
    expect(nav.warnings.some((w) => w.includes('not in the index'))).toBe(true);
  });
});

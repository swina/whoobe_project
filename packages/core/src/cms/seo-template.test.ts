import { describe, it, expect } from 'vitest';
import {
  applySeoTemplate,
  resolveSeoTemplates,
  seoHasTokens,
  seoAssetIds,
  findSeoBindings,
  pickSeoBinding,
  substituteBindingFilters,
} from './seo-template.js';

const record = {
  id: 'r1',
  key: 'my-post',
  locale: 'it',
  attributes: {
    title: 'Hello <b>World</b>&nbsp;&amp; co',
    abstract: 'A short abstract',
    tags: ['a', 'b'],
    views: 42,
    cover: { assetId: 'asset-1' },
    link: { path: '/x', text: 'X', target: null },
  },
};

describe('applySeoTemplate', () => {
  it('fills record attributes, stripping markup and decoding entities', () => {
    expect(applySeoTemplate('{title} | Blog', { record })).toBe('Hello World & co | Blog');
  });

  it('accepts a {Class.field} token (class prefix ignored)', () => {
    expect(applySeoTemplate('{Blog.abstract}', { record })).toBe('A short abstract');
  });

  it('reads top-level columns and falls back to URL params', () => {
    expect(applySeoTemplate('{key}/{slug}', { record, urlParams: { slug: 'from-url' } })).toBe('my-post/from-url');
  });

  it('prefers the record over a same-named URL param', () => {
    expect(applySeoTemplate('{abstract}', { record, urlParams: { abstract: 'url' } })).toBe('A short abstract');
  });

  it('stringifies arrays and numbers, uses link paths, resolves assets via assetUrls', () => {
    expect(applySeoTemplate('{tags} {views} {link}', { record })).toBe('a, b 42 /x');
    expect(applySeoTemplate('{cover}', { record, assetUrls: { 'asset-1': 'https://cdn/x.jpg' } })).toBe('https://cdn/x.jpg');
    expect(applySeoTemplate('{cover}', { record })).toBe('');
  });

  it('turns an unresolvable token into nothing instead of leaking it', () => {
    expect(applySeoTemplate('Title: {nope} end', { record })).toBe('Title: end');
    expect(applySeoTemplate('{title}', {})).toBe('');
  });

  it('returns a token-free string untouched', () => {
    expect(applySeoTemplate('  plain  text ', { record })).toBe('  plain  text ');
  });
});

describe('resolveSeoTemplates', () => {
  it('resolves every templated field and JSON-LD strings, leaving the rest', () => {
    const seo = {
      metaTitle: '{title}',
      metaDescription: '{abstract}',
      canonicalUrl: 'https://site.com/blog/{slug}',
      ogImage: '{cover}',
      robots: { index: true, follow: true },
      structuredData: { '@type': 'Article', headline: '{title}', nested: { a: ['{abstract}'] } },
    };
    const out = resolveSeoTemplates(seo, { record, urlParams: { slug: 'my-post' }, assetUrls: { 'asset-1': 'https://cdn/x.jpg' } })!;
    expect(out.metaTitle).toBe('Hello World & co');
    expect(out.metaDescription).toBe('A short abstract');
    expect(out.canonicalUrl).toBe('https://site.com/blog/my-post');
    expect(out.ogImage).toBe('https://cdn/x.jpg');
    expect(out.robots).toEqual({ index: true, follow: true });
    expect(out.structuredData).toEqual({ '@type': 'Article', headline: 'Hello World & co', nested: { a: ['A short abstract'] } });
    expect(seo.metaTitle).toBe('{title}'); // input not mutated
  });

  it('nulls a field that resolves to nothing so consumers fall back with ??', () => {
    const out = resolveSeoTemplates({ metaTitle: '{title}' }, { record: null })!;
    expect(out.metaTitle).toBeNull();
  });

  it('returns a static config as-is and null for no config', () => {
    const seo = { metaTitle: 'Static' };
    expect(resolveSeoTemplates(seo, { record })).toBe(seo);
    expect(resolveSeoTemplates(null, { record })).toBeNull();
  });
});

describe('seoHasTokens / seoAssetIds', () => {
  it('detects tokens in fields and structured data', () => {
    expect(seoHasTokens({ metaTitle: 'x' })).toBe(false);
    expect(seoHasTokens({ ogTitle: '{title}' })).toBe(true);
    expect(seoHasTokens({ structuredData: { a: { b: '{x}' } } })).toBe(true);
    expect(seoHasTokens(null)).toBe(false);
  });

  it('lists the asset ids a template needs', () => {
    expect(seoAssetIds({ ogImage: '{cover}', metaTitle: '{title}' }, record)).toEqual(['asset-1']);
    expect(seoAssetIds({ metaTitle: '{title}' }, record)).toEqual([]);
  });
});

describe('binding selection', () => {
  const content = {
    id: 'root',
    blocks: [
      { id: 'list', dataBinding: { className: 'Blog', resolveMode: 'query', target: 'x' } },
      {
        id: 'article',
        dataBinding: { className: 'Blog', resolveMode: 'first', target: 'x', filters: [{ field: 'slug', operator: 'eq', value: '{slug}' }, { field: 'k', operator: 'eq', value: 'fixed' }] },
        blocks: [{ id: 'inner', dataBinding: { className: 'Author', resolveMode: 'explicit', objectId: 'o1', target: 'x' } }],
      },
      { id: 'ctx', dataBinding: { className: 'Blog', resolveMode: 'parent', target: 'x' } },
    ],
  };

  it('lists record and query bindings with their kind, in document order (context-relative ones are not sources)', () => {
    expect(findSeoBindings(content).map((b) => [b.nodeId, b.kind])).toEqual([
      ['list', 'list'],
      ['article', 'record'],
      ['inner', 'record'],
    ]);
  });

  it('treats a query filtered by a URL {param} as a dynamic (single-record) binding', () => {
    const dynamicPage = {
      id: 'root',
      blocks: [
        { id: 'related', dataBinding: { className: 'Blog', resolveMode: 'query', target: 'x', filters: [] } },
        { id: 'article', dataBinding: { className: 'Blog', resolveMode: 'query', target: 'x', filters: [{ field: 'slug', operator: 'eq', value: '{slug}' }] } },
        { id: 'latest', dataBinding: { className: 'Blog', resolveMode: 'query', target: 'x' } },
      ],
    };
    expect(findSeoBindings(dynamicPage).map((b) => [b.nodeId, b.kind])).toEqual([['related', 'list'], ['article', 'dynamic'], ['latest', 'list']]);
    expect(pickSeoBinding(dynamicPage)?.nodeId).toBe('article'); // skips the earlier plain list
  });

  it('auto-picks the first record/dynamic binding, honours an explicit choice (even a list), and has no auto source for list-only pages', () => {
    expect(pickSeoBinding(content)?.nodeId).toBe('article');
    expect(pickSeoBinding(content, 'inner')?.nodeId).toBe('inner');
    expect(pickSeoBinding(content, 'list')?.nodeId).toBe('list');
    expect(pickSeoBinding(content, 'gone')?.nodeId).toBe('article');
    expect(pickSeoBinding({ id: 'x', blocks: [{ id: 'l', dataBinding: { className: 'Blog', resolveMode: 'query', target: 'x' } }] })).toBeNull();
    expect(pickSeoBinding({ id: 'x', blocks: [] })).toBeNull();
  });

  it('substitutes whole-string {param} filter values only', () => {
    const b = pickSeoBinding(content)!.binding;
    expect(substituteBindingFilters(b, { slug: 'my-post' })).toEqual([
      { field: 'slug', operator: 'eq', value: 'my-post' },
      { field: 'k', operator: 'eq', value: 'fixed' },
    ]);
  });
});

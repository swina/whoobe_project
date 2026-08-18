import { describe, it, expect } from 'vitest';
import {
  isDynamicSlug,
  extractPlaceholderNames,
  compilePagePathPattern,
  matchPagePath,
  buildPathFromPattern,
} from './page-path-pattern.js';
import type { WhoobePageRecord } from '../db/whoobe-pages-records.js';

function makePage(overrides: Partial<WhoobePageRecord> & { slug: string }): WhoobePageRecord {
  return {
    id: overrides.id ?? 'id',
    translationGroupId: 'group-1',
    locale: 'en',
    title: 'Title',
    category: '',
    kind: overrides.kind ?? 'content',
    published: true,
    workflowState: null,
    content: null,
    seo: null,
    sitemap: null,
    search: null,
    pimcoreId: null,
    path: null,
    websiteId: null,
    themeId: null,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('isDynamicSlug', () => {
  it('detects a placeholder', () => {
    expect(isDynamicSlug('/it/news/{slug}')).toBe(true);
    expect(isDynamicSlug('/it/news')).toBe(false);
  });
});

describe('extractPlaceholderNames', () => {
  it('extracts a single placeholder', () => {
    expect(extractPlaceholderNames('/it/news/{slug}')).toEqual(['slug']);
  });

  it('extracts multiple placeholders in order', () => {
    expect(extractPlaceholderNames('/it/{category}/{slug}')).toEqual(['category', 'slug']);
  });

  it('returns an empty array for a literal slug', () => {
    expect(extractPlaceholderNames('/it/news')).toEqual([]);
  });

  it('throws on unbalanced braces', () => {
    expect(() => extractPlaceholderNames('/it/news/{slug')).toThrow(/unbalanced/i);
  });

  it('throws on an empty placeholder name', () => {
    expect(() => extractPlaceholderNames('/it/news/{}')).toThrow(/empty/i);
  });
});

describe('compilePagePathPattern', () => {
  it('matches a request path and captures named params', () => {
    const re = compilePagePathPattern('/it/news/{slug}');
    const m = re.exec('/it/news/my-article');
    expect(m?.groups).toEqual({ slug: 'my-article' });
  });

  it('does not match a slug placeholder against a value containing a slash', () => {
    const re = compilePagePathPattern('/it/news/{slug}');
    expect(re.exec('/it/news/my/article')).toBeNull();
  });

  it('does not match a shorter or longer path', () => {
    const re = compilePagePathPattern('/it/news/{slug}');
    expect(re.exec('/it/news')).toBeNull();
    expect(re.exec('/it/news/my-article/extra')).toBeNull();
  });

  it('supports multiple placeholders', () => {
    const re = compilePagePathPattern('/it/{category}/{slug}');
    const m = re.exec('/it/skincare/my-article');
    expect(m?.groups).toEqual({ category: 'skincare', slug: 'my-article' });
  });
});

describe('matchPagePath', () => {
  it('matches the correct dynamic page and returns its params', () => {
    const pages = [makePage({ id: 'a', slug: '/it/news/{slug}' }), makePage({ id: 'b', slug: '/it/events/{slug}' })];
    const result = matchPagePath(pages, '/it/news/my-article');
    expect(result?.page.id).toBe('a');
    expect(result?.params).toEqual({ slug: 'my-article' });
  });

  it('returns null when nothing matches', () => {
    const pages = [makePage({ slug: '/it/news/{slug}' })];
    expect(matchPagePath(pages, '/it/other/my-article')).toBeNull();
  });

  it('prefers the pattern with fewer placeholders on ambiguous overlap', () => {
    const pages = [makePage({ id: 'two-params', slug: '/it/{category}/{slug}' }), makePage({ id: 'one-param', slug: '/it/news/{slug}' })];
    const result = matchPagePath(pages, '/it/news/my-article');
    expect(result?.page.id).toBe('one-param');
  });

  it('skips malformed patterns rather than throwing', () => {
    const pages = [makePage({ id: 'bad', slug: '/it/{}/broken' }), makePage({ id: 'good', slug: '/it/news/{slug}' })];
    const result = matchPagePath(pages, '/it/news/my-article');
    expect(result?.page.id).toBe('good');
  });
});

describe('buildPathFromPattern', () => {
  it('substitutes params into a pattern', () => {
    expect(buildPathFromPattern('/it/news/{slug}', { slug: 'my-article' })).toBe('/it/news/my-article');
  });

  it('substitutes multiple params', () => {
    expect(buildPathFromPattern('/it/{category}/{slug}', { category: 'skincare', slug: 'my-article' })).toBe('/it/skincare/my-article');
  });

  it('throws when a required param is missing', () => {
    expect(() => buildPathFromPattern('/it/news/{slug}', {})).toThrow(/missing/i);
  });
});

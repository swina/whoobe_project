import { describe, expect, it } from 'vitest';
import { RESERVED_ROOT_SEGMENTS, createSiteRootCache, firstSegment, isReservedRootPath, matchSiteRoot } from './site-roots.js';

describe('firstSegment', () => {
  it('takes the first path segment, lower-cased, without query or hash', () => {
    expect(firstSegment('/whoobe-website/blog/x')).toBe('whoobe-website');
    expect(firstSegment('/Whoobe-Website?a=b')).toBe('whoobe-website');
    expect(firstSegment('/whoobe-website#top')).toBe('whoobe-website');
    expect(firstSegment('//x/y')).toBe('x');
    expect(firstSegment('/%77hoobe')).toBe('whoobe');
    expect(firstSegment('/')).toBe('');
    expect(firstSegment('')).toBe('');
  });
  it('keeps an undecodable segment as it is', () => {
    expect(firstSegment('/%E0%A4%A')).toBe('%e0%a4%a');
  });
});

describe('matchSiteRoot', () => {
  const roots = ['/whoobe-website', '/default'];
  it('matches the root itself and everything below it', () => {
    expect(matchSiteRoot('/whoobe-website', roots)).toBe(true);
    expect(matchSiteRoot('/whoobe-website/', roots)).toBe(true);
    expect(matchSiteRoot('/whoobe-website/blog/article/x?locale=en', roots)).toBe(true);
    expect(matchSiteRoot('/DEFAULT/a', roots)).toBe(true);
  });
  it('does not match a longer name, another site or the dashboard', () => {
    expect(matchSiteRoot('/whoobe-website-2/x', roots)).toBe(false);
    expect(matchSiteRoot('/whoobe/x', roots)).toBe(false);
    expect(matchSiteRoot('/', roots)).toBe(false);
    expect(matchSiteRoot('/assets/index.js', roots)).toBe(false);
    expect(matchSiteRoot('/login', roots)).toBe(false);
  });
  it('never matches a reserved name, even if a site was stored with it', () => {
    expect(matchSiteRoot('/auth/me', ['/auth'])).toBe(false);
    expect(matchSiteRoot('/whoobe-one/editor', ['/whoobe-one'])).toBe(false);
  });
  it('matches nothing when there are no websites', () => {
    expect(matchSiteRoot('/whoobe-website', [])).toBe(false);
  });
});

describe('isReservedRootPath', () => {
  it.each(['/whoobe-one', '/editor', '/api', '/auth', '/data-objects', '/public', '/assets', '/login', '/robots.txt', '/Settings'])('%s is reserved', (p) => expect(isReservedRootPath(p)).toBe(true));
  it.each(['/whoobe-website', '/default', '/aura-network', '/blog', '/my_site'])('%s is free', (p) => expect(isReservedRootPath(p)).toBe(false));
  it('covers every top-level prefix the proxy sends to core-api', () => {
    const regex = 'auth|documents|snippets|data-classes|data-components|data-objects|mail-settings|mail-log|mail-templates|migration-sources|health|search|themes|public|ai|figma|preview|sites|pages|settings|workflows|users|roles';
    for (const name of regex.split('|')) expect(RESERVED_ROOT_SEGMENTS.has(name), name).toBe(true);
  });
});

describe('createSiteRootCache', () => {
  it('reads the roots once per ttl, picks up a new site afterwards, and shares one load between concurrent calls', async () => {
    let t = 0;
    let loads = 0;
    let roots = ['/a'];
    const cache = createSiteRootCache(async () => { loads++; return roots; }, 100, () => t);
    expect(await Promise.all([cache.matches('/a/x'), cache.matches('/b/x')])).toEqual([true, false]);
    expect(loads).toBe(1);
    roots = ['/a', '/b'];
    expect(await cache.matches('/b/x')).toBe(false);   // still cached
    t = 200;
    expect(await cache.matches('/b/x')).toBe(true);
    expect(loads).toBe(2);
  });
});

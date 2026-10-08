// Which links the editor's page preview rewrites when the editor is mounted under a base path (/whoobe-one/ in the
// Docker stacks) and which it leaves alone.
import { describe, it, expect } from 'vitest'
import { prefixInternalHref } from '../../../apps/whoobe-one-spike/src/preview-links'

describe('prefixInternalHref', () => {
  const base = '/whoobe-one/'

  it('puts the base in front of an absolute path of the site, query and hash kept', () => {
    expect(prefixInternalHref('/whoobe-website/blog', base)).toBe('/whoobe-one/whoobe-website/blog')
    expect(prefixInternalHref('/whoobe-website/', base)).toBe('/whoobe-one/whoobe-website/')
    expect(prefixInternalHref('/a/b?x=1#top', base)).toBe('/whoobe-one/a/b?x=1#top')
    expect(prefixInternalHref('/', base)).toBe('/whoobe-one/')
  })

  it('is idempotent: a link that already carries the base is left as it is', () => {
    expect(prefixInternalHref('/whoobe-one/whoobe-website/blog', base)).toBe('/whoobe-one/whoobe-website/blog')
    expect(prefixInternalHref('/whoobe-one', base)).toBe('/whoobe-one')
    expect(prefixInternalHref('/whoobe-one?x=1', base)).toBe('/whoobe-one?x=1')
    expect(prefixInternalHref(prefixInternalHref('/x', base), base)).toBe('/whoobe-one/x')
  })

  it('does not take a longer first segment for the base', () => {
    expect(prefixInternalHref('/whoobe-onetime/x', base)).toBe('/whoobe-one/whoobe-onetime/x')
  })

  it.each(['https://example.com/x', 'http://example.com', '//cdn.example.com/x.js', '#top', 'mailto:a@b.co', 'tel:+3900', 'relative/page', '', '../up'])('leaves %j alone', (href) => {
    expect(prefixInternalHref(href, base)).toBe(href)
  })

  it('does nothing when the editor is served from the root (local development)', () => {
    expect(prefixInternalHref('/whoobe-website/blog', '/')).toBe('/whoobe-website/blog')
    expect(prefixInternalHref('/whoobe-website/blog', '')).toBe('/whoobe-website/blog')
  })

  it('accepts the base with or without its slashes', () => {
    expect(prefixInternalHref('/x', '/whoobe-one')).toBe('/whoobe-one/x')
    expect(prefixInternalHref('/x', '/whoobe-one/')).toBe('/whoobe-one/x')
  })
})

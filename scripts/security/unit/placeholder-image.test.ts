// The placeholder picture of generated and starter pages (private-network profile): picsum by default, a local PNG on request.
import { describe, it, expect } from 'vitest'
import { placeholderImageUrl, parsePlaceholderImages, LOCAL_PLACEHOLDER_IMAGE, sanitizeRichText } from '../../../packages/sdk/schema/src/index'

describe('placeholderImageUrl', () => {
  it('is the seeded picsum photo by default, as before', () => {
    expect(placeholderImageUrl('abc')).toBe('https://picsum.photos/seed/abc/1200/800')
    expect(placeholderImageUrl('whoobe', 'picsum', 320, 180)).toBe('https://picsum.photos/seed/whoobe/320/180')
    expect(placeholderImageUrl('a b/c')).toBe('https://picsum.photos/seed/a%20b%2Fc/1200/800')
  })
  it('is a local picture, whatever the seed, in local mode', () => {
    expect(placeholderImageUrl('abc', 'local')).toBe(LOCAL_PLACEHOLDER_IMAGE)
    expect(LOCAL_PLACEHOLDER_IMAGE).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
  })
  it('reads the setting: only "local" switches it', () => {
    expect(parsePlaceholderImages('local')).toBe('local')
    for (const v of [undefined, '', 'picsum', 'LOCAL', 1, null]) expect(parsePlaceholderImages(v)).toBe('picsum')
  })
  it('is a real PNG that the sanitiser keeps in an <img>', () => {
    const bytes = Buffer.from(LOCAL_PLACEHOLDER_IMAGE.split(',')[1], 'base64')
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(bytes.readUInt32BE(16)).toBe(60) // width
    expect(bytes.readUInt32BE(20)).toBe(40) // height
    expect(sanitizeRichText(`<img src="${LOCAL_PLACEHOLDER_IMAGE}">`)).toContain('data:image/png;base64')
  })
})

// Uploaded web fonts (docs/plans/system/release-0.3-plan.md, A7): the DAM knows the woff2 type and checks the signature.
import { describe, it, expect } from 'vitest'
import { getFileTypeFromFilename } from '../../../packages/core/src/dam/file-type'
import { isWoff2, contentMatchesExtension, SNIFFABLE_EXTENSIONS } from '../../../packages/core/src/uploads/sniff'

const text = (s: string) => new TextEncoder().encode(s)

describe('woff2 uploads', () => {
  it('has its own file type and MIME type, whatever the case of the extension', () => {
    expect(getFileTypeFromFilename('Brand.WOFF2')).toEqual({ fileType: 'WOFF2', mimeType: 'font/woff2' })
  })
  it('accepts the wOF2 signature and nothing else', () => {
    expect(isWoff2(text('wOF2\0\0\0\0'))).toBe(true)
    expect(isWoff2(text('wOFF....'))).toBe(false) // woff (1) is not accepted
    expect(isWoff2(text('<svg onload=alert(1)>'))).toBe(false)
    expect(isWoff2(new Uint8Array(0))).toBe(false)
  })
  it('does not make fonts uploadable by the visitors of a website', () => {
    expect(SNIFFABLE_EXTENSIONS.has('woff2')).toBe(false)
    expect(contentMatchesExtension('woff2', text('wOF2....'))).toBe(false)
  })
})

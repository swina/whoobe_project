// Custom fonts in the email document: an @font-face for the faces given, no Google link for those families, the rest as before.
import { describe, it, expect } from 'vitest'
import { buildMailDocument } from '../../../packages/core/src/mail/mail-document'

const face = { family: 'Acme Sans', weight: 400, style: 'normal', url: 'https://cms.example.com/dam-asset/a.woff2' }

describe('buildMailDocument with custom fonts', () => {
  it('writes the @font-face and does not ask Google for that family, but still for the others', () => {
    const html = buildMailDocument({ bodyHtml: '<p>x</p>', fonts: ['Acme+Sans', 'Roboto'], fontFaces: [face] })
    expect(html).toContain('<style>@font-face{font-family:"Acme Sans";font-weight:400;font-style:normal;font-display:swap;src:url("https://cms.example.com/dam-asset/a.woff2") format("woff2")}</style>')
    expect(html).toContain('family=Roboto')
    expect(html).not.toContain('family=Acme')
  })
  it('is what it was without faces', () => {
    const html = buildMailDocument({ bodyHtml: '<p>x</p>', fonts: ['Roboto'] })
    expect(html).toContain('family=Roboto')
    expect(html).not.toContain('<style>')
  })
  it('has no Google links at all when the only font is a custom one', () => {
    const html = buildMailDocument({ bodyHtml: '<p>x</p>', fonts: ['Acme+Sans'], fontFaces: [face] })
    expect(html).not.toContain('googleapis')
    expect(html).toContain('@font-face')
  })
})

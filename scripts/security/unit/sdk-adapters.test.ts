// Plan 3.6: the headless SDK adapters (used by generated Next/Nuxt sites) must sanitise rich text themselves,
// not only rely on the sanitised public API: rendered here server-side with the real default components.
import { describe, it, expect } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString as vueRender } from '@vue/server-renderer'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { DefaultParagraph as VueParagraph } from '../../../packages/sdk/vue/src/defaults'
import { DefaultParagraph as ReactParagraph } from '../../../packages/sdk/react/src/defaults'

const hostile = '<b class="ok">fine</b><img src=x onerror="alert(1)"><svg onload="alert(1)"></svg><a href="javascript:alert(1)">x</a><iframe srcdoc="<script>alert(1)</script>"></iframe>'
const descriptor: any = { id: 'n1', tag: 'p', content: hostile, css: '', attributes: {}, blocks: [], children: [] }

const clean = (html: string) => {
  expect(html).toContain('<b class="ok">fine</b>')
  expect(html).not.toMatch(/onerror|onload|javascript:|<iframe|<svg|<script/i)
}

describe('SDK default components', () => {
  it('React: paragraph content is sanitised', () => {
    clean(renderToStaticMarkup(createElement(ReactParagraph as any, { descriptor })))
  })

  it('Vue: paragraph content is sanitised', async () => {
    const app = createSSRApp({ render: () => h(VueParagraph as any, { descriptor }) })
    clean(await vueRender(app))
  })
})

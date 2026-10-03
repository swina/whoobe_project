// Shared helpers for the browser suites: safety check, API seeding as admin, an authenticated browser context and
// a collector for "XSS canaries" (a payload that runs script prints `__XSS__:<id>` to the console or opens a dialog).
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'
import { assertSafeTarget, TARGET, ASSET_TARGET, GATEWAY_TARGET } from '../lib/config'

export const ADMIN_URL = process.env.SECURITY_TEST_ADMIN ?? 'http://localhost:3100'
export const EDITOR_URL = process.env.SECURITY_TEST_EDITOR ?? 'http://localhost:3106'
export { TARGET, ASSET_TARGET, GATEWAY_TARGET }

export interface Payload { name: string; html: string }

/** Payloads that must never execute. `id` makes each occurrence identifiable in the report. */
export function payloads(id: string): Payload[] {
  const log = `console.log('__XSS__:${id}')`
  return [
    { name: 'img onerror', html: `<img src=x onerror="${log}">` },
    { name: 'svg onload', html: `<svg onload="${log}"></svg>` },
    { name: 'iframe srcdoc', html: `<iframe srcdoc="<script>${log}</script>"></iframe>` },
    { name: 'javascript: link', html: `<a href="javascript:${log}" id="xss-link-${id}">link</a>` },
    { name: 'details ontoggle', html: `<details open ontoggle="${log}"><summary>s</summary></details>` },
    { name: 'mXSS noscript', html: `<noscript><p title="</noscript><img src=x onerror=${log}>">` },
    { name: 'style/handler break-out', html: `"><img src=x onerror=${log}>` },
  ]
}

export class Canary {
  hits: string[] = []
  dialogs: string[] = []
  attach(page: Page) {
    page.on('console', (m) => { if (m.text().includes('__XSS__:')) this.hits.push(m.text()) })
    page.on('dialog', (d) => { this.dialogs.push(d.message()); void d.dismiss() })
    page.on('pageerror', () => { /* application errors are not our concern here */ })
  }
  get fired() { return [...this.hits, ...this.dialogs.map((d) => `dialog:${d}`)] }
}

export const test = base.extend<{ api: Client; authed: BrowserContext; canary: Canary; tag: string }>({
  tag: async ({}, use) => { await use(randomBytes(3).toString('hex')) },
  api: async ({}, use) => {
    assertSafeTarget()
    await use(await clientFor('admin'))
  },
  authed: async ({ browser, api }, use) => {
    const ctx = await browser.newContext()
    await ctx.addCookies([{ name: 'wcms_session', value: api.cookieHeader.split('=').slice(1).join('='), domain: 'localhost', path: '/' }])
    await use(ctx)
    await ctx.close()
  },
  canary: async ({}, use) => { await use(new Canary()) },
})

export { expect }

/** Click every javascript: link under `root` (a payload that needs a click) - the browser would execute it. */
export async function clickJavascriptLinks(page: Page) {
  const links = page.locator('a[href^="javascript:" i]')
  const n = await links.count()
  for (let i = 0; i < n; i++) await links.nth(i).click({ timeout: 2000, force: true }).catch(() => {})
}

// --- page content builders (the shape the editor itself stores) -----------------------------------------

const nodeBase = () => ({
  css: { css: '', container: '' }, data: {}, font: '', gsap: { ease: null, delay: 0, duration: 0, animation: null }, icon: '', link: '', name: '',
  image: { url: null }, style: '', alpine: {}, anchor: '', dialog: null,
  events: { blur: null, hide: null, click: null, focus: null, display: null, keydown: null, mouseenter: null, mouseleave: null },
  helper: null, tailwind: {}, categories: [], dataBinding: null, description: '',
})

export function richText(id: string, content: string, element = 'p') {
  return { ...nodeBase(), id, tag: 'element', type: 'element', label: 'Rich Text', element, editable: true, content, blocks: [] }
}

export function container(id: string, blocks: unknown[], tag = 'flex') {
  return { ...nodeBase(), id, tag, type: 'container', element: 'div', editable: false, content: null, blocks }
}

export function pageContent(blocks: unknown[]) {
  return container('doc-root', blocks, 'document')
}

export function tableNode(id: string, cellHtml: string[], ctl = '<b class="ctl">cell-ctl</b>') {
  const cell = (n: number, content: string) => ({ id: `${id}-c${n}`, content, colspan: 1, rowspan: 1, merged: false, cellClass: '' })
  return {
    ...nodeBase(), id, tag: 'table', type: 'element', element: 'table', editable: false, content: null, blocks: [],
    table: {
      hasHeader: true, hasFooter: true, caption: '',
      headerRowClass: '', headerCellClass: '', bodyRowClass: '', bodyCellClass: '', footerRowClass: '', footerCellClass: '',
      header: [cell(0, ctl), cell(1, cellHtml[0] ?? '')],
      body: cellHtml.map((h, i) => [cell(10 + i, h), cell(20 + i, h)]),
      footer: [cell(90, cellHtml[1] ?? ''), cell(91, cellHtml[2] ?? '')],
    },
  }
}

export function formNode(id: string, classId: string, successMessage: string, errorMessage: string) {
  const input = (name: string, n: number) => ({ ...nodeBase(), id: `${id}-in${n}`, tag: 'input', type: 'element', element: 'input', editable: false, content: null, blocks: [], data: { attributes: { name, type: 'text' } } })
  return {
    ...nodeBase(), id, tag: 'form', type: 'container', element: 'form', semantic: 'form', editable: false, content: null,
    data: { attributes: { name: 'form', action: '', method: 'post' } },
    formConfig: { enabled: true, targetClassId: classId, successMessage, errorMessage, notify: { enabled: false } },
    blocks: [input('title', 1), { ...nodeBase(), id: `${id}-btn`, tag: 'element', type: 'element', element: 'button', label: 'Button', editable: false, content: 'Send', data: { attributes: { type: 'submit' } }, blocks: [] }],
  }
}

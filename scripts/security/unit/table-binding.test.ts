// A Table element bound to a list (Data Class query or gateway array) with pagination: the settings must reach the visitor's
// page. Public content keeps the pagination of a gateway binding (and loses only what must not be public), the schema accepts it,
// and the table components draw the data through the shared composable.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'
import { sanitizePublicGatewayContent } from '../../../packages/core/src/gateway/sanitize-public-content'
import { gatewayBindingSchema } from '../../../packages/sdk/schema/src/validators'

const read = (p: string) => readFileSync(join(ROOT_DIR, p), 'utf8')

describe('table binding: what reaches the public page', () => {
  const page = () => ({
    id: 'root', blocks: [{
      id: 't1', tag: 'table', element: 'table', type: 'element',
      table: { cols: 2, hasHeader: true, columns: [{ id: 'c1', header: 'Name', field: 'name' }], header: [], body: [], footer: [] },
      gatewayBinding: {
        endpointName: 'Shop', routePath: '/products', fieldPath: 'items', bindingId: 'b-1',
        filters: [{ field: 'x', operator: 'eq', value: '1' }],
        rowsPerPage: 10, paginationMode: 'lazyload', loadMoreText: 'Show more', loadMoreClass: 'p-2', paginationContainerClass: 'flex',
      },
    }],
  })
  it('keeps the pagination and the columns, strips the endpoint, the route and the filters', () => {
    const out: any = sanitizePublicGatewayContent(page())
    const t = out.blocks[0]
    expect(t.gatewayBinding).toMatchObject({ bindingId: 'b-1', fieldPath: 'items', rowsPerPage: 10, paginationMode: 'lazyload', loadMoreText: 'Show more', paginationContainerClass: 'flex' })
    expect(t.gatewayBinding.endpointName).toBeUndefined()
    expect(t.gatewayBinding.routePath).toBeUndefined()
    expect(t.gatewayBinding.filters).toBeUndefined()
    expect(t.table.columns).toEqual([{ id: 'c1', header: 'Name', field: 'name' }])
  })
  it('the schema accepts the pagination of a gateway binding and refuses a malformed one', () => {
    const ok = gatewayBindingSchema.safeParse({ fieldPath: 'items', rowsPerPage: 5, paginationMode: 'standard', loadMoreText: null })
    expect(ok.success).toBe(true)
    expect(ok.success && ok.data.rowsPerPage).toBe(5)
    for (const bad of [{ rowsPerPage: 'ten' }, { paginationMode: 'infinite' }, { loadMoreText: 5 }]) {
      expect(gatewayBindingSchema.safeParse({ fieldPath: 'items', ...bad }).success, JSON.stringify(bad)).toBe(false)
    }
  })
})

describe('table binding: the components', () => {
  it('the canvas and the preview draw a bound table with the same composable and never write HTML from data', () => {
    for (const f of ['apps/whoobe-one-spike/src/components/BlockTable.vue', 'apps/whoobe-one-spike/src/components/preview/BlockTablePreview.vue']) {
      const src = read(f)
      expect(src, f).toContain('useBoundTable')
      expect(src, f).toContain('bound.rows.value')
      expect(src, f).toContain('bound.needsControls.value')
      // a bound cell is interpolated text or a checked link, never v-html
      const boundBody = src.slice(src.indexOf('<tbody v-if="bound.isBound.value">'), src.indexOf('<tbody v-else>'))
      expect(boundBody.length, f).toBeGreaterThan(100)
      expect(boundBody, f).not.toContain('v-html')
    }
  })
  it('each column has its own cell and header classes, used when the table is drawn', () => {
    const canvas = read('apps/whoobe-one-spike/src/components/BlockTable.vue')
    expect(canvas).toContain('v-model="col.cellClass"')
    expect(canvas).toContain('v-model="col.headerCellClass"')
    for (const f of ['apps/whoobe-one-spike/src/components/BlockTable.vue', 'apps/whoobe-one-spike/src/components/preview/BlockTablePreview.vue']) {
      expect(read(f), f).toContain('col.headerCellClass')
    }
    expect(read('apps/whoobe-one-spike/src/composables/useBoundTable.ts')).toContain('cellClass: col.cellClass')
  })
  it('a bound table can be sorted by its headers and searched, in the canvas and the preview', () => {
    for (const f of ['apps/whoobe-one-spike/src/components/BlockTable.vue', 'apps/whoobe-one-spike/src/components/preview/BlockTablePreview.vue']) {
      const src = read(f)
      expect(src, f).toContain('bound.setSort(col)')
      expect(src, f).toContain(':aria-sort=')
      expect(src, f).toContain('v-model="bound.query.value"')
      expect(src, f).toContain('type="search"')
    }
    const c = read('apps/whoobe-one-spike/src/composables/useBoundTable.ts')
    // the order of the work: search, then sort, then pages
    expect(c.indexOf('const filtered')).toBeLessThan(c.indexOf('const processed'))
    expect(c.indexOf('const processed')).toBeLessThan(c.indexOf('const shown'))
  })
  it('the row counter is drawn as text, in the canvas and the preview, and follows search and pages', () => {
    for (const f of ['apps/whoobe-one-spike/src/components/BlockTable.vue', 'apps/whoobe-one-spike/src/components/preview/BlockTablePreview.vue']) {
      const src = read(f)
      expect(src, f).toContain('bound.countLabel.value')
      expect(src, f).toContain('bound.hasFooter.value')
      expect(src, f).not.toMatch(/v-html="[^"]*count/i)
    }
    const c = read('apps/whoobe-one-spike/src/composables/useBoundTable.ts')
    expect(c).toContain('rowRange(total.value')
    expect(c).toContain('all: recordCount.value')
  })
  it('the container repeaters read the pagination of a gateway binding too', () => {
    for (const f of ['apps/whoobe-one-spike/src/components/BlockContainer.vue', 'apps/whoobe-one-spike/src/components/preview/BlockContainerPreview.vue']) {
      expect(read(f), f).toContain('pagBinding')
    }
  })
  it('the gateway picker offers the pagination for a list', () => {
    const src = read('apps/whoobe-one-spike/src/components/GatewayBindingPicker.vue')
    expect(src).toContain('Rows per page')
    expect(src).toContain('rowsPerPage: filterableFields.value')
  })
})

// The CSS of a generated site contains only the classes in its safelist. It used to be built from `css.css` and `css.container` alone, so
// the classes kept in other fields (a table's sections and columns, a binding's pagination, a slider's navigation) and the defaults of the
// built-in components were missing from the CSS (packages/sdk/schema/src/class-fields.ts, docs/plans/cms/table-element-sdk-plan.md).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'
import { collectClasses } from '../../../packages/publish/src/cli'

const read = (p: string) => readFileSync(join(ROOT_DIR, p), 'utf8')
const safelist = (tree: unknown) => { const s = new Set<string>(); collectClasses(tree, s); return s }

describe('generated site: the class safelist', () => {
  const page = {
    id: 'root', css: { css: 'flex', container: 'p-4' },
    blocks: [
      { id: 't', tag: 'table', element: 'table', css: { css: 'w-full' },
        table: { headerCellClass: 'px-3 py-2 font-bold', bodyRowClass: 'even:bg-gray-50', searchClass: 'ring-2', countClass: 'text-sm italic',
          columns: [{ id: 'c', header: 'H', field: 'f', cellClass: 'text-right tabular-nums', headerCellClass: 'text-right' }] },
        gatewayBinding: { loadMoreClass: 'bg-black text-white', paginationContainerClass: 'mt-8' } },
      { id: 's', tag: 'slider', slider: { navClass: 'justify-end', dotClass: 'bg-red-500' }, blocks: [] },
    ],
  }
  it('has the classes of the tree wherever they are kept', () => {
    const s = safelist(page)
    for (const c of ['flex', 'p-4', 'w-full', 'px-3', 'font-bold', 'even:bg-gray-50', 'ring-2', 'italic', 'tabular-nums', 'text-right', 'bg-black', 'mt-8', 'justify-end', 'bg-red-500']) {
      expect(s.has(c), c).toBe(true)
    }
  })
  it('has the default classes of the built-in table and slider components when the page has one', () => {
    const s = safelist(page)
    for (const c of ['max-w-xs', 'disabled:opacity-40', 'hover:bg-gray-50', 'bg-indigo-600', 'pt-3']) expect(s.has(c), c).toBe(true)
    expect(safelist({ css: { css: 'x' } }).has('bg-indigo-600')).toBe(false)
  })
  it('both generators (Next.js and Nuxt) build their safelist with it', () => {
    const src = read('packages/publish/src/cli.ts')
    expect((src.match(/collectClasses\(page\.content, classSet\)/g) ?? []).length).toBe(2)
    expect(src).toContain('collectTreeClasses')
  })
})

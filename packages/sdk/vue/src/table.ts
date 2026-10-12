// The Table element (kind "table") for Vue / Nuxt. The descriptor already holds everything: a typed grid, or pre-formatted rows of a bound
// list (docs/plans/cms/table-element-sdk-plan.md). The behaviour (search, sort, pages, counter) is `computeTableView` and `reduceTableState`
// from @whoobe-cms/schema, the same code the editor and the React adapter run; this file keeps the state and draws the markup. The server
// renders the FIRST page (initial state); sorting, search and paging come alive when the page hydrates.

import { computed, defineComponent, h, ref, type PropType, type VNode } from 'vue'
import {
  TABLE_DEFAULTS,
  ariaSortOf,
  computeTableView,
  initialTableState,
  reduceTableState,
  sanitizeRichText,
  sortMarkOf,
  type TableView,
  type TableViewAction,
  type TableViewInput,
  type TableViewState,
} from '@whoobe-cms/schema'
import type { RenderDescriptor, TableDescriptor, TableDescriptorColumn } from '@whoobe-cms/renderer'
import type { NodeComponent } from './types.js'

type Bound = NonNullable<TableDescriptor['bound']>

const cx = (...parts: (string | undefined | false)[]): string | undefined => parts.filter(Boolean).join(' ') || undefined

/** class/style + the node's own data.attributes (the Alpine directives among them). */
function elementProps(d: RenderDescriptor): Record<string, unknown> {
  const props: Record<string, unknown> = { ...(d.attributes as Record<string, unknown>) }
  if (d.className) props.class = d.className
  if (d.style) props.style = d.style
  return props
}

export interface TableViewControls {
  view: { readonly value: TableView }
  query: { readonly value: string }
  setQuery(q: string): void
  setSort(col: Pick<TableDescriptorColumn, 'field' | 'sortable'>): void
  canSort(col: Pick<TableDescriptorColumn, 'sortable'>): boolean
  ariaSort(col: Pick<TableDescriptorColumn, 'field'>): 'ascending' | 'descending' | 'none'
  sortMark(col: Pick<TableDescriptorColumn, 'field'>): string
  prev(): void
  next(): void
  more(): void
}

/** The state of a bound table's controls and the view of its rows. Exported so a consumer's own `table` component gets the same
 *  behaviour: register it as `table` and call this with `() => descriptor.table.bound`. The rules are @whoobe-cms/schema's, shared with
 *  the editor and the other adapters. */
export function useTableView(getBound: () => Bound): TableViewControls {
  const state = ref<TableViewState>(initialTableState(getBound().pagination))
  const input = computed<TableViewInput>(() => {
    const b = getBound()
    return { columns: b.columns, rows: b.rows, pagination: b.pagination, sortable: b.sortable, searchable: b.searchable, countText: b.countText }
  })
  const view = computed(() => computeTableView(input.value, state.value))
  const act = (action: TableViewAction) => { state.value = reduceTableState(state.value, action, input.value, view.value) }
  return {
    view,
    query: computed(() => state.value.query),
    setQuery: (value) => act({ type: 'query', value }),
    setSort: (col) => act({ type: 'sort', field: col.field }),
    canSort: (col) => getBound().sortable && col.sortable !== false,
    ariaSort: (col) => ariaSortOf(view.value.sort, col.field),
    sortMark: (col) => sortMarkOf(view.value.sort, col.field),
    prev: () => act({ type: 'prev' }),
    next: () => act({ type: 'next' }),
    more: () => act({ type: 'more' }),
  }
}

function renderStatic(d: RenderDescriptor, table: TableDescriptor): VNode {
  const grid = table.grid!
  const cell = (tag: 'th' | 'td', c: { html: string; colspan: number; rowspan: number; className?: string }, base: string, key: number) =>
    h(tag, {
      key,
      colspan: c.colspan > 1 ? c.colspan : undefined,
      rowspan: tag === 'td' && c.rowspan > 1 ? c.rowspan : undefined,
      class: cx(base, c.className),
      innerHTML: sanitizeRichText(c.html),
    })
  return h('table', elementProps(d), [
    table.caption ? h('caption', table.caption) : null,
    table.hasHeader ? h('thead', [h('tr', { class: cx(table.classes.headerRow) }, grid.header.map((c, i) => cell('th', c, table.classes.headerCell, i)))]) : null,
    h('tbody', grid.body.map((row, r) => h('tr', { key: r, class: cx(table.classes.bodyRow) }, row.map((c, i) => cell('td', c, table.classes.bodyCell, i))))),
    table.hasFooter ? h('tfoot', [h('tr', { class: cx(table.classes.footerRow) }, grid.footer.map((c, i) => cell('td', c, table.classes.footerCell, i)))]) : null,
  ])
}

const BoundTable = defineComponent({
  name: 'WhoobeBoundTable',
  props: { descriptor: { type: Object as PropType<RenderDescriptor>, required: true } },
  setup(props) {
    const getBound = () => props.descriptor.table!.bound!
    const t = useTableView(getBound)
    return () => {
      const d = props.descriptor
      const table = d.table!
      const b = getBound()
      const view = t.view.value
      const cols = Math.max(1, b.columns.length)
      const rpp = b.pagination
      const showFooter = view.needsControls || b.showCount || b.truncated

      const caption = table.caption || b.searchable
        ? h('caption', [
            b.searchable
              ? h('div', { class: TABLE_DEFAULTS.searchWrapper }, [
                  h('input', {
                    type: 'search',
                    value: t.query.value,
                    placeholder: b.searchPlaceholder || 'Search…',
                    'aria-label': 'Search the table',
                    class: b.searchClass || TABLE_DEFAULTS.search,
                    onInput: (e: Event) => t.setQuery((e.target as HTMLInputElement).value),
                  }),
                ])
              : null,
            table.caption || null,
          ])
        : null

      const head = table.hasHeader
        ? h('thead', [
            h('tr', { class: cx(table.classes.headerRow) }, b.columns.map((col) =>
              h('th', { key: col.id, class: cx(table.classes.headerCell, col.headerClass), 'aria-sort': t.canSort(col) ? t.ariaSort(col) : undefined },
                t.canSort(col)
                  ? [h('button', { type: 'button', class: TABLE_DEFAULTS.sortButton, onClick: () => t.setSort(col) }, [col.header, h('span', { 'aria-hidden': 'true', class: TABLE_DEFAULTS.sortMark }, t.sortMark(col))])]
                  : col.header),
            )),
          ])
        : null

      const body = h('tbody', [
        ...view.rows.map((row, r) =>
          h('tr', { key: r, class: cx(table.classes.bodyRow) }, row.cells.map((c, i) =>
            h('td', { key: b.columns[i]?.id ?? i, class: cx(table.classes.bodyCell, b.columns[i]?.cellClass) },
              c.href ? [h('a', { href: c.href, target: c.target, rel: 'noopener noreferrer' }, c.text)] : [h('span', { class: c.className }, c.text)]),
          )),
        ),
        view.rows.length === 0
          ? h('tr', [h('td', { colspan: cols, class: cx(table.classes.bodyCell, TABLE_DEFAULTS.empty) }, view.searching ? 'No matching rows' : b.emptyText || 'No data')])
          : null,
      ])

      const foot = showFooter
        ? h('tfoot', [
            h('tr', [
              h('td', { colspan: cols, class: TABLE_DEFAULTS.footerCell }, [
                h('div', { class: view.needsControls ? rpp.containerClass : TABLE_DEFAULTS.countOnlyContainer }, [
                  b.showCount ? h('span', { class: b.countClass || TABLE_DEFAULTS.count, 'aria-live': 'polite' }, view.countLabel) : null,
                  b.truncated ? h('span', { class: TABLE_DEFAULTS.count }, `Showing the first ${b.rows.length} of ${b.totalRows} rows`) : null,
                  view.needsControls && rpp.mode === 'standard'
                    ? h('div', { class: TABLE_DEFAULTS.pager }, [
                        h('button', { type: 'button', class: TABLE_DEFAULTS.pagerButton, disabled: view.page <= 1, onClick: t.prev }, '‹ Prev'),
                        h('span', `Page ${view.page} of ${view.pages}`),
                        h('button', { type: 'button', class: TABLE_DEFAULTS.pagerButton, disabled: view.page >= view.pages, onClick: t.next }, 'Next ›'),
                      ])
                    : null,
                  view.needsControls && rpp.mode === 'lazyload'
                    ? [
                        !b.showCount ? h('span', { class: TABLE_DEFAULTS.count }, `${view.rows.length} / ${view.total}`) : null,
                        view.rows.length < view.total ? h('button', { type: 'button', class: rpp.loadMoreClass, onClick: t.more }, rpp.loadMoreText) : null,
                      ]
                    : null,
                ]),
              ]),
            ]),
          ])
        : null

      return h('table', elementProps(d), [caption, head, body, foot])
    }
  },
})

/** The default `table` component of the registry. */
export const DefaultTable: NodeComponent = defineComponent({
  name: 'WhoobeTable',
  props: { descriptor: { type: Object as PropType<RenderDescriptor>, required: true }, children: { type: Array as PropType<VNode[]>, default: () => [] } },
  setup(props) {
    return () => {
      const d = props.descriptor
      const table = d.table
      if (!table) return h('table', elementProps(d))
      return table.mode === 'bound' ? h(BoundTable, { descriptor: d }) : renderStatic(d, table)
    }
  },
})

"use client"
// The Table element (kind "table") for React / Next.js. The descriptor already holds everything: a typed grid, or pre-formatted rows of a
// bound list (docs/plans/cms/table-element-sdk-plan.md). The behaviour (search, sort, pages, counter) is `computeTableView` from
// @whoobe-cms/schema, the same function the editor calls; this file keeps the state and draws the markup. The server renders the FIRST page
// (initial state); sorting, search and paging come alive when the page hydrates.

import { useState } from 'react'
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
import { baseProps } from './style.js'
import type { NodeComponent } from './types.js'

type Bound = NonNullable<TableDescriptor['bound']>

const cx = (...parts: (string | undefined | false)[]): string | undefined => parts.filter(Boolean).join(' ') || undefined

export interface TableViewControls {
  view: TableView
  query: string
  setQuery(q: string): void
  setSort(col: Pick<TableDescriptorColumn, 'field' | 'sortable'>): void
  canSort(col: Pick<TableDescriptorColumn, 'sortable'>): boolean
  ariaSort(col: Pick<TableDescriptorColumn, 'field'>): 'ascending' | 'descending' | 'none'
  sortMark(col: Pick<TableDescriptorColumn, 'field'>): string
  prev(): void
  next(): void
  more(): void
}

/** The state of a bound table's controls (search words, sort, page, rows revealed) and the view of the rows for it. Exported so a
 *  consumer's own `table` component gets the same behaviour: `registry={{ table: MyTable }}` and call this with `descriptor.table.bound`.
 *  The rules (what each action does, the view) are @whoobe-cms/schema's, shared with the editor and the other adapters. */
export function useTableView(bound: Bound): TableViewControls {
  const input: TableViewInput = {
    columns: bound.columns, rows: bound.rows, pagination: bound.pagination, sortable: bound.sortable, searchable: bound.searchable, countText: bound.countText,
  }
  const [state, setState] = useState<TableViewState>(() => initialTableState(bound.pagination))
  const view = computeTableView(input, state)
  const act = (action: TableViewAction) => setState((s) => reduceTableState(s, action, input, computeTableView(input, s)))
  return {
    view,
    query: state.query,
    setQuery: (value) => act({ type: 'query', value }),
    setSort: (col) => act({ type: 'sort', field: col.field }),
    canSort: (col) => bound.sortable && col.sortable !== false,
    ariaSort: (col) => ariaSortOf(view.sort, col.field),
    sortMark: (col) => sortMarkOf(view.sort, col.field),
    prev: () => act({ type: 'prev' }),
    next: () => act({ type: 'next' }),
    more: () => act({ type: 'more' }),
  }
}

function StaticTable({ descriptor, table }: { descriptor: RenderDescriptor; table: TableDescriptor }) {
  const grid = table.grid!
  const html = (h: string) => ({ __html: sanitizeRichText(h) })
  return (
    <table {...baseProps(descriptor)}>
      {table.caption ? <caption>{table.caption}</caption> : null}
      {table.hasHeader ? (
        <thead>
          <tr className={cx(table.classes.headerRow)}>
            {grid.header.map((c, i) => (
              <th key={i} colSpan={c.colspan > 1 ? c.colspan : undefined} className={cx(table.classes.headerCell, c.className)} dangerouslySetInnerHTML={html(c.html)} />
            ))}
          </tr>
        </thead>
      ) : null}
      <tbody>
        {grid.body.map((row, r) => (
          <tr key={r} className={cx(table.classes.bodyRow)}>
            {row.map((c, i) => (
              <td key={i} colSpan={c.colspan > 1 ? c.colspan : undefined} rowSpan={c.rowspan > 1 ? c.rowspan : undefined} className={cx(table.classes.bodyCell, c.className)} dangerouslySetInnerHTML={html(c.html)} />
            ))}
          </tr>
        ))}
      </tbody>
      {table.hasFooter ? (
        <tfoot>
          <tr className={cx(table.classes.footerRow)}>
            {grid.footer.map((c, i) => (
              <td key={i} colSpan={c.colspan > 1 ? c.colspan : undefined} className={cx(table.classes.footerCell, c.className)} dangerouslySetInnerHTML={html(c.html)} />
            ))}
          </tr>
        </tfoot>
      ) : null}
    </table>
  )
}

function BoundTable({ descriptor, table }: { descriptor: RenderDescriptor; table: TableDescriptor }) {
  const b = table.bound!
  const t = useTableView(b)
  const { view } = t
  const cols = Math.max(1, b.columns.length)
  const rpp = b.pagination
  const showFooter = view.needsControls || b.showCount || b.truncated
  return (
    <table {...baseProps(descriptor)}>
      {table.caption || b.searchable ? (
        <caption>
          {b.searchable ? (
            <div className={TABLE_DEFAULTS.searchWrapper}>
              <input
                type="search"
                value={t.query}
                placeholder={b.searchPlaceholder || 'Search…'}
                aria-label="Search the table"
                className={b.searchClass || TABLE_DEFAULTS.search}
                onChange={(e) => t.setQuery(e.target.value)}
              />
            </div>
          ) : null}
          {table.caption}
        </caption>
      ) : null}
      {table.hasHeader ? (
        <thead>
          <tr className={cx(table.classes.headerRow)}>
            {b.columns.map((col) => (
              <th key={col.id} className={cx(table.classes.headerCell, col.headerClass)} aria-sort={t.canSort(col) ? t.ariaSort(col) : undefined}>
                {t.canSort(col) ? (
                  <button type="button" className={TABLE_DEFAULTS.sortButton} onClick={() => t.setSort(col)}>
                    {col.header}
                    <span aria-hidden="true" className={TABLE_DEFAULTS.sortMark}>{t.sortMark(col)}</span>
                  </button>
                ) : col.header}
              </th>
            ))}
          </tr>
        </thead>
      ) : null}
      <tbody>
        {view.rows.map((row, r) => (
          <tr key={r} className={cx(table.classes.bodyRow)}>
            {row.cells.map((c, i) => (
              <td key={b.columns[i]?.id ?? i} className={cx(table.classes.bodyCell, b.columns[i]?.cellClass)}>
                {c.href ? <a href={c.href} target={c.target} rel="noopener noreferrer">{c.text}</a> : <span className={c.className}>{c.text}</span>}
              </td>
            ))}
          </tr>
        ))}
        {view.rows.length === 0 ? (
          <tr>
            <td colSpan={cols} className={cx(table.classes.bodyCell, TABLE_DEFAULTS.empty)}>
              {view.searching ? 'No matching rows' : b.emptyText || 'No data'}
            </td>
          </tr>
        ) : null}
      </tbody>
      {showFooter ? (
        <tfoot>
          <tr>
            <td colSpan={cols} className={TABLE_DEFAULTS.footerCell}>
              <div className={view.needsControls ? rpp.containerClass : TABLE_DEFAULTS.countOnlyContainer}>
                {b.showCount ? <span className={b.countClass || TABLE_DEFAULTS.count} aria-live="polite">{view.countLabel}</span> : null}
                {b.truncated ? <span className={TABLE_DEFAULTS.count}>{`Showing the first ${b.rows.length} of ${b.totalRows} rows`}</span> : null}
                {view.needsControls && rpp.mode === 'standard' ? (
                  <div className={TABLE_DEFAULTS.pager}>
                    <button type="button" className={TABLE_DEFAULTS.pagerButton} disabled={view.page <= 1} onClick={t.prev}>‹ Prev</button>
                    <span>{`Page ${view.page} of ${view.pages}`}</span>
                    <button type="button" className={TABLE_DEFAULTS.pagerButton} disabled={view.page >= view.pages} onClick={t.next}>Next ›</button>
                  </div>
                ) : null}
                {view.needsControls && rpp.mode === 'lazyload' ? (
                  <>
                    {!b.showCount ? <span className={TABLE_DEFAULTS.count}>{`${view.rows.length} / ${view.total}`}</span> : null}
                    {view.rows.length < view.total ? <button type="button" className={rpp.loadMoreClass} onClick={t.more}>{rpp.loadMoreText}</button> : null}
                  </>
                ) : null}
              </div>
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  )
}

/** The default `table` component of the registry. */
export const DefaultTable: NodeComponent = ({ descriptor }) => {
  const table = descriptor.table
  if (!table) return <table {...baseProps(descriptor)} />
  return table.mode === 'bound' ? <BoundTable descriptor={descriptor} table={table} /> : <StaticTable descriptor={descriptor} table={table} />
}

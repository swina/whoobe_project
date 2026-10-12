<script>
  // The Table element (kind "table") for Svelte 5. The descriptor already holds everything: a typed grid, or pre-formatted rows of a bound
  // list (docs/plans/cms/table-element-sdk-plan.md). The behaviour (search, sort, pages, counter) is `computeTableView` and `reduceTableState`
  // from @whoobe-cms/schema - the same code the editor and the React and Vue adapters run. This file keeps the state and draws the markup.
  // The server renders the FIRST page (initial state); sorting, search and paging come alive when the page hydrates.
  // A consumer's own table component can call those two functions the same way.
  import { untrack } from 'svelte'
  import {
    TABLE_DEFAULTS,
    ariaSortOf,
    computeTableView,
    initialTableState,
    reduceTableState,
    sanitizeRichText,
    sortMarkOf,
  } from '@whoobe-cms/schema'

  let { descriptor } = $props()

  const table = $derived(descriptor.table)
  const bound = $derived(table?.bound)
  const rpp = $derived(bound?.pagination)

  // the state of the controls starts from the descriptor once; it is the visitor's afterwards
  let state = $state(untrack(() => initialTableState(descriptor.table?.bound?.pagination ?? { rowsPerPage: 0 })))

  const input = $derived(
    bound
      ? { columns: bound.columns, rows: bound.rows, pagination: bound.pagination, sortable: bound.sortable, searchable: bound.searchable, countText: bound.countText }
      : null,
  )
  const view = $derived(input ? computeTableView(input, state) : null)
  const cols = $derived(Math.max(1, bound?.columns.length ?? 1))
  const showFooter = $derived(!!bound && !!view && (view.needsControls || bound.showCount || bound.truncated))

  function act(action) {
    if (input && view) state = reduceTableState(state, action, input, view)
  }
  const canSort = (col) => !!bound?.sortable && col.sortable !== false
  const cx = (...parts) => parts.filter(Boolean).join(' ') || undefined
</script>

{#if !table}
  <table class={descriptor.className || undefined} style={descriptor.style || undefined} {...descriptor.attributes}></table>
{:else if table.mode === 'static'}
  <table class={descriptor.className || undefined} style={descriptor.style || undefined} {...descriptor.attributes}>
    {#if table.caption}<caption>{table.caption}</caption>{/if}
    {#if table.hasHeader}
      <thead>
        <tr class={cx(table.classes.headerRow)}>
          {#each table.grid.header as c}
            <th colspan={c.colspan > 1 ? c.colspan : undefined} class={cx(table.classes.headerCell, c.className)}>{@html sanitizeRichText(c.html)}</th>
          {/each}
        </tr>
      </thead>
    {/if}
    <tbody>
      {#each table.grid.body as row}
        <tr class={cx(table.classes.bodyRow)}>
          {#each row as c}
            <td colspan={c.colspan > 1 ? c.colspan : undefined} rowspan={c.rowspan > 1 ? c.rowspan : undefined} class={cx(table.classes.bodyCell, c.className)}>{@html sanitizeRichText(c.html)}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
    {#if table.hasFooter}
      <tfoot>
        <tr class={cx(table.classes.footerRow)}>
          {#each table.grid.footer as c}
            <td colspan={c.colspan > 1 ? c.colspan : undefined} class={cx(table.classes.footerCell, c.className)}>{@html sanitizeRichText(c.html)}</td>
          {/each}
        </tr>
      </tfoot>
    {/if}
  </table>
{:else if bound && view}
  <table class={descriptor.className || undefined} style={descriptor.style || undefined} {...descriptor.attributes}>
    {#if table.caption || bound.searchable}
      <caption>
        {#if bound.searchable}
          <div class={TABLE_DEFAULTS.searchWrapper}>
            <input
              type="search"
              value={state.query}
              placeholder={bound.searchPlaceholder || 'Search…'}
              aria-label="Search the table"
              class={bound.searchClass || TABLE_DEFAULTS.search}
              oninput={(e) => act({ type: 'query', value: e.currentTarget.value })}
            />
          </div>
        {/if}
        {table.caption}
      </caption>
    {/if}
    {#if table.hasHeader}
      <thead>
        <tr class={cx(table.classes.headerRow)}>
          {#each bound.columns as col (col.id)}
            <th class={cx(table.classes.headerCell, col.headerClass)} aria-sort={canSort(col) ? ariaSortOf(view.sort, col.field) : undefined}>
              {#if canSort(col)}
                <button type="button" class={TABLE_DEFAULTS.sortButton} onclick={() => act({ type: 'sort', field: col.field })}>
                  {col.header}<span aria-hidden="true" class={TABLE_DEFAULTS.sortMark}>{sortMarkOf(view.sort, col.field)}</span>
                </button>
              {:else}
                {col.header}
              {/if}
            </th>
          {/each}
        </tr>
      </thead>
    {/if}
    <tbody>
      {#each view.rows as row}
        <tr class={cx(table.classes.bodyRow)}>
          {#each row.cells as c, i}
            <td class={cx(table.classes.bodyCell, bound.columns[i]?.cellClass)}>
              {#if c.href}<a href={c.href} target={c.target} rel="noopener noreferrer">{c.text}</a>{:else}<span class={c.className}>{c.text}</span>{/if}
            </td>
          {/each}
        </tr>
      {/each}
      {#if view.rows.length === 0}
        <tr><td colspan={cols} class={cx(table.classes.bodyCell, TABLE_DEFAULTS.empty)}>{view.searching ? 'No matching rows' : bound.emptyText || 'No data'}</td></tr>
      {/if}
    </tbody>
    {#if showFooter}
      <tfoot>
        <tr>
          <td colspan={cols} class={TABLE_DEFAULTS.footerCell}>
            <div class={view.needsControls ? rpp.containerClass : TABLE_DEFAULTS.countOnlyContainer}>
              {#if bound.showCount}<span class={bound.countClass || TABLE_DEFAULTS.count} aria-live="polite">{view.countLabel}</span>{/if}
              {#if bound.truncated}<span class={TABLE_DEFAULTS.count}>{`Showing the first ${bound.rows.length} of ${bound.totalRows} rows`}</span>{/if}
              {#if view.needsControls && rpp.mode === 'standard'}
                <div class={TABLE_DEFAULTS.pager}>
                  <button type="button" class={TABLE_DEFAULTS.pagerButton} disabled={view.page <= 1} onclick={() => act({ type: 'prev' })}>‹ Prev</button>
                  <span>{`Page ${view.page} of ${view.pages}`}</span>
                  <button type="button" class={TABLE_DEFAULTS.pagerButton} disabled={view.page >= view.pages} onclick={() => act({ type: 'next' })}>Next ›</button>
                </div>
              {/if}
              {#if view.needsControls && rpp.mode === 'lazyload'}
                {#if !bound.showCount}<span class={TABLE_DEFAULTS.count}>{`${view.rows.length} / ${view.total}`}</span>{/if}
                {#if view.rows.length < view.total}<button type="button" class={rpp.loadMoreClass} onclick={() => act({ type: 'more' })}>{rpp.loadMoreText}</button>{/if}
              {/if}
            </div>
          </td>
        </tr>
      </tfoot>
    {/if}
  </table>
{/if}

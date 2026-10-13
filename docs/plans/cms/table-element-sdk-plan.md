# Table element in published sites and the SDK: plan

*Date: 2026-10-12. Status: **proposal for the owner's decision**. Nothing in this plan is implemented. Statements about the code were
checked in the repository on the date above; the ones that were not are marked **(not verified)**.*

The Table element (typed grid, or bound to a Data Class query or a gateway list, with columns, formats, classes, pagination, sorting,
search and a row counter) works in the editor and in what the editor application serves. This plan brings it to the **generated sites**
(Next.js, Nuxt, static) and to the **headless SDK** (React, Vue, Svelte). User-facing description of the element:
[`docs/release/content/table-element.md`](../../release/guides/table-element.md).

---

## 1. Where we are (checked)

| Fact | Evidence |
|---|---|
| The editor draws the Table in two components, `BlockTable.vue` (canvas) and `preview/BlockTablePreview.vue` (preview and served pages), through one composable, `composables/useBoundTable.ts`. | `apps/whoobe-one-spike/src` |
| The **pure rules** are already framework-free and tested in `@whoobe-cms/schema`: `tableCellValue`, `columnsFromRecords`, `paginationOf`, `pageRows`, `rowRange`, `formatRowCount`, `nextSort`, `sortRecords`, `searchTerms`, `matchesTerms`, the column-editing helpers. | `packages/sdk/schema/src/table-binding.ts` (58 tests) |
| **The SDK ignores the element.** `normalizeKind` has no `table` case, so a table node becomes kind `container`; the walker follows `node.blocks` (empty for a Table), and `node.table` is never read. A probe through `walkNode` returns `kind=container, tag=table, children=0, content=""`: the generated site gets an **empty `<table>`**. Typed tables lose their text too, not only bound ones. | `packages/sdk/renderer/src/kind.ts`, `walk.ts` |
| The node schema has no type for the table grid: `ElementTable` and `TableCell` exist only in the editor's `ElementsClass.d.ts`; the Zod node schema is `.passthrough()`, so `table` survives but is not validated. | `packages/sdk/schema/src/node.ts`, `validators.ts` |
| The render descriptor has fields for `slider`, `formConfig`, `searchConfig`, `dataBinding`, but none for a table. | `packages/sdk/renderer/src/descriptor.ts` |
| **The SDK has no pagination at all**, not even for container repeaters: `rowsPerPage` and `paginationMode` appear in the schema and nowhere in the renderer or the adapters. Repeaters in generated sites show every record. | grep over `packages/sdk/*/src` |
| Bindings are resolved **before render**, on the server: the walker fetches a Data Class query through the public query endpoint, and a gateway list through the resolved `bindingId` with the site's credentials, then repeats a container's children per record. A Table would use the same two calls. | `walk.ts` (`resolveDataBinding`, `resolveGatewayBinding`) |
| The adapters differ in maturity. React (`defaults.tsx`, `"use client"`) and Vue (`defaults.ts`) have an interactive slider with state. **Svelte** has twelve small components and maps `slider` to the media component: it has no slider. | `packages/sdk/*/src` |
| The generated Tailwind safelist is built by `collectClasses`, which reads **only `css.css` and `css.container`** of each node. Classes kept in other fields (`table.headerCellClass`, `table.columns[].cellClass`, `countClass`, `searchClass`, a binding's `loadMoreClass`, a slider's `navClass` ...) are **not in the safelist**, so those styles would be missing in the generated CSS. | `packages/publish/src/cli.ts` (`collectClasses`) |
| A typed table's cells hold HTML; a descriptor's `content` is documented as "always safe to inject as HTML", and the editor runs cell HTML through `sanitizeRichText`. | `descriptor.ts`, `BlockTablePreview.vue` |
| Next static export is not auto-configured by the generator ("not yet auto-configured"); ISR (`revalidate`, default 60 s) is. | `packages/publish/src/cli.ts` |

## 2. Goals and non-goals

**Goals**

1. A generated site and a headless consumer draw the same table as the editor: typed grid, bound columns, formats, classes, empty text.
2. Pagination (standard and *More*), sorting, search and the row counter work, with the **same rules** as the editor (one implementation, not three).
3. The first page of rows is in the server-rendered HTML (a table that reads without JavaScript, shows up in a crawler's view of page 1).
4. A consumer can replace the table with their own component through the registry (`table` kind) and still get sorting, search and paging from a hook.
5. No new way for data to become markup: cells are text or sanitised HTML (typed grid only) and checked links.

**Non-goals (for this plan)**

- Server-side paging, sorting or search against the API (the first release works over the list that was fetched, like the editor).
- Virtual scrolling, column resizing, row selection, editing, export.
- Pagination of container repeaters in the SDK, although the same controller makes it cheap (phase 5, optional).

## 3. Design

### 3.1 The contract: a `table` kind and a serialisable table descriptor

Add `kind: 'table'` (for `tag === 'table'`) and a `table` member on `RenderDescriptor`, **fully serialisable** (it crosses the SSR
boundary into client components):

```ts
interface TableDescriptor {
  mode: 'static' | 'bound'
  caption: string
  hasHeader: boolean
  hasFooter: boolean
  classes: { headerRow; bodyRow; footerRow; headerCell; bodyCell; footerCell }   // the table's own, from node.table
  // typed grid: cells already sanitised, merged cells dropped, colspan/rowspan kept
  grid?: { header: Cell[]; body: Cell[][]; footer: Cell[] }
  // bound: everything the client needs, nothing it has to fetch
  bound?: {
    columns: { id; header; field; headerClass?; cellClass?; sortable; searchable }[]
    rows: { cells: ({ text: string } | { text: string; href: string; target?: string })[]; sortKeys: (string | number | null)[]; search: string }[]
    emptyText: string
    sortable; searchable; searchPlaceholder; searchClass
    showCount; countText; countClass
    pagination: PaginationSettings          // from paginationOf(binding)
  }
}
```

Why **pre-formatted rows** (text and link per cell, produced in the walker) rather than raw records: the adapters then need no
transformer engine, no path reader and no knowledge of Data Objects versus gateway items; and the formatting (date, number, truncate,
link) is done once, on the server, with the engine that already exists in `@whoobe-cms/schema` (`applyTransform`). `sortKeys` carries the raw
comparable value of each cell (a number stays a number); `search` is the row's normalised text over the searchable columns.
The cost is payload size (3.5).

The Zod schema gets real types for `ElementTable`, `TableCell` and the column, replacing the `passthrough` accident, so a malformed `table`
fails page validation instead of reaching a renderer.

### 3.2 One controller for the editor and every adapter

Move the reactive-free core of `useBoundTable` into the renderer (or the schema) as a pure function:

```ts
computeTableView(bound, state: { query, sort, page, visible }) -> {
  rows, total, all, pages, range: { from, to }, countLabel, ariaSort(col), canSort(col), needsControls
}
```

Each adapter keeps only **state** (four values) and **markup**. The editor's composable becomes a thin wrapper around the same function, so
there is a test that feeds one fixture to the editor path and to the SDK path and compares the views. This is the main defence against
the three renderers drifting.

### 3.3 Server rendering and hydration

- The server renders the **first page** with the initial state (no query, no sort, page 1). The pager, sort buttons and search box are
  rendered and become active on hydration (progressive enhancement). Without JavaScript the first page is readable and the controls do nothing.
- React/Next: a `"use client"` `DefaultTable` (precedent: `DefaultSlider`), with `useState`. Vue/Nuxt: `defineComponent` with refs. Svelte: a runes component.
  Each adapter also exports a `useTableView(descriptor)` hook/composable so a consumer's own component gets the behaviour.
- **SEO**: only page 1 is in the HTML. An option, "Render every row in the HTML" (rows beyond the page get the `hidden` attribute) is easy once the
  controller exists; it multiplies the HTML size, so it is **off** by default. Decision D3.

### 3.4 Security

- Bound cells: text, never HTML; links only to an address the engine accepts (the same check as in the editor: http, https, mailto, tel, paths).
- Typed grid cells: HTML passed through `sanitizeRichText` **in the walker**, so the descriptor keeps the "safe to inject" promise.
- Headers, caption, empty text, counter and placeholder are text. The counter pattern only replaces its four placeholders.
- A column `field` is a lookup key, read with own-property access (`tableCellValue` never walks the prototype chain).
- Class names are data authored in the CMS; they only end up in `class` attributes.

### 3.5 Payload and limits

All rows of the (already filtered, ordered and limited) list are serialised into the page (RSC payload in Next, Nuxt payload) so that sorting and
search work on the whole list. A 1,000-row table with six short columns is roughly a few hundred kilobytes (an estimate, to be measured in the phase 0 spike); ten times that is a problem.

- The binding's own **limit** and filters keep the list sensible; the walker adds a **hard cap** (decided: 1,000 rows) with a build warning and a flag in the descriptor
  (`truncated: true`) that the component shows as a note.
- Anything larger belongs to **server-side mode** (phase 5): page, sort and search become requests to a small public endpoint; out of scope here.
- Data freshness follows the site: build time for a static export, `revalidate` (default 60 s) for ISR. Interactions never refetch.

### 3.6 Styling in generated sites (a real gap, bigger than the table)

`collectClasses` reads only `css.css` and `css.container`. The Table keeps most of its classes elsewhere. The generator needs a **class collector
that knows every class-bearing field**: the table's six section classes, the columns' `headerCellClass` / `cellClass`, `searchClass`, `countClass`,
the binding's `loadMoreClass` and `paginationContainerClass`; and the default classes the adapters themselves use for the pager, the search box and
the counter (they must be in the safelist or in the adapter's own CSS). The same fix would repair the slider's `navClass` family, which has the same
problem **(not verified in a generated site)**. Better than a hand-kept list: a small shared function `classFieldsOf(node)` in the schema package, used by the generator and covered by a test
that fails when a new `*Class` field is added to the node types without being listed.

### 3.7 Accessibility

Sortable headers are real buttons inside the `th`, with `aria-sort`; the search input has a label; the counter is `aria-live="polite"`; the
pager buttons are disabled at the ends; the search box lives in the `caption`. These are already how the editor draws it; the adapters copy that markup.

## 4. Decisions

Taken by the owner on 2026-10-12:

| # | Decision |
|---|---|
| D1 | **Pre-formatted rows** in the descriptor (text and link per cell, produced by the walker) |
| D2 | **React/Next first, then Vue/Nuxt, then Svelte** |
| D3 | **Only page 1** in the server-rendered HTML |
| D4 | **Hard cap of 1,000 rows per table** (a walker option, `tableMaxRows`), with a build warning and a visible note in the table ("first 1,000 of N") |
| D5 | **The class-collection fix is its own change, first** (phase 1) |
| D6 | "Whichever is most convenient": decided as **after the table adapters** (phase 5), because it needs the same controller and the adapters' container changes, and nothing in the table depends on it |

Consequence of D4 to keep in view: sorting and search work over the rows that were kept (the first 1,000 of the list, in the binding's own order), not over a longer list; the note
in the table says so. A longer list needs the server-side mode of phase 5.

The options that were put to the owner:

## 4a. Options considered

| # | Decision | Recommendation |
|---|---|---|
| D1 | Pre-formatted rows in the descriptor (section 3.1), or raw records with the transformer engine in each adapter | **Pre-formatted**: smaller adapters, one place for the rules |
| D2 | Which adapters, in which order | React/Next first, then Vue/Nuxt, then Svelte (Svelte lacks other elements too; confirm it is in scope) |
| D3 | Only page 1 in the HTML, or an option to put every row in the HTML (hidden) | Page 1 only; the option later, when someone needs the SEO |
| D4 | Hard cap of rows per table and its value | 2,000, with a warning at build time (the owner chose 1,000) |
| D5 | The class-collection fix for the generator as part of this work, or as its own change first | **Own change first** (phase 1): it also fixes other elements |
| D6 | Pagination of container repeaters in the SDK in the same stream | Yes, after the table (phase 5): same controller, the missing feature is visible today |

## 5. Plan

### Phase 0: decisions (done) and a spike (S)

- Settle D1 to D6.
- Spike: add `kind: 'table'` and a hard-coded descriptor for one fixture, render it with a throwaway React component, measure the payload of 1,000 rows.
- *Acceptance*: numbers for the payload; the decisions recorded here.

### Phase 1: the generator learns every class (S-M)  *(independent; useful on its own)*  — **done 2026-10-12**

Shipped as `collectTreeClasses` in `packages/sdk/schema/src/class-fields.ts`, used by the generator for Next.js and Nuxt; the list of class fields is checked by a test against the node types (it found four slider fields nobody collected: `tabContainerClass`, `dotClass`, `activeDotClass`, `dotContainerClass`). Not done: building a real fixture site to see the CSS (the generator output is only parsed in tests); do it with the first adapter in phase 4.

- `classFieldsOf(node)` in `@whoobe-cms/schema`, used by `collectClasses` in `packages/publish/src/cli.ts`; a test that walks the node types.
- The adapters' default table classes listed for the safelist.
- *Acceptance*: a generated site with a slider and a table whose classes live only in the extra fields has them in the built CSS (checked by building a small fixture; the generator output is currently only parsed in tests, not built, so this needs a real build step).

### Phase 2: the contract (M)  — **done 2026-10-12**

Shipped: `ElementTable` / `TableCell` / `TableColumnConfig` and tolerant Zod schemas in `@whoobe-cms/schema` (a wrong type is refused, unknown fields are kept); `kind: 'table'`; `RenderDescriptor.table` built by `buildTableDescriptor` in `packages/sdk/renderer/src/table.ts` (typed grid with sanitised cells; bound table with pre-formatted rows, sort keys, search text, cap `tableMaxRows` = 1,000, `truncated` / `totalRows`). The walker no longer resolves a table's gateway binding a second time as if it were a content field.

- Zod types for `ElementTable`, `TableCell`, the column; `kind: 'table'`; `RenderDescriptor.table`.
- `walkNode`: typed grid (sanitised) and bound table (resolve the node's `dataBinding` / `gatewayBinding`, build columns, format cells with `applyTransform`, `sortKeys`, `search`, the cap).
- *Tests*: `kind.test`, `walk.test` for static, Data Class, gateway, no columns (detected), formats, links refused when unsafe, hostile cell HTML, prototype keys, empty list, the cap.
- *Acceptance*: the probe that today returns `children=0, content=""` returns a populated `table`.

### Phase 3: the controller, shared with the editor (S-M)  — **done 2026-10-12**

Shipped in `@whoobe-cms/schema` (`table-view.ts`), not in the renderer as first written: the editor depends on the schema package only. `buildTableRows` and `computeTableView` are called by the editor's composable and by the descriptor builder; the parity test compares the descriptor's rows and views with the direct call. Behaviour of the editor was re-checked state by state after the change (pages, sort, search, counter, switches off, link and label cells).

- `computeTableView` in the renderer, built from the existing `table-binding.ts` functions.
- `useBoundTable` in the editor reimplemented on top of it; the existing render checks keep passing.
- *Tests*: view for every state (pages, last short page, lazyload, search, sort, empty), plus the **parity test**: one fixture, editor path versus descriptor path, identical views.

### Phase 4: the adapters (M each)  — **done 2026-10-12** (React/Next, Vue/Nuxt, Svelte)

Shipped: `table.tsx` (React, `DefaultTable` + `useTableView`), `table.ts` (Vue, the same), `WhoobeTable.svelte`; registry key `table` in all three; `tableMaxRows` passed through the React, Vue and Svelte options and the Next and Nuxt page helpers. The transitions of the controls are one shared state machine, `reduceTableState` in the schema package, tested without a DOM; the markup is tested as server-rendered output (first page, counter, pager, sort buttons with `aria-sort`, search box, More button, empty text, the row-cap note, hostile content inert, a registry override). Not done: a build of a real generated site to see the CSS and the hydrated behaviour in a browser, and GSAP on the table.

- React/Next: `DefaultTable`, `useTableView`, registry key `table`. Vue/Nuxt: the same. Svelte: the same, if D2 says so.
- *Tests*: component tests as for the slider (initial HTML has page 1; clicking *Next*, a header and typing in the box change what is drawn), SSR output contains the first page, hostile content is inert.
- *Acceptance*: a generated Next site and a Nuxt site show a bound table with the data of the editor's preview, sort/search/page work, the counter is right.

### Phase 5: optional

- Pagination of container repeaters in the SDK on the same controller.
- "Render every row in the HTML" option.
- Server-side mode for very long lists (public endpoint with page, sort, search; signed binding; rate limits).
- Static export auto-configuration for Next (separate, already a known gap).

### Order and size

```
Phase 0 -> Phase 1 (independent)
        \-> Phase 2 -> Phase 3 -> Phase 4 (React -> Vue -> Svelte) -> Phase 5
```

The smallest useful release is phases 0 to 2 plus the React adapter: typed and bound tables, with paging, sorting and search, on Next sites.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Three renderers drift apart (editor, React, Vue, Svelte) | one controller and one parity test (3.2); markup copied from one reference |
| Payload size on long lists | binding limit + hard cap + warning; server-side mode later |
| Missing styles in generated sites | phase 1 first; build a real fixture in the test |
| A new `*Class` field is added and forgotten by the collector | the node-type walk test (3.6) |
| Hydration mismatch (server first page versus client state) | the client starts from the same initial state; no randomness, no `Date` in the render |
| Stale tables on a static site | document it: data is as old as the last build or revalidation |
| Svelte parity expectations | decide D2 explicitly; today Svelte lacks the slider as well |

## 7. Documentation to change when it ships

`docs/release/content/table-element.md` (the "Limits" section: generated sites and the SDK), `docs/release/content/headless-sdk.md` (the `table` kind and
`useTableView`), `docs/release/content/publishing/website-publishing.md` (the safelist), the release notes, and `CHANGES.md`.

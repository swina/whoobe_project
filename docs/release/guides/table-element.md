# Table element: static or bound to data

The **Table** element (Elements > Table) draws a real HTML table. It works in two ways: by hand, as a grid you type in, or **bound to a
list**, where the rows come from a Data Class or from a gateway endpoint and the visitor can page through them.

## 1. A table you type

Drag a Table in. In the bar above it: add or remove rows and columns, switch the header and the footer on or off. Click a cell to type in it
or to give it a column span / row span and its own classes. The styles of the header, body and footer rows and cells are in the toolbar's
*Table classes*.

## 2. A table bound to data

Select the table and use the toolbar buttons that every element has:

- **Bind to data object** (the database icon): pick the Data Class, choose *Query* (a list), and set the filters, the order, an offset and a
  limit if you want.
- **Bind to gateway endpoint** (the network icon): pick the endpoint and route, then choose the field that holds the **list** (an array in the
  reply); you can filter the items there.

The table now shows **one row per record**. The bar above it changes to a **Columns** panel:

| Control | What it does |
|---|---|
| **+ column** | adds a column: the header text and the **field** to show. The field is the name of the Data Class attribute, or a path into the gateway item (`address.city`, `items[0].name`). System fields such as `updatedAt` also work for a Data Class. |
| **Choose fields** | opens the list of the fields found in the first record, with a check box each: tick a field to add its column, untick it to remove it. The last column cannot be removed. |
| **Add missing fields** | adds a column for every field that is not a column yet. It never replaces the columns you have: their headers, formats, classes and order stay. |
| **Columns (n)** | the arrow in front folds the whole panel away. |
| Cell classes, Header classes | Tailwind classes for the cells of that column and for its header cell, on top of the table's own body and header cell classes. |
| Format | *Plain*, or *Format date*, *Format number*, *Truncate text*, *Turn into link* (the same transformers as any bound field, with their default options). |
| ← → × | reorder or remove a column. |
| **Empty text** | what a table with no record says (default "No data"). |

If you set no column, the table shows the fields of the first record (as many as 12); the first change you make turns them into real columns. The header row is the column headers; switch it off with *Header*. A
bound table has **no static footer**: its footer area is used by the pagination.

The rows are text: a value is never interpreted as HTML. A *Turn into link* column becomes a link only to a safe address (http, https,
mailto, tel or a path on the site).

## 3. Pagination

Set it in the same binding window:

- **Rows per page** (0 or empty = every row on one page).
- **Standard**: *Prev* and *Next* with "Page 2 of 5", or **Lazy load**: a counter ("20 / 87") and a *More* button, with its text and Tailwind classes.
- **Pagination container CSS**: the classes of the area under the rows.

The same settings now work for a list bound to a **gateway endpoint** (the window has a *Pagination* section), and for repeater containers
bound the same way. Paging happens **in the browser**, over the list that was fetched: use the filters, the order, the offset and the limit
of the binding to keep that list a reasonable size, because all of it is downloaded.

## 4. Limits

- **Published sites generated for Next.js or Nuxt, and the headless SDK, do not draw the Table element at all** (with or without data): the
  element is not part of what the SDK renders. A table is drawn by the editor application (the editor, its preview and the pages it serves). Use a bound container for a list in a generated site.
- No column sorting or search in the table; no sticky header; no choosing the number of rows per page by the visitor.
- Merged cells (column and row spans) belong to the typed table; a bound table does not use them.
- A column's format uses the transformer's default options; the options themselves (a date style, decimals) are not editable per column yet.
- Pages are cut in the browser. A very long list is still downloaded whole; limit it in the binding.

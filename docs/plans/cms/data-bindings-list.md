# Data bindings list

Admin dashboard > Data & Communication > **Data bindings**. One list of every page and snippet that shows dynamic data, from Data Objects (`dataBinding`) or from an Integrations route (`gatewayBinding`). Same idea as the Automations list ([automations-panel.md](../automations/automations-panel.md)): pages and snippets are read whole and scanned in the browser by `collectDataBindings()` in `@whoobe-cms/schema` (`packages/sdk/schema/src/data-bindings.ts`); nothing is stored.

## Recommended process

1. **Create the snippet** with the block that shows the data.
2. **Bind it there** (Data Object class, or an Integrations endpoint and route).
3. **Insert the snippet** in the pages from the editor's Snippets panel, instead of binding the same data again in each page.

Inserting a snippet puts a **copy** in the page (new element ids, `sourceSnippetId` stamped on the copy, see `insertSnippetNode`). The page can change its copy freely. It then appears in this list like any other page with a binding, marked "from <snippet>", so the data it shows is still easy to find. Changing the snippet afterwards does **not** change pages already built from it; the list shows, for each snippet, in how many blocks of pages it was used, to know where a change would have to be repeated.

## What a row is

One row per page or snippet and per target: the Data Class, or the endpoint and route. A block with ten bound fields is one row with "Elements: 10"; "Open" opens the editor with the first of them selected.

| Column | Meaning |
|---|---|
| Where | page or snippet, its title, "(draft)" for an unpublished page |
| Website | the page's website (snippets have none) |
| Bound to | Data Object class, or API endpoint and route |
| Elements | bound elements with that target |
| Snippet | page row: the snippet it was inserted from, or "built in the page"; snippet row: how many blocks of pages were built from it |

Filters: text (page, snippet, class, endpoint, route), Data Objects or API, inserted from a snippet or built in the page, website (keeps the pages of that website only).

## Limits

- A binding is found in the `dataBinding` / `gatewayBinding` of an element. Cell-level and link bindings (`dynamicLink`) are not listed.
- Pages not built from a snippet cannot be tied to one: the link is `sourceSnippetId`, kept only while the block stays in the page; a snippet that was deleted shows as "(deleted snippet)".
- "Used in" counts blocks carrying the snippet id in the pages' content, not in other snippets.

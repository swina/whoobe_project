# How to Link a Data Object List to a Single-Record Detail Page

This is a step-by-step walkthrough for the feature described in `docs/plans/website/website-paths.md`: a "list" page (e.g. all news articles) where each record links to its own "detail" page (e.g. one specific article), addressed by a URL like `/it/news/my-article`.

## The one thing that isn't obvious

**There is no separate "single object" binding mode.** Both the list page and the detail page use the exact same "Dynamic Query" binding mode. The only difference is the **filter**:

- **List page**: Dynamic Query with no narrowing filter (or a broad one like `category = news`) → resolves to *many* records → renders as a repeater.
- **Detail page**: Dynamic Query with a filter like `slug = {slug}` → when a real value is substituted in from the URL, it narrows to *exactly one* record → the same repeater mechanism ends up rendering once, which is what makes it act like a single-record page.

So "binding a single object dynamically" = "Dynamic Query, filtered down to one match by a `{placeholder}` in the filter value." Keep that in mind through the steps below.

---

## Part A — Build the detail page (shows one record)

1. **Create a new page** (`New` in the toolbar, or `Save Template` on first save) and give it a **dynamic path**, e.g.:
   ```
   /it/news/{slug}
   ```
   The `{slug}` part can be any name you like, but it must exactly match a field name on your Data Class (case-sensitive) — see step 4.

2. **Select the root/content container** you want to hold the article's content, and click the **database icon** ("Bind to data object") in the floating toolbar.

3. In the picker:
   - Pick your **Data Class** (e.g. `News`).
   - Switch to **"Dynamic query"** mode (not "Select one" — "Select one" hardcodes a single fixed record, which is not what you want here).

4. **Add a filter** (`Add filter`):
   - **Field**: the field that identifies one record — typically the same one your path pattern uses (e.g. `slug`).
   - **Operator**: `=`
   - **Value**: type the placeholder literally, exactly matching your path pattern's placeholder name — e.g. `{slug}`.

   This is the whole mechanism: the `{slug}` you type here is not a real value, it's a marker that gets substituted with whatever the visitor actually requested in the URL, at resolve time.

5. Leave **Order by / Offset / Limit / Rows per page** at their defaults — they're not needed when a filter already narrows the result to one record.

6. Scroll down to **"Bind to field"** and click **"Whole object"** (not a specific field). This makes the *container* itself the data-bound thing, so every element you put inside it can pull whichever field it needs from whichever record ends up matching.

7. Click **Bind**.

8. **Bind the individual elements inside that container** to show real content (title, image, body, etc.) — for each child element:
   - Select it, click the database icon, pick the **same Data Class**.
   - Mode can stay **"Dynamic query"** — you do **not** need to set any filters here. A child bound this way automatically inherits whichever record its parent container resolved to (that's what "Whole object" on the parent set up in step 6).
   - Scroll to "Bind to field" and pick the specific field this element should show (e.g. `title` for a heading, `image` for a picture).
   - Click Bind.

Repeat step 8 for every field you want to display on the detail page.

---

## Part B — Build the list page (shows many records)

1. Create (or open) the page that should show the list (e.g. a "News" listing page, with a normal, static path like `/it/news`).

2. Select the container that should repeat once per record, click the database icon, pick the same **Data Class**, switch to **"Dynamic query"** mode.

3. This time, set filters (or leave them empty for "all records"), and configure **Order by / Offset / Limit / Rows per page** however you want the list sorted and paginated. (`Order by` picks a field + ascending/descending; `Rows per page` adds Prev/Next controls automatically once there are more records than fit on one page.)

4. Scroll to "Bind to field" and click **"Whole object"** again, then **Bind**.

   The container now renders one copy of its children per matching record — both in the editing canvas and in Preview.

5. Bind the child elements inside it exactly like step 8 in Part A (Dynamic Query mode, same Data Class, no filters needed, just pick the field per element).

---

## Part C — Link each list record to its detail page

1. Inside the list container, select the element that should become the clickable link — this can be the record's whole card/container, a "Read more" button, the title itself, etc.

2. Click the **link icon** (chain-link icon) in the floating toolbar.

3. Below the plain URL field, you'll see **"Link to a page (per record)"**. This button is only enabled when the selected element is inside a data-bound list — if you see "Only available inside a data-bound list", you've selected something outside the collection container from Part B; select an element inside it instead.

4. Click it. Two dropdowns appear:
   - **Page**: only pages with a *dynamic* path pattern show up here (e.g. your `/it/news/{slug}` detail page from Part A). If your detail page doesn't show up, double check its path actually contains `{...}`.
   - **Field**: pick the field on *this* record that should fill the detail page's placeholder — this must be the same field your detail page's filter uses (e.g. `slug`, matching Part A step 4).

5. Click **Apply**.

Each rendered record now links to its own `/it/news/{that record's slug}` — computed individually per record, not one static URL repeated for every item.

---

## Part D — Test it

Filter/URL substitution only happens in **Preview** (there's no real live URL being visited while you're editing) — the plain editing canvas will just show the container with no data if it needs a `{slug}` value it doesn't have yet.

1. Open the **detail page**, click **Preview**.
2. Since its path is dynamic, a **"Preview as path"** field appears in the Preview toolbar. Type a real path, e.g.:
   ```
   /it/news/my-first-article
   ```
   (the value after the last `/` must match a real value of the field you filtered on, for a record that actually exists).
3. Confirm the correct single record's content renders.
4. Open the **list page**'s Preview and click one of the links Part C built. It opens in a **new tab**, rendering the actual resolved detail page (real record data, not a blank page) — this new tab is served by the same `whoobe-one-spike` dev server via a catch-all route (`apps/whoobe-one-spike/src/views/PublicPage.vue`) that looks the page up the same way a real visitor's request would, then renders it read-only. If you instead see "Page not found," double-check the record actually has a value for the field you picked in Part C step 4, and that the detail page is published.

This is still a dev-preview-tool rendering (there's no real deployed production frontend for this project yet), but the page shown is the genuine, fully resolved result — same data, same URL a real production site would use.

---

## Quick checklist

- [ ] Detail page created with a path containing `{name}` (e.g. `/it/news/{slug}`)
- [ ] Detail page's container: Dynamic Query, filter `field = {name}` (exact same name as the path placeholder), Whole object
- [ ] Detail page's inner elements: Dynamic Query (no filters needed), bound to individual fields
- [ ] List page's container: Dynamic Query, Whole object (filters/order/pagination as desired)
- [ ] List page's inner elements: Dynamic Query (no filters needed), bound to individual fields
- [ ] The linking element inside the list: Link icon → "Link to a page" → detail page + matching field
- [ ] Verified the detail page via its own Preview → "Preview as path"
- [ ] Verified the list page's links open a new tab and render the correct real record

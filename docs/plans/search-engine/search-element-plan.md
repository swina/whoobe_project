# Search Element

Since the system has its proper search engine, whoobe-one-spike editor should have a search element to add to canvas. The search element should be also configurable (Advanced tab) in order to limit the search to:
- objects in a class or more
- assets
- pages

## Implemented (2026-08-14)

- **Palette** (`ElementsClass.js`): new `search` group with a `Search` element (`Search()` builder → `tag: 'search'`, `element: 'search'`, `searchConfig` with `types.page/object/asset` + `classIds`, `placeholder`).
- **Rendering**: `SearchElement.vue` (globally registered in `main.ts`) renders the search box on the canvas, the preview tree and the public page. `BlockElement.vue` (editing: `:editing` guard, select-only, never submits) and `BlockElementPreview.vue` special-case `tag === 'search'` so the generic branch's `v-html`/contenteditable never touch the interactive component.
- **Behaviour**: submits to the spike's own `/search` route (SearchResultsView.vue), encoding the scope as `type` (comma-separated, single value if one) and `classId` query params; `search-api.ts` supports `type` arrays, the public `/public/search` endpoint already accepted both.
- **Advanced tab** (`AdvancedPanel.vue` → `SearchConfigControl.vue`, mirroring `FormConfigControl.vue`'s modal): toggles for Pages / Assets / Objects plus a class multi-select (empty = all object classes) and the placeholder; summary label shows the scope.
- Verified: `?q=...&type=object,asset` and `?q=...&type=object&classId=...` are accepted by the public endpoint (classId returns 0 for unpublished draft classes, as expected - public search serves published rows only).

## Dropdown (2026-08-14)

In addition to the `/search` navigation, the box shows a **live results dropdown** while typing (debounced 300ms, min 2 chars, scoped by the same `searchConfig` types/classes, pageSize 8) - loading/error/no-results states, type badges, highlight; Escape/outside-blur closes it. The dropdown's Tailwind styling is driven by `searchConfig.dropdownClass` over a built-in default (blank config = default), exposed in SearchConfigControl's "Dropdown classes" field. How admins manage that class per-site (site settings? per-element presets?) is still open - see the follow-up note below. On the editing canvas (`:editing`) the box never submits or navigates (result clicks are preventDefault'd), but it **does** fetch and show the dropdown so the admin can see and tune its custom classes live.

### Open question: managing the dropdown class
"later we will see how to manage the dropdown class" - the field is stored/editable per element today; a per-site default and/or a curated set of presets is a future follow-up.

## Input / button custom classes (2026-08-14)

`searchConfig` gains `inputClass` and `buttonClass` - extra Tailwind utilities appended to the search input and the submit button on top of their built-in defaults (blank = default), editable in SearchConfigControl. A conflicting same-property utility resolves per the Tailwind cascade (the built-in `w-full` on the input wins over a custom `w-*` - use `max-w-*` to size the input without fighting it).

## Container div + button icon (2026-08-14)

The element now renders as **container `<div>` → `<form class="w-full">`**. The element's own custom classes land on the container div (a plain block - no baked-in width), so styling the "form container" (width, bg, padding, border, centering) works without fighting the form's `w-full`. `searchConfig` also gains `buttonLabel` (default "Search") and `buttonIcon` (default false) - when `buttonIcon` is on the submit button shows a search icon instead of the label text (still `aria-label`'d).

## Custom classes on the element (2026-08-14)

The Search element's root `<form>` now carries **only** the element's own custom classes (merged from the parent) - the structural `flex`/`w-full` layout moved to an inner wrapper, so a custom `w-64`/`max-w-md`/`bg-*`/etc. is no longer overridden by a baked-in utility in the Tailwind cascade. The editor canvas uses a select-only click (no preventDefault, unlike other elements) so the input stays focusable and the live dropdown is visible while managing `dropdownClass`.

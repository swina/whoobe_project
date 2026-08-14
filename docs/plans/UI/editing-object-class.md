# EDITING OBJECT CLASS

The editor of the object classes > View layout should open a new subtab where the sections > fields are organized in a tree view. This will reflect in the UI with a tab for each define section with the relative fields associated.

For the list view it should be better if the user can create custom list view (select fields to view) and save as presets in order to recall them. This option should be available from the list view and not in the settings

## List Layout tab (2026-08-14)

A third subtab, **List Layout**, defines the class's default listing columns (the default listing in the Objects tab):

- Ordered list of columns (reorderable with ↑/↓, removable with ✕, each with an optional custom header title that overrides the field's label).
- New columns are picked from the class's named fields plus the system columns (Key / Path, Locales, Class, Status, Modification Date - shared vocabulary `utils/list-columns.ts`).
- Stored in the class's `viewConfig.listColumns` (`ClassViewConfig` in `packages/core/src/schema/dynamic.ts`); empty list keeps the existing "all columns" behavior.
- Precedence in `ObjectsView.vue`: user-side default preset (View ▾ menu) > class List Layout > all columns. The View ▾ menu also offers "Use class default listing" to re-apply it anytime.

## Relation display field (2026-08-14)

Relation-flavored fields (any field with `relationTarget`) show a "Show: …" picker of the **related class's fields** in both the View Layout tree rows (sections + Ungrouped) and the List Layout column rows. The chosen field is stored as `relationDisplayField` on the field definition itself (`ClassFieldDefinition` in `packages/core/src/schema/dynamic.ts`) - one source of truth, like `relationTarget` - and is used wherever a human-readable label for the relation is needed:

- Object listing columns: `ObjectsView.vue` resolves each related object (via the shared `useRelationOptions` cache) and renders `relationDisplayField`'s value, falling back to the related object's `key`.
- Object edit form pickers: `DataObjectFieldControl.vue`'s relation `<select>`s (relation select, manyToOneRelation, multi-relation family) label options with `relationDisplayField`'s value.

Absent = existing behavior (show the related object's `key`).

Also feeds the search index: `packages/core/src/search/indexer.ts` resolves each relation's display label from the related object (same-locale row) and appends it to the indexed body at reindex/index time, so e.g. a Product is findable by its Category's name.

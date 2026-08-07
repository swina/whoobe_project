# Integrating Data Objects into Editor Elements/Blocks

## 0. Context and motivation

The existing plan (`docs/plans/cms/whoobe-one-editor-integration-plan.md`) completed all six phases: the page/document data model (`whoobe_pages`), Pimcore migration retargeted at `Element` trees, embedding into `admin-dashboard`, and UI wiring. Its §5 explicitly deferred **data integration — binding an element or a page to structured data** — as the next thing to design once Data Objects infrastructure itself was real.

**Data Objects infrastructure is now real** (`data_classes`/`data_objects`/`data_components` tables, full CRUD on `core-api`, public/published endpoints, preview tokens, workflow, dynamic Zod schema compilation, and an admin-dashboard Data Objects UI). What's missing: the editor-side mechanism to bind an element on the canvas to a data object (or a specific field of one) so that at render time the element displays live data instead of static content.

The target editor is `whoobe-one-spike` (the CMS's page composer). `whoobe-studio` is deprecated per the earlier plan, but its existing `WhoobeBlockNode.dataBinding` field is noted as prior art to review.

## 1. Terminology

- **Data Object**: a row in `data_objects`, an instance of a `data_class`. Has an `id`, `classId`, `attributes: Record<string, unknown>`, `locale`, `published` status, etc.
- **Data Class**: a schema definition in `data_classes` with typed `fields: ClassFieldDefinition[]`.
- **Binding**: the link between an editor `Element` and a data object (or data object field).
- **Render-time resolution**: the step where a bound element fetches its referenced data object and substitutes field values into the rendered output.
- **Element**: the node model in `whoobe-one-spike`'s `ElementsClass.js` — has `content`, `link`, `image`, `data`, `blocks`, etc.

## 2. Design decisions

### 2.1 Binding model: per-element `dataBinding` field

Add a `dataBinding` property to the `Element` class (mirroring the concept already in `WhoobeBlockNode.dataBinding`, but richer):

```ts
interface ElementDataBinding {
  /** The data class name this binding targets (e.g. "Product", "Post") */
  className: string
  /** Specific object ID, or null if resolved dynamically */
  objectId?: string | null
  /** Which field of the data object to bind (e.g. "title", "description", "price").
   *  If null, the whole object is bound (for container/repeater use). */
  field?: string | null
  /** Which property of the Element the binding replaces.
   *  'content' | 'src' | 'href' | 'alt' | 'icon' | 'style' | 'custom'
   *  'custom' means the binding is used programmatically (via this.data). */
  target: string
  /** For 'custom' target, which key in this.data to populate */
  dataKey?: string | null
  /** Optional: how to select the object when objectId is not hardcoded:
   *  'first' | 'single' | 'query' | 'parent' | 'currentPage'
   *  'query' requires filters below. */
  resolveMode: 'explicit' | 'first' | 'query' | 'parent' | 'currentPage'
  /** Optional filter conditions (only when resolveMode === 'query'). */
  filters?: DataBindingFilter[]
  /** Locale override; defaults to the page's locale. */
  locale?: string | null
}

interface DataBindingFilter {
  field: string
  operator: 'eq' | 'neq' | 'in' | 'contains' | 'gt' | 'lt'
  value: unknown
  /** If true, value is itself a data binding (resolved at render time). */
  valueIsBinding?: boolean
}
```

### 2.2 Binding targets by Element type

| Element type | Allowed targets | Notes |
|---|---|---|
| Paragraph, Heading, Span, Inline, Blockquote, Code | `content` | Text content from a data field |
| Image | `src`, `alt` | `src` bound to an image/asset field; `alt` to a text field |
| Link (any element with `link` set) | `href`, `content` | `href` bound to a link/relation field |
| Button, Submit | `content` | Button text from a data field |
| Icon, MIcon | `icon` | Icon name from a data field |
| Video, Youtube, Vimeo | `src`, `content` | Video ID |
| Flexbox, Grid (containers) | `custom` (repeater) | Container iterates over a collection |
| Slider | `custom` (slides from data) | Each slide populated from one object |
| Input, Textarea, Select | `custom` (value/options) | |
| Any | `style` | CSS class/style from a data field |

### 2.3 Render-time resolution strategy

**Two-tier resolution:**

1. **Editor canvas** (editing mode): bound elements render a visual placeholder showing the class name and field (e.g. `{Product.title}`). A badge/border indicates the element has a binding.

2. **Preview mode / production render**: the renderer walks the element tree before rendering, resolves each `dataBinding`, fetches the referenced data object (or collection) from `core-api`'s public endpoints, and substitutes the values.

### 2.4 Data flow

```
Element.dataBinding set in editor
  → persisted as part of the page content JSON
  → on render (preview/production):
    1. Collect all unique dataBindings from the tree
    2. Batch-fetch referenced objects via GET /public/data-objects
    3. Build a Map<objectId, DataObjectRecord>
    4. Walk tree again, for each bound element:
       a. Look up the object
       b. Extract the target field from attributes
       c. Substitute into the Element's render property
       d. For containers with resolveMode='query', clone children per object
```

### 2.5 Relationship to existing WhoobeDataBinding

The legacy `WhoobeDataBinding` (`packages/core/src/cms/block-schema.ts`) has `{ objectId, field, locale }` — a subset of what's proposed here. The new `ElementDataBinding` supersedes it. During the interim they coexist (the new model lives only in `whoobe-one-spike`'s `Element` class, not in `packages/core`).

## 3. Phases

### Phase 0 — Element class extension

Add `dataBinding` to the Element class (JS + .d.ts), ensure it round-trips through JSON serialization/deserialization.

**Files to change**:
- `apps/whoobe-one-spike/src/scripts/ElementsClass.js` — add `this.dataBinding = null` to constructor; add `setDataBinding(v)` setter
- `apps/whoobe-one-spike/src/scripts/ElementsClass.d.ts` — add `ElementDataBinding` interface and `dataBinding?: ElementDataBinding | null` to the Element type
- `apps/whoobe-one-spike/src/scripts/BlocksClass.js` — verify `cloneWithFreshIds` preserves dataBinding (not a DOM id, should survive clone)

**Verification**: typecheck clean; round-trip save/load preserves dataBinding.

### Phase 1 — Data Object Picker component

A modal/panel for browsing data classes, selecting an object (or setting up a query), and picking a target field.

**Files to create**:
- `apps/whoobe-one-spike/src/components/DataObjectPicker.vue`
- `apps/whoobe-one-spike/src/data-objects-api.ts`

**Picker UI flow**:
1. Choose class — list `data_classes` from `GET /data-classes`
2. Choose object or query — "Select one" (browse `GET /data-objects?classId=...`) vs "Dynamic query" (set up filters)
3. Choose field — show class fields filtered by compatibility with binding target
4. Set target — auto-detected from element type, overridable

**API client** (`data-objects-api.ts`):
- `listDataClasses()` → `GET /data-classes`
- `getDataClass(id)` → `GET /data-classes/:id`
- `listDataObjects(classId)` → `GET /data-objects?classId=...`
- `getDataObject(id)` → `GET /data-objects/:id`

**Verification**: open picker, see classes, click through to objects, pick field, confirm selection emits valid `ElementDataBinding`.

### Phase 2 — Binding UI in the editor

Add a "Bind Data" button in FloatingToolbar, show binding state on elements, allow unbinding.

**Files to change**:
- `apps/whoobe-one-spike/src/components/FloatingToolbar.vue` — add "Bind Data" button (`Database` icon), opens DataObjectPicker. Shows badge when current element has a binding.
- `apps/whoobe-one-spike/src/components/BlockEditor.vue` — mount DataObjectPicker modal.
- `apps/whoobe-one-spike/src/components/BlockContainer.vue` — show binding badge on elements with dataBinding.
- `apps/whoobe-one-spike/src/components/BlockElement.vue` — show binding placeholder (`{Product.title}` as muted overlay) when dataBinding is set.
- `apps/whoobe-one-spike/src/components/BlockSlider.vue` — same badge/placeholder treatment.

**Verification**: select element, bind it, confirm badge+placeholder shows. Save/reload confirms persistence.

### Phase 3 — Preview-mode data resolution

When the editor is in Preview mode, resolve data bindings so the page shows real data.

**Files to create**:
- `apps/whoobe-one-spike/src/scripts/data-resolver.ts` — walking tree, collecting bindings, batch-fetching, substituting values.

**Files to change**:
- `apps/whoobe-one-spike/src/components/preview/BlockContainerPreview.vue` — call resolveBindings; for collection binding, iterate children per object.
- `apps/whoobe-one-spike/src/components/preview/BlockElementPreview.vue` — substitute content/link/etc. with resolved values.
- `apps/whoobe-one-spike/src/components/preview/BlockSliderPreview.vue` — generate slide per object for collection-bound sliders.
- `apps/whoobe-one-spike/src/components/preview/DocumentPreview.vue` — trigger resolveBindings on full document.

**Verification**: create page with heading bound to data object's title, Preview mode shows real title.

### Phase 4 — Container-level and repeater bindings

Containers (Flexbox, Grid, Slider) bound to a collection of data objects duplicate their children once per object.

**Design**: container with `dataBinding.target: 'custom'`, `resolveMode: 'query'`, no `field` = "bind to collection." Children cloned once per object at render time.

**Files to change**:
- `apps/whoobe-one-spike/src/scripts/data-resolver.ts` — collection binding logic.
- `apps/whoobe-one-spike/src/components/preview/BlockContainerPreview.vue` — render children N times with per-object data.

**What does NOT change**: editor canvas still shows template children (one instance). Repeater expansion is preview/production only.

**Verification**: Flexbox with one child bound to product class query, Preview shows N copies.

### Phase 5 — Field-level binding in FloatingToolbar

Allow individual fields (image src, link URL, icon) to be bound separately via existing FloatingToolbar controls.

**Files to change**:
- `apps/whoobe-one-spike/src/components/FloatingToolbar.vue` — add binding buttons to Image, Link popovers.
- `apps/whoobe-one-spike/src/components/DataObjectPicker.vue` — add `targetFilter` prop to pre-filter by field type.
- `apps/whoobe-one-spike/src/components/BlockElement.vue` — show field-level binding placeholders inline.

**Verification**: Image element, open Image popover, bind URL to image field, confirm placeholder shows `{Product.image}`.

### Phase 6 — Data class field-aware template generation

Create an element group from a data class's fields, each pre-bound to its corresponding field.

**Files to create**:
- `apps/whoobe-one-spike/src/scripts/template-generator.ts` — maps `ClassFieldDefinition[]` → Element tree.

**Mapping**: `input`/`textarea`/`wysiwyg` → Paragraph bound to field, `image` → Image bound, `manyToOneRelation` → Link bound, `numeric` → Inline Text bound. Wrap in Flexbox with class name.

**Verification**: pick data class, "Generate template", canvas gets pre-built pre-bound element group.

### Phase 7 — Backend: batch data object endpoint

Add `GET /data-objects/batch?ids=id1,id2,id3` to core-api for efficient multi-binding resolution.

**File to change**:
- `apps/core-api/src/server.ts`

Also add public variant: `GET /public/data-objects/batch?ids=...` for production render-time (no auth, only published objects).

**Verification**: batch endpoint with known IDs returns all; mix of valid/invalid returns only valid.

### Phase 8 — Production render path

Extract resolution logic as a framework-agnostic pure function for use outside the editor (SSR, SSG).

**Files to create**:
- `packages/core/src/cms/data-binding.ts` — pure function: takes Element tree (JSON) + data-fetching function, returns resolved tree.

**Files to change**:
- `apps/whoobe-one-spike/src/scripts/data-resolver.ts` — refactor to import from `packages/core` for core logic, keep only Vue reactivity in app.

**Verification**: unit tests for pure resolver; Preview mode still works after refactor.

## 4. Open questions

1. **Binding storage: on Element vs. flat registry?** Per-element is simpler and survives move/copy. Matches existing `WhoobeBlockNode.dataBinding` pattern. **Recommend**: per-element.

2. **Editor canvas preview of bound data?** Static placeholder (`{Product.title}`) rather than live-fetching in the editor. Live preview can be a future enhancement. **Recommend**: placeholder-only for now.

3. **Slider + data: heterogeneous slides?** Require all slides to share the same structure when the slider has a collection binding. Mixed-content sliders cannot be data-bound.

4. **How does "currentPage" resolveMode work?** Requires adding `data_object_id` to `whoobe_pages` schema. **Recommend**: omit `currentPage` from Phase 0-3; it's a Phase 9 feature with its own schema migration.

5. **Data locale handling**: binding includes optional `locale`. If omitted, page's locale is used. If no object exists in that locale, fall back to default locale. **Recommend**: implement simple case first (page locale → data object locale).

6. **Permissions**: editor's picker needs OBJECTS_READ (already carried by admin session cookie). Public endpoints are unauthenticated. **Recommend**: no auth changes needed.

## 5. Non-goals

- Data object creation/editing from the page composer (stays in admin-dashboard)
- Real-time collaborative editing of bound content
- Inline editing of bound content in the editor canvas (edit the data object, not the element)
- i18n of binding labels (`{Product.title}` is English-only for now)
- Cache invalidation strategy for production rendering (fetch-on-every-render until perf data says otherwise)

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Data object API latency in Preview mode | Batch endpoint (Phase 7) reduces N requests to 1. Cache in reactive map. |
| Collection binding with many objects produces huge DOM | Limit to page size (e.g. 50) in query endpoint. Future: pagination. |
| Binding model changes after pages authored | `dataBinding: null` is default. New interface fields are optional. Old shapes render silently. |
| Users bind to deleted data objects | Preview renders muted `{Deleted Object}` placeholder. |
| Nested collection bindings | Preview depth limit (default: 1 level) to prevent explosive rendering. |

## 7. File change summary

| Phase | Files | Change type |
|---|---|---|
| 0 | `ElementsClass.js`, `ElementsClass.d.ts`, `BlocksClass.js` | Edit |
| 1 | `DataObjectPicker.vue` (new), `data-objects-api.ts` (new) | Create |
| 2 | `FloatingToolbar.vue`, `BlockEditor.vue`, `BlockContainer.vue`, `BlockElement.vue`, `BlockSlider.vue` | Edit |
| 3 | `data-resolver.ts` (new), 4 preview components | Create + Edit |
| 4 | `data-resolver.ts`, `BlockContainerPreview.vue` | Edit |
| 5 | `FloatingToolbar.vue`, `DataObjectPicker.vue`, `BlockElement.vue` | Edit |
| 6 | `template-generator.ts` (new), palette component | Create |
| 7 | `apps/core-api/src/server.ts` | Edit |
| 8 | `packages/core/src/cms/data-binding.ts` (new), `data-resolver.ts` | Create + Edit |

Total new files: ~5
Total files edited: ~18

## 8. Verification plan

Each phase verified independently:
- **Phase 0**: typecheck clean. Unit test: construct Element, set dataBinding, JSON round-trip preserves it.
- **Phase 1**: Open picker, confirm classes load, objects load, field selection works, valid binding emitted.
- **Phase 2**: Select element, bind it, badge/placeholder shows. Save/reload confirms persistence.
- **Phase 3**: Bound page in Preview shows real data. Unit test: resolveBindings with mock API.
- **Phase 4**: Container with collection binding shows N children in Preview. Unit test: collection iteration.
- **Phase 5**: Field-level bindings on Image src and Link href work independently.
- **Phase 6**: Generate from class produces correctly pre-bound element tree.
- **Phase 7**: Batch endpoint returns correct objects. Integration test.
- **Phase 8**: Pure resolver unit tests pass. Preview still works after refactor.
# Component Fields (reusable structured sub-types)

Plan for letting an admin define, from scratch, a reusable named "structured data block" type - assignable to a class field, holding an ordered repeatable list of typed items, each shaped like a small class of its own - the same concept Pimcore calls a **Field Collection**. This plan gives it a new name, **Component** (`ClassFieldDefinition.allowedComponentTypes`, a new `data_components` table), to avoid carrying Pimcore's own jargon into a feature meant to work identically well for a customer who never touched Pimcore. Sibling to `docs/plans/datamodel/advanced-data-modeling-plan.md` (Phase 6, which built the *rendering* side of this for migrated data) and `docs/plans/datamodel/native-class-authoring-plan.md` (§5, which explicitly deferred the *authoring* side this plan now picks up).

---

## 0. Terminology

- **Component**: this plan's new name for Pimcore's Field Collection concept - a named, reusable type definition (a field list, exactly like a class's own) that a `fieldcollections`-type field can hold an ordered, repeatable, mixed-type list of. Stored in a new `data_components` table, authored the same way a class's fields already are.
- **Component Type**: one specific named Component definition (e.g. "Banner", "ImageSlide") - the equivalent of one Pimcore Field Collection type (e.g. `ProductBanner`).
- Not to be confused with **`block`** (`ClassFieldDefinition.blockFields`) - an inline, repeatable group of fields defined directly on one field, with no shared name and no reuse across fields/classes. A Component is reusable and named; a `block` is neither. This plan does not touch `block` at all.
- Not to be confused with a **Vue component** (the frontend framework concept) - unfortunate naming overlap, unavoidable given how well the word fits the data-modeling concept too; context always disambiguates in practice (`data_components` the table vs. `ComponentSettingsCard.vue` the Vue SFC).

---

## 1. Where this stands today

- **The rendering/schema side of this is already real and working - for migrated data only.** `advanced-data-modeling-plan.md`'s Phase 6 built a genuine tagged-union repeatable-block editor: `ClassFieldDefinition.collectionTypes?: { name; label; fields }[]` (`packages/core/src/schema/dynamic.ts`) lets one `fieldcollections` field hold a mix of several distinct named types; `compileFieldSchema()`'s own `fieldcollections` case compiles a real `z.union(...)` across each type's own shape, discriminated by a `collectionType` literal; `DataObjectFieldControl.vue`'s `fieldcollections` case (when `field.collectionTypes` is populated) is a real editor - add/remove/reorder items, a "+ Add block…" picker across the allowed types, each item rendering that type's own fields via a recursive `DataObjectForm`.
- **But `collectionTypes` only ever gets populated one way: migration.** `migrate-classes` (`packages/migration-tool/src/pimcore-class-definition-parser.ts`) reads a Pimcore Field Collection type's real definition file (`var/classes/DataObject/Fieldcollection/Data/<Type>.php`) and writes the *fully resolved field list, embedded directly* into whichever class-field allows it. There is no path for a hand-authored class (via `ClassSettingsCard.vue`, `native-class-authoring-plan.md`'s own Class Builder) to define a Component Type at all - confirmed: `fieldcollections` isn't even in that editor's `FIELD_TYPES` list today.
- **`native-class-authoring-plan.md` §5 already named this exact gap and deliberately deferred it**: *"Does v1 need `fieldcollections` authoring at all? ... there is no native equivalent of 'define a new named, reusable repeatable block type' ... A real, separate authoring surface (define the type's own field list once, then allow it as one of several `collectionTypes` on a `fieldcollections` field) - deliberately deferred out of this plan's v1 rather than bolted on as an afterthought."* This plan is that deferred work.
- **Migrated Component (Field Collection) type definitions are denormalized today, not shared.** Each class-field that allows a given type (e.g. `ProductBanner`) carries its *own full copy* of that type's field list, embedded via migration - if two different classes' fields both allowed `ProductBanner`, migration would write it twice, independently. Real Pimcore Field Collections are genuinely shared/global definitions (one definition, referenced by name from any class). This plan's own new `data_components` table is a real, live, shared definition store - closer to real Pimcore semantics than the current migrated-data shape is. Reconciling the two (backfilling migrated `collectionTypes` into real `data_components` rows, deduplicating) is real, separate work - flagged in §5, not this plan's job.
- **No server-side schema validation exists for Data Object attributes at all, for any field type.** `compileDynamicSchema()`/`compileFieldSchema()` (`packages/core/src/schema/dynamic.ts`, 10 real Vitest tests) is fully built and tested but is never actually called anywhere in the running app - not by `core-api`'s `POST`/`PATCH /data-objects` routes (`apps/core-api/src/server.ts`, confirmed by grep - no reference to either function), and not by the admin-dashboard's own form either. This matters for this plan's own design (§2.3): a live, resolved-at-render-time reference from a field to its allowed Component Types introduces no new validation gap, because there was never any server-side validation to keep consistent with in the first place.

---

## 2. Design

### 2.1 New table: `data_components`

`packages/core/src/db/data-components-schema.ts`, deliberately structured like `data_classes` (`data-classes-schema.ts`) almost exactly - a Component Type is, structurally, "a class with no object instances of its own":

```ts
export const dataComponents = pgTable('data_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),   // e.g. 'Banner' - referenced by name from any class field
  label: text('label').notNull(),
  fields: jsonb('fields').notNull().$type<ClassFieldDefinition[]>(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
});
```

No `pimcoreId` column - this table is for natively-authored Components only in v1 (§5's own note on migrated-data unification). `data-components-records.ts` mirrors `data-classes-records.ts`'s CRUD functions (`listDataComponents`, `getDataComponent`, `createDataComponent`, `updateDataComponent`, `deleteDataComponent`) directly - same shape, same conventions, nothing novel.

### 2.2 `ClassFieldDefinition` addition

```ts
// Which named Component Types this `fieldcollections` field allows, by
// `data_components.name` - the natively-authored counterpart to migrated
// data's own `collectionTypes` (which stays exactly as-is; the two are
// resolved into the identical rendering shape client-side, see §2.3).
allowedComponentTypes?: string[];
```

Deliberately a *separate* field from `collectionTypes`, not a replacement - migrated classes keep working exactly as they do today, with zero changes to `compileFieldSchema()`'s existing `fieldcollections` case or to any already-migrated data.

### 2.3 Resolution: reusing the existing renderer unchanged

`DataObjectFieldControl.vue`'s real, working `fieldcollections` editor already branches on `field.collectionTypes`. Rather than changing that component, `DataObjectForm.vue` (which already reads a class's own `fields` before handing them down) resolves `allowedComponentTypes` into the identical `collectionTypes`-shaped array before the field ever reaches `DataObjectFieldControl.vue`:

```ts
// New computed, DataObjectForm.vue - resolves each allowed Component Type
// name against the already-loaded component library into the exact shape
// `DataObjectFieldControl.vue`'s fieldcollections case already expects.
const resolvedFields = computed(() =>
  props.fields.map((f) =>
    f.fieldType === 'fieldcollections' && !f.collectionTypes && f.allowedComponentTypes
      ? { ...f, collectionTypes: f.allowedComponentTypes.map((name) => componentsStore.components.find((c) => c.name === name)).filter(Boolean) }
      : f
  )
)
```

A new `componentsStore.ts` (mirrors `dataClassesStore.ts` - eager-fetch on creation, `components: DataComponent[]`) supplies the live library. Because §1's own finding confirms no server-side validation exists to keep in sync, this purely-client-side resolution is sufficient - not a compromise made for lack of a better option, just genuinely all that's needed given how this system already works.

### 2.4 Authoring UI

- **New `ComponentSettingsCard.vue`** (`apps/admin-dashboard/src/components/objects/`), a new Settings submenu entry "Components" (extends `SettingsSubSection` in `tabsStore.ts`, one more entry in `DashboardLayout.vue`'s `settingsSubItems` - the exact mechanical pattern `settings-ui-plan.md` already established for "Data Object Classes"/"Workflows"/etc.). List + create/edit/delete Component Types, each with its own field list.
- **Real code-sharing opportunity, not a duplication**: `ClassSettingsCard.vue`'s Fields-tab editor (name/title/type/mandatory/localized/relationTarget/options/`className`, ↑/↓ reorder - `apps/admin-dashboard/src/components/objects/ClassSettingsCard.vue`) is *exactly* the field-list editor a Component Type also needs, field-for-field. This plan extracts that block into a shared `FieldListEditor.vue` (props: `fields: ClassFieldDefinition[]`, emits updates) that both `ClassSettingsCard.vue` and the new `ComponentSettingsCard.vue` use - not two independently-maintained near-copies of ~150 lines that quietly drift apart, which is what building this plan without the extraction would produce.
- **`ClassSettingsCard.vue` changes**: `fieldcollections` added to `FIELD_TYPES` (labeled "Components (repeatable)" or similar - not "Field Collection", per this plan's own naming decision); when a field's type is `fieldcollections`, a multi-select of the Components library (`componentsStore.components`) sets `field.allowedComponentTypes`.

### 2.5 Guardrail: a Component Type in use

Mirrors `native-class-authoring-plan.md` §3.1's own field-rename/delete guardrail (`ClassSettingsCard.vue`'s existing "N existing objects have data in this field" block, `server.ts`'s `PATCH`/`DELETE /data-classes/:id` checks) - the same principle, applied one level down: deleting a Component Type, or renaming/retyping one of *its own* fields, while any `data_objects` row anywhere has a `fieldcollections` item tagged with that Component's `name` should warn/block, not silently orphan stored data. Real, not hypothetical, work (a `DELETE /data-components/:id` route needs a real "is this name referenced anywhere" check across `data_objects.attributes` - not a simple foreign key, since components are referenced by name inside JSONB, not a real column) - scoped as its own phase item (§4) rather than hand-waved into "just like classes already do it," since the actual query shape differs meaningfully (searching inside JSONB array items for a matching `collectionType` string, not a straightforward `WHERE class_id = ?`).

---

## 3. Backend

New `core-api` routes, mirroring `/data-classes`'s own shape and permissions exactly (`PERMISSIONS.OBJECTS_READ`/`OBJECTS_WRITE`, the same constants every other resource already reuses - no new permission strings, per this codebase's own repeatedly-corrected precedent):

- `GET /data-components`, `GET /data-components/:id`
- `POST /data-components`, `PATCH /data-components/:id`
- `DELETE /data-components/:id` (with §2.5's real in-use check)

One new, purely-additive Drizzle migration (`CREATE TABLE data_components (...)`), added to `drizzle.config.ts`'s schema list alongside `data-classes-schema.ts`.

---

## 4. Explicit relationship to prior plans

- **`advanced-data-modeling-plan.md` §6.5/Phase 6**: unchanged, not touched - migrated classes' `collectionTypes` keep rendering exactly as they do today. This plan adds a second, parallel way to arrive at the same rendering shape, resolved at read time (§2.3), not a replacement.
- **`native-class-authoring-plan.md` §5**: this plan is the deferred item that section named directly ("a real, separate authoring surface... deliberately deferred out of this plan's v1").
- **Migrated-data/Component unification** (deduplicating denormalized `collectionTypes` copies into real shared `data_components` rows, §1's own finding): real, worthwhile, explicitly **not** this plan's job - a natively-authored `data_components` table and migration's own denormalized-per-field-copy convention are left to coexist, not reconciled, until a future pass deliberately takes that on.
- **`block` fields**: untouched, unrelated - see §0's own terminology note on why these are a genuinely different concept this plan doesn't touch.

---

## 5. Open questions, stated rather than assumed

- **Nested Components** (a Component's own field list containing another `fieldcollections`/Component field) - Pimcore itself doesn't support nesting Field Collections, and this plan doesn't add support for it either; `compileFieldSchema()`'s existing recursion would very likely *technically* handle it (the same machinery `block` already recurses through), but it's genuinely untested territory, not a deliberate feature of this plan.
- **Component Type versioning / in-place field changes**: editing a Component Type's own field list (e.g. removing a field) after real objects already have `fieldcollections` items shaped by the old version - §2.5's guardrail blocks the destructive cases the same way class-field edits already do, but doesn't address the milder case (an item stored under an old field shape rendering slightly oddly against a newer, compatible-but-different field list) - stated as a real, small rough edge, not solved here.
- **Should the Components list be scoped/searchable once it grows large?** Fine for v1 (a flat list, matching `ClassSettingsCard.vue`'s own class list); a real UI concern only once a real install has dozens of Component Types, not before.

---

## 6. Proposed phases

- **Phase 1 - Data model + backend: DONE.** `data_components` table (`packages/core/src/db/data-components-schema.ts`, migration `drizzle/0014_sweet_lyja.sql` - a single new, purely additive table) and `data-components-records.ts` (CRUD, mirroring `data-classes-records.ts` exactly, plus `getDataComponentByName` for §2.3's future resolution step). `allowedComponentTypes?: string[]` added to `ClassFieldDefinition` (§2.2), alongside `collectionTypes` - unchanged, untouched. `core-api` routes (`apps/core-api/src/server.ts`): `GET`/`POST`/`PATCH`/`DELETE /data-components`, gated on the existing `PERMISSIONS.OBJECTS_READ`/`OBJECTS_WRITE` (no new permission strings, per §3's own stated intent) - `DELETE` has no in-use check yet, exactly as §2.5/Phase 4 scoped it to be real, separate work.
  - Verified: `pnpm run typecheck`/`test` clean in `packages/core` (33/33, unaffected) and `packages/migration-tool` (44/44, unaffected); `pnpm run typecheck` clean in `core-api`; `pnpm run build` (`vue-tsc` + `vite build`) clean in `admin-dashboard` (a sanity check only - this phase touched nothing on the frontend, §2.3/§2.4 are Phase 2/3's job). **Not verified**: no live-database exercise of the new routes/table (same stated gap as every prior backend phase in this plan family) and no browser click-through (no browser-automation tool available in this environment).
- **Phase 2 - Resolution + rendering: DONE.** `utils/data-components-api.ts` (HTTP client, mirrors `data-classes-api.ts` exactly) and `stores/componentsStore.ts` (mirrors `dataClassesStore.ts`'s own eager-fetch/refetch-after-mutation convention). `DataObjectForm.vue` gained a `resolvedFields` computed (§2.3) - for any `fieldcollections` field with no `collectionTypes` already embedded but a real `allowedComponentTypes`, resolves each name against `componentsStore.components` into the identical `{ name, label, fields }[]` shape `DataObjectFieldControl.vue`'s existing editor already consumes; a field with real migrated `collectionTypes` passes through completely untouched. Both rendering paths (the sectioned-tabs branch and the flat fallback) now read from `resolvedFields` instead of the raw `fields` prop - a real gap caught and fixed during this pass: the flat-fallback template branch (`v-for="field in fields"`) was still pointed at the raw prop after the `sections` computed was updated, which would have silently left Components unresolved for any class with no `viewConfig.detailSections` (i.e. most classes) had it shipped as first written. Because the resolution lives inside `DataObjectForm.vue` itself rather than a parent, every recursive instance (a `block` field's own repeatable rows, a `fieldcollections` item's own fields) gets it for free too, with no extra wiring.
  - Verified: `pnpm run build` (`vue-tsc` + `vite build`) clean in `admin-dashboard`; `packages/core` (33/33) and `core-api` typecheck both re-run and unaffected (Phase 2 is `admin-dashboard`-only); confirmed both new files and the changed `DataObjectForm.vue` compile through the live dev server. **Not verified**: no live-database exercise (no real Component Types exist yet to resolve against - that's Phase 3's authoring UI) and no browser click-through (no browser-automation tool available in this environment).
- **Phase 3 - Authoring UI: DONE.** New `FieldListEditor.vue` (§2.4) extracted whole out of `ClassSettingsCard.vue`'s own Fields tab - same field cards (name/title/type/mandatory/localized/options/relationTarget/`assetFilter`/`className`/↑↓ reorder), now a real shared component rather than something `ComponentSettingsCard.vue` would otherwise duplicate. Takes a `modelValue`/`update:modelValue` pair (structural changes - add/remove/reorder - emit a new array) plus per-field property edits (name/title/etc.) mutating the shared field objects directly, same as the original code already did; an `allowFieldCollections` prop (default `true`, passed `false` by `ComponentSettingsCard.vue`) keeps `fieldcollections` out of a Component's own type list - nesting a Component inside another Component is explicitly untested territory per §5, not silently permitted here.
  - `FieldListEditor.vue` also gained the real "Allowed components" checkbox picker (§2.4's own authoring step) - shown when a field's type is `fieldcollections`, listing `componentsStore.components`, writing `field.allowedComponentTypes`. `ClassSettingsCard.vue`'s own field-type list picked up `fieldcollections` (labeled "Components (repeatable)", not "Field Collection", per §0's naming decision) for free through this same shared editor - no separate change needed there.
  - New `ComponentSettingsCard.vue` - list/create/edit/delete Component Types, structurally near-identical to `ClassSettingsCard.vue`'s own class editor (deliberately: a Component Type is "a class with no object instances," §2.1's own framing) minus the View Layout tab (no detail-form-layout concept for a Component in v1) and minus the "N existing objects" guardrail (no direct `data_objects.classId`-shaped column to check - a real, visible amber notice states this plainly instead of silently omitting it, linking to §2.5/Phase 4). New "Components" Settings submenu entry (`tabsStore.ts`'s `SettingsSubSection`, `DashboardLayout.vue`'s `settingsSubItems`/`settingsSubLabels`, `SettingsView.vue`) - the same mechanical extension pattern `settings-ui-plan.md` already established for every other entry.
  - Verified: `pnpm run build` (`vue-tsc` + `vite build`) clean in `admin-dashboard`; `packages/core` (33/33) and `core-api` typecheck re-run and unaffected (Phase 3 is `admin-dashboard`-only); confirmed all new/changed files compile through the live dev server. **Not verified**: no live-database exercise (no real Component Types exist yet in any real database to author/resolve against) and no browser click-through (no browser-automation tool available in this environment) - same stated gap as Phases 1-2.
- **Phase 4 (real, separate) - In-use guardrail: DONE.** `isDataComponentInUse(name)` (`packages/core/src/db/data-components-records.ts`) is the real, different-shaped check §2.5 called for - components are referenced by *name* from inside an arbitrary `fieldcollections` field's own array-of-`{ collectionType, ...fields }` items in `data_objects.attributes` JSONB, under whatever field name a given class happened to give it, so there's no foreign key or fixed column to check. Implemented as an application-side scan (fetch every object's `attributes`, check each array-valued key for a matching `collectionType`) rather than a deep-JSONB SQL query (`jsonb_each` + `jsonb_array_elements` would work, but is real, separate complexity) - a deliberate choice matched to this system's own actual scale (the real pilot migration this codebase has already run totals 202 objects, per `advanced-data-modeling-plan.md`), stated in the function's own comment as a decision that wouldn't hold up unchanged at a much larger scale, not assumed away.
  - `PATCH /data-components/:id` now blocks a field disappearing or changing type while the component is in use (mirrors `PATCH /data-classes/:id`'s own guardrail exactly); `DELETE /data-components/:id` blocks outright while in use. New `GET /data-components/:id/usage` route lets the UI show a live warning proactively (`ComponentSettingsCard.vue`'s `inUse` state, fetched on open) rather than only reactively via a 409 after a failed save/delete - the same UX precedent `ClassSettingsCard.vue`'s own `objectCount` already established.
  - Verified: `pnpm run build` (`vue-tsc` + `vite build`) clean in `admin-dashboard`; `packages/core` (33/33), `core-api`, and `packages/migration-tool` (44/44) typecheck/test re-run and unaffected; confirmed the changed files compile through the live dev server. **Not verified**: no live-database exercise of the actual scan query against real `fieldcollections` data (no real Component Types or referencing objects exist yet in any real database) and no browser click-through (no browser-automation tool available in this environment) - same stated gap as every earlier phase.

# Advanced Data Modeling & Data Object Migration

Plan for building Whoobe CMS's real **Data Objects** system (Pimcore's PIM/MDM concept - classes with admin-defined fields, and object instances of those classes) and the pipeline to migrate real Pimcore Data Object classes/instances into it. Sibling to `docs/plans/cms/whoobe-one-editor-integration-plan.md` (Pages) and building directly on `docs/plans/backend/object-publish-workflow-plan.md` (publish/workflow gate) and `docs/plans/backend/auth-permissions-plan.md` (RBAC, already implemented) rather than re-deciding what those already settled.

---

## 0. Terminology

- **Class**: an admin-authored schema (a named set of typed fields) - Pimcore's `classes` table + on-disk class-definition files. The Whoobe equivalent is a new `data_classes` table (design in §4).
- **Object**: one instance of a class - a row of actual data shaped by its class's fields. The Whoobe equivalent is a new `data_objects` table (design in §4).
- **Not to be confused with `whoobe_pages`**: Pages (the visual page composer's content, `docs/plans/cms/whoobe-one-editor-integration-plan.md`) and Data Objects (this plan) are deliberately separate concepts serving different purposes - a Page is a composed document made of `Element`s; a Data Object is a structured record (a Product, a Category, a Contact submission) with typed fields. Pimcore itself keeps these as separate concepts (Documents vs. Data Objects) and this plan does the same, not a unification.
- **Field Collection**: Pimcore's repeatable-structured-block field type (an ordered list of typed sub-records attached to one field on an object, e.g. a Product's list of content blocks). See §3.5 and §6.5 for why this one is genuinely ambiguous against this codebase's own Page/`Element` model.

---

## 1. Scope & goals

Two deliverables, sequenced together because the second is much cheaper once the first exists:

1. **A real Data Object modeling system for Whoobe CMS** - admin-authored classes (field definitions), object instances validated against them, relations between objects, per-field localization, and (reusing rather than re-designing) the publish/workflow gate `object-publish-workflow-plan.md` already specified. Replaces the current fully-mocked `ObjectsView.vue` and placeholder `BaseDataObject`/`ClassDefinition` interfaces with a real, working system.
2. **A Pimcore Data Object migration pipeline** (`packages/migration-tool`, alongside the existing `migrate-documents`) - `migrate-classes` (translate Pimcore class definitions into `data_classes` rows) and `migrate-objects` (translate real Pimcore object instances into `data_objects` rows), following the exact same idempotent-upsert-by-Pimcore-id convention `whoobe_pages` already established.

**Explicitly not this plan's job**: re-deciding the publish/workflow state machine (`object-publish-workflow-plan.md` already owns that design - this plan adopts its `published`/`workflowState` columns and preview-link mechanism directly, see §7) or re-deciding auth/RBAC (`auth-permissions-plan.md`'s `permissions`/`roles`/`rolePermissions` tables already exist and are used as-is for admin-only class/object management gating, see §7).

---

## 2. Where this stands today

- **`apps/admin-dashboard/src/views/ObjectsView.vue`** is entirely mock - a hardcoded `ref` array of 4 fake rows (`ProductCategory`/`CustomerProfile`/`PricingModel`), no API calls at all, "+ Create Object"/"Edit"/"Delete" buttons with no handlers.
- **`packages/core/src/db/schema.ts`** is a placeholder (its own header comment says so): a `BaseDataObject` TS interface (`classId`, `key`, `path`, `parentId`, `published`, `attributes: Record<string, unknown>` - "Hybrid EAV + JSONB" per its comment) and `AssetMetadata` - neither backed by a real Drizzle table.
- **`packages/core/src/schema/dynamic.ts`** has real, working groundwork worth keeping: `ClassDefinition`/`ClassFieldDefinition` interfaces and `compileDynamicSchema()`, which turns a class's field list into a runtime Zod validator. Currently only handles four field types (`input`/`textarea`/`wysiwyg` → string, `numeric` → number, `checkbox` → boolean, everything else → `unknown`) - §4.3 extends this coverage against real Pimcore field types.
- **`object-publish-workflow-plan.md`** already fully designed the `published`/`workflowState` gate, preview-link tokens, and the XState workflow engine for Data Objects - written against this same placeholder schema, correctly identifying "no real Drizzle table definitions exist yet" as its own prerequisite. This plan is that prerequisite.
- **`auth-permissions-plan.md`'s design is implemented for real** (unlike when `object-publish-workflow-plan.md` was written) - `packages/core/src/db/auth-schema.ts` has real `users`/`roles`/`permissions`/`rolePermissions`/`userRoles`/`sessions` tables, `packages/core/src/auth/` has real session/MFA/permission-check code. Any "admin-only" gate this plan needs can use that directly - not a dependency to design, just to consume (`permissions` are opaque `"resource:action"` strings per that schema's own comment, e.g. this plan would add `"objects:write"`/`"classes:write"` rows).
- **`packages/migration-tool/src/cli.ts`** already stubs the command name: `migrate-classes - Translate Pimcore class JSON definitions to Drizzle/Postgres (not yet built)`. Nothing behind it yet.

---

## 3. What real Pimcore Data Objects actually look like

Grounded against the same live install `docs/plans/cms/whoobe-one-editor-integration-plan.md`'s Phase 5 pilot used (`pimcore-demo`, MySQL at `develop.local:3306`) - not assumed from Pimcore documentation alone, the same discipline that pilot applied to Documents (and that caught a real bug there).

### 3.1 Classes: 29 real classes, but **field definitions are not in the database**

```
Brand, Category, Color, Communication, ContactCategory, ContactFormCommercialRequest,
ContactFormProductInformation, ContactFormSponsorship, ContactFormWorkWithUs, ContactPurpose,
ContactSecondaryStudyTitle, ContactSpokenLanguage, ContactSponsorshipType, ContactStudyTitle,
ContactWorkingField, Content, Delivery, District, Flavour, Format, Magazine, Market,
Newsletter, PressArea, Product, Route, State, Tag, WaterSource
```

The `classes` table has exactly two columns: `id`, `name`. **Real Pimcore stores each class's field definitions as a PHP file on disk** (`var/classes/definition_<Name>.php`), not in MySQL - a migration tool with only MySQL access (as `migrate-documents` has today) cannot see field types, mandatory/localized flags, or relation targets at all.

**Resolved during Phase 0**: a local checkout of this exact Pimcore installation exists on this machine (`<local-checkout>/pimcore-project`, confirmed the same install - class `Product` there is `id: '2'`, matching the live database's `classes` row exactly) - real filesystem access to `var/classes/` is available, not just MySQL. Every `definition_<Name>.php` file additionally carries a human-readable `Fields Summary` doc-comment at its top (name + Pimcore fieldtype for every field, including nested `localizedfields`/`block` children) that's far cheaper to parse than the full nested `ClassDefinition::__set_state()` PHP-literal tree below it - a real census of all 30 definition files on disk (29 live classes + `Faq`, which has a definition file but no rows in the live `classes` table today) surfaced real field types beyond what `object_2`'s raw columns alone suggested: `select`, `multiselect`, `manyToOneRelation`, `manyToManyRelation`, `manyToManyObjectRelation`, `advancedManyToManyRelation`, `fieldcollections`, `block` (an inline repeatable-fields group with no shared collection-type name, distinct from a Field Collection), `country`, `email`, `link`, `video`, `urlSlug`, plus several custom types only `Newsletter` uses (`firstname`, `lastname`, `gender`, `newsletterActive`, `newsletterConfirmed`, `consent`, `targetGroup` - almost certainly from a Pimcore Newsletter-bundle plugin, not core Pimcore - see §3.3).

`migrate-classes` (§5.1) can therefore be built for real against these files - parsing the `Fields Summary` comment first (name/fieldtype/nesting, cheap and reliable) with the full `__set_state()` structure as a richer follow-up source for anything the summary doesn't carry (relation target class, `select` option lists, mandatory flags). §4.3's field-type table below is updated to the real, fuller list this census found, not the smaller set `object_2`'s columns alone implied.

### 3.2 Objects: per-class tables, not one shared table

- `objects` - the same kind of tree table `documents` is (§ same pattern as the CMS plan's Phase 5 finding): `o_id`, `o_parentId`, `o_type`, `o_key`, `o_path`, `o_classId`, `o_className`, `o_published`, timestamps. One row per object across *all* classes, so this is where "list every object" comes from.
- `object_<classId>` (e.g. `object_2` for Product) - one table **per class**, columns are that class's own non-localized fields *plus* the same `o_*`/`oo_*` tree metadata duplicated in. Real example (`object_2`, Product): `image`, `category`, `brand`, `tags`, `technicalSheet__id` / `technicalSheet__type`, `header`, `technicalSheets`, `navigationColorScheme`, `order`.
  - **Single relations are stored as a plain numeric-string target id** directly in the column (`category: "1524"`, `brand: "1519"`) - both are actually `select` fieldtype per Product's real definition (§3.1), not a relation type at all - Pimcore's `select` here is configured with an object-listing data source, a detail invisible from the raw column alone but now resolvable via the real class definition file.
  - **Asset relations get a `<field>__id` / `<field>__type` column pair** (`technicalSheet__id`/`technicalSheet__type`) rather than a bare id - `technicalSheet` is a real `manyToOneRelation` field per Product's definition; a different physical shape than the `select`-as-id-string case above.
  - **`multiselect` fields get stored as a delimited string** in one column - confirmed directly: Product's real `tags` field is `[multiselect]` in its class definition, and its live data is `",1531,"`.
- `object_relations_<classId>` (e.g. `object_relations_2`) - a real edge table for fields configured as `manyToManyRelation`/`manyToManyObjectRelation`/`advancedManyToManyRelation` (Product's own `technicalSheets` is `advancedManyToManyRelation`): `src_id`, `dest_id`, `type`, `fieldname`, `index`, `ownertype`, `ownername`, `position`. Which of the four relation-shaped fieldtypes (`select`-as-id, `manyToOneRelation`, the `object_relations` edge table, or a delimited string) a given field actually uses is now knowable per-field from the real class definitions (§3.1), not left as a guess.
- `object_localized_<classId>_<locale>` (e.g. `object_localized_2_en`, `object_localized_2_it`) - one table per class **per locale**, carrying that class's localized fields (`slug`, `name`, `abstract` for Product) alongside the same duplicated tree/non-localized columns. This install has (at least) `en` and `it`.
- `object_collection_<CollectionType>_<classId>` (e.g. `object_collection_ContentImage_7`) - Pimcore's Field Collection type: an ordered, repeatable list of typed sub-records attached to one field on one object. Real shape: `o_id` (owning object), `fieldname` (which field), `index` (order), plus the collection type's own columns (e.g. `image`, an asset id). See §3.5 - this one deserves its own design conversation, not a mechanical port.
- `classificationstore_*` (groups/keys/relations/collectionrelations/stores) - Pimcore's separate hierarchical key-value taxonomy feature. **Present in the schema but empty in this real install** (`classificationstore_groups` has zero rows) - not used by this site, so this plan does not design storage for it. Flagged rather than silently dropped, in case a future Pimcore install actually uses it.

### 3.3 Scale, and a real finding about what's actually in there

`objects` has **40,849 rows total**. Breakdown by class (top 10 by count):

| Class | Rows | What it actually is |
|---|---|---|
| `Newsletter` | 33,650 | Newsletter signups - real customer PII. Confirmed via its real class definition (§3.1): `firstname`, `lastname`, `email`, `gender`, `telephone`, plus `optin` (fieldtype `consent`) and `newsletterActive`/`newsletterConfirmed`/`targetGroup` - custom fieldtypes not used by any other class here, almost certainly from a Pimcore Newsletter-bundle plugin. The `consent` fieldtype specifically existing on this class is itself a strong signal this is GDPR-relevant marketing-consent data, not incidental metadata |
| `ContactFormWorkWithUs` | 1,484 | Job-application form submissions - real PII |
| `ContactFormCommercialRequest` | 1,086 | Sales-lead form submissions - real PII |
| `PressArea` | 1,085 | Press contact records |
| `ContactFormSponsorship` | 937 | Sponsorship-request form submissions - real PII |
| `ContactFormProductInformation` | 819 | Product-inquiry form submissions - real PII |
| `Delivery` | 239 | Delivery/logistics reference data |
| `ContactSecondaryStudyTitle` | 188 | Small reference/lookup class |
| `Content` | 115 | CMS-adjacent content blocks (relates to §3.5's Field Collections) |
| `Communication` | 113 | Reference/lookup class |

**Over 90% of this install's "Data Object" volume is real customer-submitted form data (Newsletter/ContactForm*), not classic PIM catalog content.** The actual product catalog (`Product`, `Category`, `Brand`, `Tag`, `Format`, `Market`, `District`, `Route`, `WaterSource`, `Color`) is a much smaller, genuinely PIM-shaped slice of this data. This is a real, concrete finding this plan surfaces rather than glossing over: bulk-migrating everything under one banner would mean handling real PII (names, emails, phone numbers, submitted messages) with the same tooling and the same care as product catalog data - a data-protection/retention decision belongs *before* a migration run touches these classes, not as an afterthought (§8 Phase 0).

### 3.4 What a real object's data actually implies for the target schema

Putting §3.2 together: **an object's full data is scattered across up to four different Pimcore tables** (its class's main table, its class's per-locale localized table(s), its class's relations edge table, and any field-collection tables it uses) before a single `data_objects` row can be assembled. `migrate-objects` (§5.2) has to join all of these per object, mirroring how `migrate-documents` already assembles one Pimcore Document from its `documents`/`documents_elements` tables today.

### 3.5 Field Collections look suspiciously like this codebase's own `Element` content model

`object_collection_ContentImage_7`/`ContentVideo`/`ContentProductSlider`/`ContentTextImage`/etc. (all attached to the `Content` class, id 7 - and the identical `content [fieldcollections]` field also exists on `Product` and `Magazine`) are: an ordered, repeatable, typed list of structured sub-records attached to a parent - exactly the shape an Areablock was for Pimcore Documents, which this codebase already chose to migrate as `Element` tree nodes rather than classic structured data (`docs/plans/cms/whoobe-one-editor-integration-plan.md` §3-4).

**Confirmed, not just suspected, once the real Field Collection definitions were read (§3.1's filesystem access)** - these are visual layout blocks, not PIM attributes:
- `ProductBanner`: `image`, `style`/`backgroundColor`/`direction` (all `select`), plus localized `title`/`description`/`cta` (`link`) - a hero/promo banner, field-for-field.
- `ProductTabs`: a localized `mainTitle` plus a repeatable `tabs [block]` of `image`/`tabName`/`title`/`description`/`cta`/`downloads` - a tabbed content module.
- `ProductVariants`: a repeatable `variants [block]` of `image`/`source`/`format`/`flavour` - a variant picker/showcase.
- `ContentProductSlider`: a localized `title` plus a repeatable `slides [block]` of `product` (relation) / `description` / `image` - a product carousel.

Whether `Content`/`Product`/`Magazine` objects' `content` field (and its Field Collections) are genuinely *page composition content* wearing a Data Object's clothing - and so belong migrated into `whoobe_pages`/`Element` JSON via the existing Areablock→`Element` pipeline instead of into `data_objects` - is still this plan's call to make, not mine to assume, but the evidence above points one way clearly: these read as presentation/layout blocks (banners, sliders, tabs, variant showcases), not structured PIM records. See §6.5 for the recommendation and the decision this still needs.

---

## 4. Target data model for Whoobe CMS

Building on the existing placeholder shapes (§2) rather than discarding them - `BaseDataObject`'s "Hybrid EAV + JSONB" instinct and `compileDynamicSchema()`'s field-driven Zod compilation are both kept, now backed by real Drizzle tables.

### 4.1 `data_classes` (new)

```ts
export const dataClasses = pgTable('data_classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),        // e.g. 'Product' - admin-facing + code-facing identifier
  label: text('label').notNull(),                // admin-facing display label, can differ from `name`
  fields: jsonb('fields').notNull().$type<ClassFieldDefinition[]>(), // see §4.3 for the extended shape
  pimcoreId: text('pimcore_id'),                 // upsert-by-pimcoreId key, same convention as whoobe_pages
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

One row per class, `fields` holding the same kind of definition `compileDynamicSchema()` already consumes (extended per §4.3) - no separate "field" table, matching this plan's own EAV-avoidance instinct (`BaseDataObject`'s comment already leaned toward JSONB over strict EAV, and per-class field lists don't need relational querying the way object *instances* do).

### 4.2 `data_objects` (new)

```ts
export const dataObjects = pgTable('data_objects', {
  id: uuid('id').primaryKey().defaultRandom(),
  classId: uuid('class_id').notNull(),            // plain uuid, not a cross-file FK - see Phase 1 note below
  key: text('key').notNull(),
  path: text('path').notNull(),                  // Pimcore-style folder path, kept for parity/migration fidelity
  parentId: uuid('parent_id'),                   // self-reference, for the same folder-tree browsing ObjectsView.vue's real UI will want
  translationGroupId: uuid('translation_group_id').notNull().defaultRandom(), // one row per locale, see §4.4
  locale: text('locale').notNull().default('en'),
  published: boolean('published').notNull().default(false),   // object-publish-workflow-plan.md §2.1, adopted directly
  workflowState: text('workflow_state'),                       // object-publish-workflow-plan.md §2.1, adopted directly
  attributes: jsonb('attributes').notNull().$type<Record<string, unknown>>(), // non-localized + localized fields for THIS row's locale
  pimcoreId: text('pimcore_id'),                 // upsert-by-pimcoreId key
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // (classId, locale, key), not (classId, key) alone - every locale gets
  // its own full row, so the same key must be reusable across a
  // translation group's sibling rows (mirrors whoobe_pages' own
  // (locale, slug) over slug-alone). Caught by real testing in Phase 1,
  // not designed right the first time - an earlier (classId, key)-only
  // index rejected a legitimate second-locale row for the same object.
  classLocaleKeyIdx: uniqueIndex('data_objects_class_locale_key_idx').on(table.classId, table.locale, table.key),
  translationGroupLocaleIdx: uniqueIndex('data_objects_translation_group_locale_idx').on(table.translationGroupId, table.locale),
  pimcoreIdIdx: uniqueIndex('data_objects_pimcore_id_idx').on(table.pimcoreId),
}));
```

**Phase 1 implementation note**: `classId` ended up a plain `uuid` column, not a Drizzle `.references()` FK to `dataClasses.id` - drizzle-kit's own schema loader (unlike this app's real tsx/vite runtime) can't resolve a cross-schema-file `.js`-extension import when generating migrations. Every existing FK in this codebase's schema files stays within one file (e.g. auth-schema.ts's own `sessions.userId -> users.id`) - this would have been the first cross-file case, and it doesn't work with this project's current drizzle-kit setup. Referential integrity is enforced at the records layer instead. The self-referencing `parentId -> dataObjects.id` FK (same file) works fine and is real, not similarly downgraded.

Every attribute (both non-localized and this-row's-locale localized fields) lives in one `attributes` JSONB blob per row - **not** a split table per Pimcore's own `object_<id>` / `object_localized_<id>_<locale>` physical separation. Reasoning: Pimcore's split is a MySQL-era optimization (fixed columns per class, per locale); Postgres JSONB with the class's field list (`data_classes.fields`) as the validation source of truth doesn't need the same physical split, and one row's `attributes` naturally holds "everything visible for this object in this locale," matching how `whoobe_pages` already does one full row per locale rather than a shared-plus-override structure.

### 4.3 Field-type coverage (extending `schema/dynamic.ts`)

Real Pimcore field types, per the full 30-class census (§3.1) - not the smaller set `object_2`'s raw columns alone implied. Extending `ClassFieldDefinition`/`compileDynamicSchema()`:

| Pimcore field type | Real example | Zod validator | Notes |
|---|---|---|---|
| `input` / `textarea` / `wysiwyg` | `header`, `abstract` | `z.string()` | Already handled |
| `numeric` | `order` | `z.number()` | Already handled |
| `checkbox` | `privacyPolicy` | `z.boolean()` | Already handled |
| `select` (plain, fixed option list) | `navigationColorScheme`, `unit` | `z.enum([...])` from `options` (§3.1's full-definition parse resolves the real list; the `Fields Summary` alone only gives the fieldtype) | New |
| `select` (object-listing data source, a *soft* single-relation - no FK) | `category`, `brand` on Product (stored as a plain id-string, §3.2) | `z.object({ id: z.string(), classId: z.string() }).nullable()` | New - needs `relationTarget?: string` recorded on the field, resolvable from the full definition parse |
| `multiselect` | `tags` (Product, confirmed `[multiselect]`, delimited-id-string in real data) | `z.array(z.string())` | New - migration-side parsing of the delimited string is §5.2's job, not the schema's |
| `manyToOneRelation` | `technicalSheet` (Product, an asset relation via `__id`/`__type`), `detailPage` (Brand/Category/Tag, an object relation) | `z.object({ id: z.string(), type: z.enum(['object','asset']) }).nullable()` | New |
| `manyToManyRelation` / `manyToManyObjectRelation` / `advancedManyToManyRelation` | `technicalSheets` (Product), `pages` (Route), `productId` (Faq) | `z.array(z.object({ id: z.string() }))`, sourced from `object_relations_*` edges | New |
| `date` | `publicationDate`, `expiration` | `z.coerce.date()` | New |
| `email` / `country` | Newsletter, contact-form classes | `z.string().email()` / `z.string()` | New |
| `link` | `cta` (ProductBanner), `pressLink` (PressArea) | `z.object({ path: z.string().nullable(), text: z.string().nullable(), target: z.string().nullable() })` | New |
| `video` | `video` (Communication) | `z.object({ assetId: z.string() }).nullable()` | New |
| `urlSlug` | `test` (Route) | `z.string()` | New |
| `block` (inline repeatable group, no shared type name) | `tabs` (ProductTabs), `variants` (ProductVariants), `slides` (ContentProductSlider), `category` (Faq) | `z.array(z.record(z.unknown()))`, shape per the block's own inline child-field list | New |
| `fieldcollections` (named, reusable repeatable type) | `content` on Product/Content/Magazine (§3.5) | `z.array(z.record(z.unknown()))`, one shape per collection type (own field list, §5.1) - decided as a classic attribute, not routed to Pages (§6.5) | New |
| Newsletter-bundle-specific (`firstname`, `lastname`, `gender`, `newsletterActive`, `newsletterConfirmed`, `consent`, `targetGroup`) | `Newsletter` class only | Deferred - real handling depends on §3.3's PII/data-protection decision, not worth designing validators for before that's settled | New, deferred |

`ClassFieldDefinition` gains `relationTarget?: string` (class name a relation/select field points at), `options?: string[]` (fixed `select`/`multiselect` choices), and `blockFields?: ClassFieldDefinition[]` (inline child fields for `block`) to support the new cases - all additive, not breaking the existing four-type switch.

### 4.4 Localization strategy

**One row per locale per object, linked by `translationGroupId`** - the identical pattern `whoobe_pages` already established (`docs/plans/cms/whoobe-one-editor-integration-plan.md` §4), chosen for consistency rather than re-litigating the decision, and because it was already confirmed as the "Recommended" answer once in this same codebase's design conversation. Each locale's row carries the full resolved `attributes` for that locale (non-localized fields duplicated across every locale row, localized fields genuinely differing) - simpler to read (no runtime merge of a base + override), at the cost of duplicating non-localized values across locale rows (an accepted, explicit tradeoff, same one `whoobe_pages` already made).

---

## 5. Migration pipeline (`packages/migration-tool`)

### 5.1 `migrate-classes` - unblocked (Phase 0 finding)

Per §3.1, Pimcore's actual field definitions are not reachable via MySQL alone - but a local filesystem checkout of this exact install exists on this machine (`<local-checkout>/pimcore-project/var/classes/`), confirmed to match the live database (class ids line up, e.g. `Product` is `id: '2'` in both). `migrate-classes` is therefore a real, buildable command, not blocked on a decision:

- A new adapter method reads `definition_<Name>.php` for each class, parses the `Fields Summary` doc-comment (name + fieldtype + nesting, cheap and reliable) as the primary source, and falls back to parsing the full `ClassDefinition::__set_state()` PHP-literal structure below it for anything the summary doesn't carry (`select`/`multiselect` option lists, `relationTarget`, `mandatory` flags) - a bespoke PHP-literal parser in the same spirit as `php-unserialize.ts`'s existing PHP-`serialize()`-format parser, but for a structurally different PHP syntax (nested array/object literals, not the `serialize()` wire format), so **not** a drop-in reuse of that existing code.
- This only works because a local checkout happens to exist for this specific install. A future Pimcore install without an available filesystem/API path would fall back to hand-authoring class definitions via the admin UI's own "Classes" editor (§6's own recommendation for a from-scratch-authoring path anyway) - noted as a real limit on how automatable this stays across installs, not assumed to generalize.

`migrate-classes` itself, once pointed at real parsed field data, is a thin CLI command mirroring `migrate-documents`' structure (`cli.ts`), populating `data_classes` rows (§4.1) via `upsertDataClassByPimcoreId`.

### 5.2 `migrate-objects`

New `source-adapter.ts` methods (extending the interface `migrate-documents` already established):

```ts
listObjectClasses(): Promise<{ id: string; name: string }[]>;       // SELECT id, name FROM classes
listObjects(classId: string): Promise<PimcoreObjectSummary[]>;      // SELECT ... FROM objects WHERE o_classId = ?
getObjectAttributes(classId: string, objectId: string): Promise<RawObjectAttributeRow>;
  // joins object_<classId> (this object's row) + object_localized_<classId>_<locale> (per locale)
  // + object_relations_<classId> (edges where src_id = objectId) into one shape
```

A new `PimcoreObjectConverter` (mirroring `PimcorePageConverter`'s own shape and the same package-boundary discipline - hand-constructed plain objects against a locally-defined `WhoobeDataObjectAttributes`-shaped interface, not an import of any frontend-only code, since Data Objects have no frontend-only class to avoid importing here in the first place, unlike `Element`): converts one Pimcore object's joined raw row into a `data_objects.attributes` JSONB shape, using `data_classes.fields[].fieldType` (from whichever §5.1 path supplied it) to decide how to parse each column - single relation id-strings into `{ id, classId }`, the asset `__id`/`__type` pair into `{ assetId }`, `object_relations_*` edges into arrays, and Field Collection rows (`object_collection_<Type>_<classId>`, grouped by `fieldname`/`index`) into a `Record<string,unknown>[]` attribute, per collection type's own field list (§6.5's decision).

CLI: `migrate-objects --class=<name> [--dry-run] [--limit=N]`, matching `migrate-documents`' own flag conventions (`--dry-run`, `--limit`), plus `--class` since (unlike Documents, which are one flat list) Objects are naturally scoped per class and a real migration will likely run one class at a time (starting with the true PIM classes - Product/Category/Brand/Tag/Format/Market/District/Route/WaterSource/Color - explicitly *not* Newsletter/ContactForm*, per §3.3's decision to exclude them from this plan's scope).

Both commands reuse the exact `upsertXByPimcoreId` idempotent-upsert convention `whoobe-pages-records.ts` already established (`upsertDataClassByPimcoreId`, `upsertDataObjectByPimcoreId`) - safe to re-run, never clobbers `published`/`workflowState` on re-import, same as `upsertWhoobePageByPimcoreId` already does.

---

## 6. Admin UI (`apps/admin-dashboard`)

The bigger net-new engineering item in this plan, compared to Pages (§7 of the CMS plan just embeds an already-built external editor) - Data Objects have no external editor to embed, so the admin dashboard itself needs a real dynamic form renderer.

1. **`utils/data-classes-api.ts` / `utils/data-objects-api.ts`** - real HTTP clients (mirroring `pages-api.ts`'s `baseUrl`-from-`authStore.config` shape), replacing `ObjectsView.vue`'s hardcoded mock array with real `GET /data-objects`/`GET /data-classes` calls.
2. **`ObjectsView.vue` retarget** - the class-filter `<select>` becomes real (populated from `listDataClasses()`, not the three hardcoded option strings it has today); the table lists real `data_objects` rows with real Published/Draft badges (reusing the same badge markup `PagesView.vue`/`DocumentsView.vue` already established) instead of the fake `updatedAt` strings.
3. **A dynamic object-detail form** (new) - given one class's `fields` array, render one form control per field, keyed by `fieldType` (text input, textarea, checkbox, select, a relation picker reusing whatever asset-picker pattern the DAM side already has for asset relations, a repeatable-row editor for multi-relations/Field Collections). This is the single largest net-new UI-engineering piece in this whole plan - `compileDynamicSchema()` already gives client-side validation "for free" once field types are real (§4.3), but the form *renderer* itself doesn't exist yet anywhere in this codebase and has to be built from scratch, not adapted from something else.
4. **A "Classes" admin sub-page** (new, likely under Settings, alongside `object-publish-workflow-plan.md`'s own planned "Workflows" sub-page) - lets an admin author/edit a class's field list directly (add/remove/reorder fields, set type/label/mandatory/localized/relation-target) rather than only being populatable via migration. Without this, classes only ever come from `migrate-classes` - a real gap for "not everyone will need Pimcore migration tools" (the CMS plan's own founding principle, `whoobe-one-editor-integration-plan.md` §1) applied to Data Objects too: a CMS user with no Pimcore history still needs to be able to define a class from scratch.

### 6.5 Field Collection routing: decided (Phase 0)

Per §3.5's evidence (`ProductBanner`, `ProductTabs`, `ProductVariants`, `ContentProductSlider` all read as presentation/layout blocks - images, style/color/direction selects, CTAs, slides), this plan recommended routing `fieldcollections`-typed fields into `whoobe_pages`/`Element` JSON instead of `data_objects.attributes`. **Decided against, in favor of the alternative**: `fieldcollections` (concretely: `content` on `Product`/`Content`/`Magazine`) are treated as a classic Data Object attribute - a repeatable-row Field Collection editor, keyed by each collection type's own field list, is built as part of the dynamic object-detail form (§6.3) rather than diverted into the Pages pipeline. A migrated `Product`/`Content`/`Magazine` object stays one `data_objects` row, `content` included, not split across two records.

**What this means for §4.3/§5.2**: `fieldcollections` is no longer contingent - it gets a real `z.array(z.record(z.unknown()))`-shaped attribute (per collection type, keyed by that type's own field list, itself sourced from `var/classes/DataObject/Fieldcollection/Data/<Type>.php` the same way class definitions are, §5.1), and `migrate-objects`/`PimcoreObjectConverter` (§5.2) handle `object_collection_<Type>_<classId>` rows as ordinary attribute data, not as a diversion into `PimcorePageConverter`.

**What this does NOT cover**: `block` fields that are genuinely small, fixed structured groups with no visual/layout character (`Faq`'s `category [block] -- categoryName [input]`, a single-field lookup group) - those stay classic Data-Object attributes (§4.3's `block` row) regardless; this decision is specifically about `fieldcollections`, not `block` generally.

## 7. Explicit relationship to the two plans this one depends on

- **`object-publish-workflow-plan.md`**: this plan's `data_objects.published`/`.workflowState` columns (§4.2) are that plan's §2.1 design, adopted verbatim, not reinvented. That plan's §3 (`class_workflow_definitions`, `object_preview_tokens`, `workflow_transition_log` tables), §4 (mutations), and §5 (admin UI: badges, row actions, workflow editor) all layer directly on top of `data_classes`/`data_objects` once they exist for real - no changes needed to that plan's own design, it was simply waiting for this one. Sequencing: this plan's Phase 1 (§8) must land before that plan's Phase 1 can start for real.
- **`auth-permissions-plan.md`**: already implemented (§2) - this plan's admin-only class/object mutations (create/edit a class, publish/unpublish an object, run a migration) gate on real `permissions` rows this plan adds (e.g. `"classes:write"`, `"objects:write"`, `"objects:publish"` - the last one already anticipated by name in `object-publish-workflow-plan.md`'s own `allowedPermissions` correction), attached to roles the same way every other permission-gated route in `apps/core-api` already works. Not a new mechanism - just new permission strings using the existing one.

---

## 8. Proposed phases

Mirroring the CMS integration plan's own phase-tracking convention (status inline, updated as each phase lands):

- **Phase 0 - Real-data decisions: DONE.** §5.1's class-definition-source question **resolved** - a local filesystem checkout of the real `pimcore-demo` Pimcore install exists on this machine, confirmed to match the live database, so `migrate-classes` can be built against real parsed `var/classes/*.php` definitions rather than blocked on filesystem/API access or hand-authoring. §6.5's Field Collection routing **decided**: classic Data-Object attribute (a repeatable-row editor in the dynamic form, §6.3), not diverted into `whoobe_pages`/`Element`. §3.3's Newsletter/ContactForm* PII stance **decided**: excluded from this plan's migration scope for now - Phase 3 targets the true PIM classes only (202 real objects total, §9), Newsletter/ContactForm* migration is a separate, deliberate decision for later, not part of this plan's rollout.
- **Phase 1 - Core data model: DONE.** `data_classes`/`data_objects` Drizzle schema built per §4.1-§4.2 (migrations `0008_tidy_luminals.sql`/`0009_nervous_cammi.sql`, applied to the real `whoobe_db`), `published`/`workflowState` included from day one, `fields`/`ClassFieldDefinition` reused directly from the existing `schema/dynamic.ts` rather than redefined. CRUD routes added to `core-api` (`/data-classes`, `/data-objects` with a `?classId=` filter, `/data-objects/:id/translations`) - reusing the existing `PERMISSIONS.OBJECTS_READ`/`WRITE` constants every other resource in that file already shares (documents/snippets/templates/kits/pages), not new permission strings, correcting §7's earlier assumption that this plan would add `"classes:write"` etc. Real `data-classes-api.ts`/`data-objects-api.ts` clients and `dataClassesStore.ts`/`dataObjectsStore.ts` added to `admin-dashboard`; `ObjectsView.vue` retargeted off its mock array onto real classes/objects, with real Published/Draft badges. Deliberately no "+ Create Object"/"Edit" UI yet (matches `DocumentsView.vue`/`PagesView.vue`'s own list-first precedent - a real create/edit UI needs the class-driven dynamic form, Phase 2's job); Delete is wired for real since it needed no such form.
  - **Two real implementation findings, not anticipated in the original design**: (1) drizzle-kit's schema loader can't resolve a cross-schema-file import when generating migrations (confirmed against this project's actual setup, not assumed) - `data_objects.classId` is a plain `uuid`, not a Drizzle-level FK to `data_classes.id`; every existing FK in this codebase stays within one schema file, this would've been the first cross-file case. Referential integrity is enforced at the records layer instead. (2) A schema bug caught by real testing, not shipped: the original design's `(classId, key)` unique index rejected a legitimate second-locale row for the same logical object (every locale gets its own full row, per §4.4) - fixed to `(classId, locale, key)`, mirroring `whoobe_pages`' own `(locale, slug)` pattern, which this plan should have matched from the start.
  - Verified directly against the real database (not just typecheck/build, all of which are also clean across `packages/core`/`core-api`/`admin-dashboard`): class create/list, object create with a real linked-locale translation (`translationGroupId`), `listDataObjectTranslations`, class-scoped `listDataObjects`, publish-sets-publishedAt-once/never-resets-on-resave, the corrected duplicate-`(classId,locale,key)`-rejected constraint, delete, and both `upsertDataClassByPimcoreId`/`upsertDataObjectByPimcoreId` (the future migration pipeline's own re-run path) - all via the real `createDataClass`/`createDataObject`/etc. functions against `develop.local:5432/whoobe_db`. `http://develop.local:3000/objects` confirmed HTTP 200 from the live dev server. **Not verified**: the real `core-api` HTTP routes themselves - the running dev-server process for `core-api` in this environment stopped picking up file changes via `tsx watch` partway through this phase (confirmed via process-start-time inspection, not assumed) and was left alone rather than restarted without asking, since it's a long-running process this plan doesn't own. The records-layer functions the routes call directly are the same ones verified above; the thin route handlers themselves (already typechecked) are unverified over real HTTP pending a restart.
- **Phase 2 - Field-type coverage & dynamic form: DONE.** `ClassFieldDefinition` extended with `relationTarget`/`options`/`blockFields`/`collectionFields`; `compileDynamicSchema()` rewritten around a recursive `compileFieldSchema()` covering every real fieldtype from §4.3's census (the four relation shapes, `date`/`email`/`country`/`link`/`video`/`urlSlug`, and a genuinely recursive `block`) - 9 new Vitest tests (`schema/dynamic.test.ts`), all passing, including a real recursive-block case and a mandatory-field-inside-a-block case. `fieldcollections` compiles too, but deliberately with one shared shape rather than per-collection-type (unchanged from the plan's own note - a real multi-type picker is Phase 6's job).
  - **The dynamic object-detail form got built more fully than "coverage" alone implies**: `DataObjectForm.vue`/`DataObjectFieldControl.vue` (a recursive pair - `block` fields render nested `DataObjectForm` instances for their repeatable rows) render a real, working control for every field type except `fieldcollections` (an honest "not yet available, coming in a later phase" placeholder, matching Phase 6's own ownership rather than faking it) and Newsletter-bundle-specific types (deferred with §3.3). Relation-flavored fields (`select`+`relationTarget`, `manyToOneRelation`, the multi-relation family) get real `<select>` pickers backed by a new `useRelationOptions()` composable - meaning **Phase 4's own "real relation pickers wired into the dynamic form" already happened here**, ahead of schedule (Phase 4's remaining scope is now just the localized-field round-trip, which genuinely depends on Phase 3's migration existing first). Asset-relation fields (`manyToOneRelation` with no `relationTarget`, `video`) get a plain asset-id/path text input, not a real picker - stated honestly in the code's own comments, since no reusable asset-picker component actually exists yet anywhere in `admin-dashboard` (checked, not assumed - the plan's own §6 wording "reusing whatever asset-picker pattern the DAM side already has" turned out not to describe anything that exists). `ObjectsView.vue` gained real "+ Create Object" (gated on a class being selected first, since the form's shape depends on it) and "Edit" actions, closing the gap Phase 1 deliberately left open.
  - **A real, minor bug fixed along the way**: Vue's template-expression parser can't handle an inline `as { ... }` object-literal type cast (confirmed via `vue-tsc` - simple casts like `as string` parse fine, object-literal casts don't) - pulled into named `computed()`s in `DataObjectFieldControl.vue` instead of inlining them in the template.
  - Verified: `pnpm run test` (9/9 new, all passing) in `packages/core`; `pnpm run typecheck`/`pnpm run build` clean across `packages/core`/`core-api`/`admin-dashboard`. Not verified: an actual browser click-through of the form (no headless browser available, same stated gap as every UI phase in this repo) - and SSR-rendering the real `.vue` SFCs directly (as a lighter substitute, the technique the CMS integration plan used for its own semantic-tag check) turned out not to be feasible here without a real Vite pipeline (tsx alone can't compile `.vue` files), unlike that earlier check which rendered a hand-written template string, not an imported SFC.
- **Phase 3 - Migration pipeline pilot: DONE.** Both commands built and run for real against the true PIM classes (Product/Category/Brand/Tag/Format/Market/District/Route/WaterSource/Color), excluding Newsletter/ContactForm* per Phase 0's decision.
  - **`migrate-classes`** (`pimcore-class-definition-parser.ts`, new): parses the real `var/classes/definition_<Name>.php` files' `Fields Summary` doc-comment for name/fieldType/nesting (cheap, reliable), then enriches with `mandatory`/`relationTarget` from the full PHP source using a **real balanced-paren block scanner** - not the "text between two field names" window the plan originally proposed. Real testing caught why the simpler approach doesn't work: `optionsProviderClass`/`classes` can land physically closer to a *neighboring* field's name than to their own (confirmed: a naive window resolved `brand`'s `relationTarget` to `"Category"`, its immediately-preceding sibling's target) - fixed by scanning for each field's own `::__set_state(array(...))` block via real paren-depth tracking (respecting quoted strings) instead of approximating from neighboring text positions. 4 tests, including a fixture reproducing the exact bleed bug. Also finds each class's own real Pimcore id/name (`parsePimcoreClassMeta`) from the file header - verified against all 10 real class files, ids match the live database exactly (`Product` = `2` in both).
  - **`migrate-objects`** (`pimcore-object-converter.ts` + `source-adapter.ts`/`mysql-adapter.ts` extensions, new): joins `object_<classId>` (own columns) + `object_localized_<classId>_<locale>` (discovered dynamically via `SHOW TABLES LIKE`, not a hardcoded locale list) + `object_relations_<classId>` (edges) per object, then converts per-field using `data_classes.fields[].fieldType` - real relation resolution via a callback (`resolveRelation`, backed by `getDataObjectByPimcoreId` - Pimcore's own object ids are globally unique across every class, confirmed, so no class-scoping needed) that returns `null` for a not-yet-migrated target rather than guessing, and real asset-path resolution (reusing `resolveAssetPath`, the same mechanism `migrate-documents` already has) for `image`/`video`/asset-flavored relations. 9 tests, all passing.
  - **Two real bugs found by testing against real data, not shipped**: (1) the class-definition parser's original neighboring-field bleed, above. (2) `image`-fieldtype fields (`image`, `header` - among the *most common* field types across these classes) had no conversion case at all and silently passed through as a bare Pimcore asset id rather than a resolved path - caught by inspecting a real migrated Product's own attributes after the first full pilot run, fixed, and the run repeated (idempotent upserts made this a clean re-run, not a special recovery step).
  - **Real pilot results**: all 10 classes' definitions migrated; all **202 real objects migrated, 0 failures**, run in dependency order (reference/lookup classes first, `Product`/`Route` last) so their relations actually resolve. Confirmed directly on a real object (`Product` "standard"): `category`/`brand`/`tags` resolved to real internal `data_objects` uuids, `image`/`header`/`technicalSheet`/`technicalSheets` resolved to real, human-readable asset paths.
  - **Two honest, quantified limitations, not silently papered over** (found via a real scan of every migrated object's attributes for unresolved `{ id: null, pimcoreId }` placeholders): `Product.navigationColorScheme` (42/44 objects) - its `optionsProviderClass` heuristic falsely resolved a `relationTarget` of `"HeaderType"`, which isn't a real Data Object class in this install at all (a fixed-choice enum-style options provider, not an object-listing one - the heuristic can't distinguish the two from the class file alone). `Category`/`Brand`/`Tag.detailPage` (all rows) - a real `manyToOneRelation` pointing at a Pimcore **Document**, not a Data Object or Asset; this pilot's relation resolver only checks `data_objects` (cross-system resolution against `whoobe_pages` was never in scope). Both surface as an honest `{ id: null, pimcoreId: <raw value> }` marker, not a crash, a silent drop, or a wrong guess.
  - **Stated, not built**: `link`/`block`/`fieldcollections` field values convert to an empty placeholder (`Product.content`, the one real `fieldcollections` field in this scope, migrated as `[]` for every object) - real parsing of Pimcore's PHP-serialized `link`/`block` column storage and the separate `object_collection_<Type>_<classId>` tables `fieldcollections` needs is genuinely new work, deliberately not attempted in this pilot (Field Collections' real editor is Phase 6's own job per Phase 0's decision, §6.5).
  - One piece of stray test debris from Phase 1's own verification (a leftover `Brand` class with no `pimcoreId`) collided with this phase's real migration and was cleaned up before re-running - flagged here as a reminder that ad hoc verification data needs cleanup discipline, not because it reflects on this phase's own correctness.
- **Phase 4 - Localization end-to-end** (not started, narrowed - relation pickers landed in Phase 2 already): localized-field round-trip verified against real migrated multi-locale objects (`object_localized_*_en`/`_it`, §3.2), once Phase 3 actually produces some.
- **Phase 5 - Publish/workflow integration** (not started): build `object-publish-workflow-plan.md`'s own Phases 1-4 on top of this plan's real schema - now unblocked per §7.
- **Phase 6 - Field Collections** (not started): build the repeatable-row Field Collection editor (§6.3/§6.5) - one per collection type, keyed by that type's own field list (sourced the same way class definitions are, §5.1).

---

## 9. Open risks, stated rather than hidden

- ~~§5.1 was a real blocker~~ - resolved in Phase 0 (a local filesystem checkout of the real install exists), but this resolution is **specific to this install having a locally-available checkout** - a future Pimcore source without that (no filesystem/API access, no local backup) would fall back to hand-authoring class definitions via the admin UI, which does not scale past a small class count the way this one happened to allow.
- **§3.3's PII finding changes the shape of "done" for this plan overall, decided, not silently deferred**: over 90% of this real install's object volume is customer-submitted form data, not catalog content. Phase 0 explicitly decided to exclude Newsletter/ContactForm* from this plan's migration scope - a real, deliberate incompleteness, not a gap Phase 3 will discover by accident. Revisiting that decision (migrating Newsletter/ContactForm* later, or building the separate leads/CRM-flavored store the Phase 0 question also offered) is real, separate future work this plan does not cover.
- **§3.5/§6.5's Field Collection evidence pointed one way, the decision went the other** - `fieldcollections` are staying a classic Data-Object attribute (a repeatable-row editor, §6.3/Phase 6) despite reading structurally like page-composition content (banners, sliders, tabs). Real, accepted consequence: Phase 6 builds a genuinely new repeatable-block UI (image/relation pickers, ordering, per-collection-type field lists) that will look and behave similarly to parts of the Pages editor, without sharing its code - duplicated engineering surface, knowingly taken on rather than an oversight.
- **§3.2's per-field storage variance (id-string-as-`select` vs. `manyToOneRelation` vs. `__id`/`__type` asset pair vs. delimited `multiselect` string vs. `object_relations_*` edge table) means `migrate-objects` cannot be fully generic the way `migrate-documents`' editable-type switch was** - each relation *shape* needs its own parsing path. Now knowable per-field from the real class definitions (§5.1's resolution), but still real, non-mechanical per-field-type conversion work, not a generic switch statement.
- ~~Scale might be large~~ - **checked directly, not estimated**: the true PIM subset (`Product`/`Category`/`Brand`/`Tag`/`Format`/`Market`/`District`/`Route`/`WaterSource`/`Color`) is **202 real objects total** (District 110, Product 44, WaterSource 22, Category 8, Tag 5, Color 5, Brand 5, Market 2, Route 1, Format 0) - trivially small next to the 40,849 headline figure, almost entirely driven by Newsletter/ContactForm* volume (§3.3). Phase 3's pilot scope is genuinely small; no runtime/scale concern for the classes this plan actually targets first.

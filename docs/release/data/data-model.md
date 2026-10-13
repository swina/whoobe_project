# Data model

How Whoobe holds structured data, from the definition of a type to the way a page, an app or an API uses it.

## 1. The parts

| Concept | What it is |
|---|---|
| **Data Class** | The definition of a record type: a name, a label and an ordered list of fields (with sections for the form layout and the list layout) |
| **Field** | One attribute of a class: a name, a title, a type, optional flags (mandatory, localized) and type-specific settings |
| **Data Object** | One record of a class: a key, a locale, a published flag and the values of the fields |
| **Data Component** | A reusable group of fields that can be placed in a class (a block, or an item of a field collection), defined once |
| **Translation group** | The link between the locale rows of one logical record |
| **Workflow** | An optional set of places and transitions for the objects of one class |

## 2. Fields

Field types follow Pimcore's, so a class imported from Pimcore keeps its shape. They fall into groups:

| Group | Types |
|---|---|
| Text | `input`, `textarea`, `wysiwyg` (rich text, sanitised when served), `markdown`, `urlSlug`, `email`, `country` |
| Numbers, dates, flags | `numeric`, `checkbox`, `date` |
| Choice | `select`, `multiselect` (a fixed list of options, or a relation), `array` |
| Structured | `json`, `block` (inline child fields), `fieldcollections` (an ordered mix of several named component types, for example a product's banner, tabs and variants) |
| Relations | `manyToOneRelation`, `manyToManyRelation`, `manyToManyObjectRelation`, `advancedManyToManyRelation`: a reference to objects of another class, with a field of the target shown as its label |
| Media and links | `image`, `video`, `asset` (references to the media library, optionally restricted to some asset types), `link` |

A field can be **localized**, so it holds a value per language, or non-localized, so it is shared. The values are stored as JSON and **checked
against the class definition** when they are written: a number must be a number, a mandatory field must be present, a select value must be
among the options.

## 3. Defining a class

*Settings > Classes* lists the classes and opens an editor for one:

- **Fields**, added, ordered and configured one by one; relations name their target class and the field to display.
- **View layout**: how the edit form is arranged into sections and groups, and the Tailwind classes of a section or control.
- **List layout**: which columns the object list shows.

Changing a class is a normal operation (no deployment). Changing the **type** of an existing field is checked: the change is refused until you confirm it, because stored values may no
longer fit the new type (they are not rewritten). Deleting a class is blocked while objects still belong to it.

## 4. Working with objects

*Data Objects > (a class)* is the list; opening a record opens a tab with one sub-tab per **language**. You can filter and sort the list, export it, act
on several records at once (publish, unpublish, delete), and create a record from scratch.

- **Languages.** Each language of a record is a full row with the same translation group, so a record can be published in some languages and a
  draft in others. A translation can be created by hand or drafted with the AI translation function (a human reviews it).
- **Keys and paths.** A record has a key (unique within its class and language) and a folder-style path.
- **Search.** Published objects are indexed for the built-in search.

## 5. Publishing and workflows

Two independent states:

| State | Meaning |
|---|---|
| `published` | The hard gate. Only published objects are returned by the public API and the Client Hub. Changing it needs the **publish** permission |
| `workflowState` | An editorial place ("draft", "in review", "approved"...) from the class's workflow, if it has one. It does not by itself make anything public, except through a transition that is configured to publish |

A class with no workflow still gets plain draft/published. A workflow is defined per class in *Settings > Workflows* (places, transitions, who may
trigger each transition, and whether a transition publishes). A draft can be shared outside with a **preview link** for one object, with an
expiry, which is revocable. See [draft is never public](../architecture/design-decisions/draft-is-never-public.md).

## 6. Using the data

| Where | How |
|---|---|
| **A page or snippet** | An element is bound to a class (data binding): a single object (chosen, the first, or the one of the current page), a **query** (filters, order, limit, pagination, locale), or a field of the parent record. The result is shown with the element's own layout; a list can link to a detail page whose address is built from a field. *Data bindings* in the dashboard lists every binding and the snippet it came from. |
| **Forms** | A form can create an object of a class: each submission is a draft record in that class, which you review and publish or delete. |
| **The public API** | Read-only: `/public/data-objects` and related routes return **published** objects only, with per-address rate limits. |
| **Your applications (Client Hub)** | An API client with a `data:read:<Class>` scope reads published objects at `/client/v1/data/<class>`, filtered and paged, receiving only the class's own attributes. See the [API clients guide](../communication/api-clients.md). |
| **The headless SDK** | The React, Vue and Svelte adapters consume the same published data. See the [headless SDK](../content/headless-sdk.md). |
| **Tables and sliders** | Elements that present lists use the same bindings, with typed or bound columns. |

## 7. Moving data in and out

- **Pimcore import.** The migration tool reads Pimcore's class definitions and objects, creates the classes, components and objects, and converts
  Pimcore documents into pages. Sources are configured in *Settings > Classes > Pimcore*; credentials of a source are stored encrypted.
- **Website export and import.** A website exports as one archive with its pages, snippets, classes, components, objects and asset files, and imports
  with references rewritten ([website bundle](../content/website-bundle.md)). `dataObjects=referenced` leaves out objects that only a binding would list.
- **Export of a list** from the object view.
- **Files (CSV, JSON, XLSX)** are not yet supported as an import source.

## 8. Limits

- Filtering and sorting run in the application over the rows of a class: fine for thousands of objects, not designed for millions.
- Relations are stored as references; the database does not enforce them (no foreign key), so integrity of references is the application's job.
- Permissions are workspace-wide: there is no per-class or per-record access control inside a workspace (a **role** may or may not read or write
  objects, see [authentication and authorization](../architecture/authentication-and-authorization.md)).
- No scheduled or per-audience publishing.
- The Client Hub cannot yet write objects, and does not expand relations or asset references.

## 9. Related

[Data and storage](../architecture/data-and-storage.md), [data protection](../security/data-protection.md), [design decision: the data model is data](../architecture/design-decisions/the-data-model-is-data.md),
[API reference](../api/api-reference.md).

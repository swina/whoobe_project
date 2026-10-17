# The data model is data

## Decision
Content types are not code. A **Data Class** (its fields, field types, relations, locales, layout) is a record that an administrator edits in the
dashboard at runtime, and a **Data Object** is a record of a class with its attributes stored as structured data (JSON in PostgreSQL). Adding a
field to "Product" is a change in the dashboard, not a release. The model follows **Pimcore's** concepts (classes, objects, relations, field
collections), and a Pimcore installation can be imported.

## Why
- **The people who know the business change it.** A new attribute, a new content type, a different list layout: no developer ticket, no deployment, no migration.
- **One model for many uses.** Products, events, team members, form submissions and data shown on pages are all Data Objects, so permissions,
  publishing, languages, search, export and the API work the same way for all of them.
- **Validation still exists.** The attributes are stored flexibly but checked against the class definition (a schema is compiled from it) at the
  boundary where they are written, so "flexible" does not mean "unchecked".
- **A proven shape.** Pimcore-style classes are familiar to PIM/MDM teams, which makes import and mental mapping straightforward.

## What it costs
- **No relational integrity inside attributes.** Because values are JSON, the database cannot enforce a foreign key between objects; relations are
  resolved and checked by the application.
- **Filtering is done in the application,** over the rows of a class, not with generated SQL on JSON paths. This is simple and predictable, and fine for
  catalogues of thousands of objects; it is not tuned for millions.
- **Changing a field type of a class with data needs care;** the dashboard refuses some changes and reports others.
- **One row per language.** Each locale of an object is a full row (linked by a translation group), which duplicates non-localised fields.

## When to revisit
When a class needs to hold very large volumes with ad-hoc querying: the likely answer is indexed projections for chosen fields, not a different model.

## Where it shows in the product
[Data pillar](../../data/README.md), [data model](../../data/data-model.md), [data and storage](../data-and-storage.md); plans
[`advanced-data-modeling-plan.md`](https://github.com/swina/whoobe_project/blob/master/docs/plans/datamodel/advanced-data-modeling-plan.md).

# Nested bindings: a list inside the item of another list

Date: 2026-10-13. Status: done (first version).

## The problem

A response (or a Data Object) is rarely flat: an array of categories where each category has its own array of `products`, and each product its `variants`. Until now a binding worked on the **first** array only:

- the gateway's path reader (`resolveFieldPath`) gives `undefined` as soon as the path meets an array, so `categories.products` could not be resolved;
- a container with a binding always called the endpoint again (through its `bindingId`) instead of reading from the item it sits in;
- an element inside an item read its value by the **last segment** of its path (`title`), so two levels with a `title` collided.

## Decision

A binding can be **relative to the item it sits in**. Nothing is fetched: the data came with the parent item.

- **Integrations**: `gatewayBinding.scope = 'item'`. `fieldPath` is relative to the item: `products` (a nested list), `details.size` (a field), `^.title` (a field of the item above, one `^.` per level up). On a container it is a list (or one object: a single record for the children); on an element it is the value. Optional on a list: `limit` and `filters` (same operators as every filter), applied by the renderer.
- **Data Objects**: a container with `dataBinding = { resolveMode: 'parent', target: 'list', field }` repeats over the list held by a `block` or `fieldcollections` field of the object it sits in; each item is a record whose `attributes` are the item's fields, so the elements inside bind like to any object. `^.field` reads a field of the object above.
- Strict paths: no guessing by last segment for the new bindings (older content keeps working as it did).
- Up to 5 lists nested (`MAX_NESTED_DEPTH`). A nested list with no item in scope, or with nothing at that path, is an empty list, not an error.
- A nested list is not a source of data: it is not listed in the Data bindings list, the server does not pin it (`bind-page-content.ts` skips it), and its filters stay in the public content (the gateway strips the filters of the bindings it resolves itself, not these).

## Where

- `@whoobe-cms/schema`: `nested-binding.ts` (`withParent`, `readItemPath`, `nestedGatewayList`, `nestedDataList`, `applyItemFilters`, `splitUp`), `GatewayBinding.scope` / `limit`.
- `@whoobe-cms/renderer` walker (published sites: React, Vue, Svelte, Next, Nuxt) and `resolveRecordField` (`^.`).
- Editor: live canvas (`BlockContainer.vue`), Preview (`BlockContainerPreview.vue`), elements, `scripts/nested-context.ts`; authoring in `scripts/nested-binding-author.ts`.
- Authoring: binding an Integrations field (drag from the Gateway panel, the panel's click, or the picker) to an element that sits inside a list of the **same response** saves it relative to the item automatically. Data Objects: Advanced > "Nested list" on the container, and the binding picker offers the fields of the items inside it.

## Not done

- A Table bound to a nested list (the table binding reads its own list).
- Pagination of a nested list on the published site (as for any repeater there); `limit` is the way to bound it.
- The mobile app generator (own renderer).
- An item that carries only an id and needs a second call (a "master-detail" fetch).

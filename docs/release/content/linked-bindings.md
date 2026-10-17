# Linked bindings: a click in one list shows the related records in another

On one page (or snippet) a first list shows, for example, **categories**; when the visitor clicks a category, a second list shows the **products of that category**. The two lists can come from different sources: a Data Class and another Data Class, a Data Class and an [Integrations](../communication/integrations.md) list, or two Integrations lists.

Plan and decisions: [`docs/plans/cms/linked-bindings.md`](https://github.com/swina/whoobe_project/blob/master/docs/plans/cms/linked-bindings.md).

## How to build it

1. **Bind the first list.** A container bound to a list (Data Class query, or an Integrations array) whose child shows the fields of one category (the repeater, see [dynamic website paths](dynamic-website-paths.md) and [integrations](../communication/integrations.md)).
2. **Bind the second list** the same way (products). Keep its **limit at 100 or less**; the filtering is done in the browser over what was loaded.
3. Select the **first** container, open **Data > Linked bindings** and tick **When an item is clicked, select it**:
   - **Selection name**: a word of your choice, for example `category`. It is also the URL parameter.
   - **Value to pass**: the field of the category to pass on, usually its `id` or `slug`.
4. Select the **second** container, open **Data > Linked bindings** and tick **Show only the items that match a selection**:
   - **Selection name**: the same word (`category`).
   - **Field that must equal the selection**: the field of the *product* that holds the category (`category_id`).
   - **While nothing is selected**: *show no item* (default) or *show every item*.

A part is saved only when it has a valid name (letters, digits, `-` and `_`, starting with a letter, up to 32 characters) and a field; until then the panel says "Not active yet".

A container can publish and listen at once: categories > subcategories > products, with two names.

## A second list that is fetched with the chosen value (dynamic route)

The filter above works on a list that is already loaded. When the second list is a **route of an API with a path parameter**, for example `catalogue/category/{id}`, pass the chosen value to it instead:

1. The first list publishes a selection as above (`category`, with the field `id`).
2. Bind the **second container** to that route (Gateway panel or picker). In the **Path parameters** of the picker, type `{selection.category}` in the field of `{id}` (the picker suggests the names used on the page).
3. Put texts and images inside it and bind them to the fields of the response: they are saved relative to the item.

What happens: the published page starts with that container **empty** (the server cannot know the choice). When the visitor clicks a category, the browser asks for `catalogue/category/12` and fills the container, for each item of the answer (an answer that is one object is one record). A choice kept in the address (`?category=12`) fills it at load. Clearing the choice empties it. Other parameters of the route keep their value, and `{id}`-style parameters taken from the page's own address still work.

- It works in the editor's **Preview** and on published sites (Next.js, Nuxt, React, Vue, Svelte). The generated sites get a same-origin route (`/api/whoobe-gateway-resolve`) that adds the site key, as the one for forms; the browser never holds the key.
- Only parameters the binding was saved with are accepted by the gateway: nothing else can be asked from the browser.
- The container is empty in the edit canvas (it shows its template) and there is no preview of the answer in the picker: use the editor Preview.
- Put the dynamic list in a **container**: a single text bound directly to such a route is not filled in the browser. To show the chosen category's own data (name, description), bind a container to the route that answers with one object and put the texts inside.
- Not yet: the same for a Data Class query (a filter taking `{selection.x}`), and the mobile app.

## What the visitor sees

- Clicking an item selects it; clicking the **chosen item again clears** the selection.
- The choice is kept in the address (`/shop?category=12`): the link can be shared, and the back button goes to the previous choice.
- The chosen item has `data-whoobe-selected="true"` and `aria-pressed="true"`; style it with Tailwind, for example `data-[whoobe-selected=true]:ring-2`. Items are keyboard-operable (Tab, Enter, Space).
- A field that holds a **list** (tags) matches when any of its values equals the selection.
- An item that publishes the selection with an empty value clears it.
- Any element can set a selection without being a repeated item: in **Attributes**, add `data-whoobe-select` = `category` and `data-whoobe-value` = `12` (an empty value clears it). That is how an **"All"** button is made. Every `data-whoobe-select` element works the same way.
- A `whoobe-select` event with `{ name, value }` is fired on the document at every change, for scripts that want to react.

## Where it works

| Place | Behaviour |
|---|---|
| Preview in the editor | works; the Preview starts with nothing selected and does not change the editor's address |
| Edit canvas of the editor | shows every item; a click there selects the block to edit |
| Published sites (Next.js, Nuxt, React, Vue, Svelte) | works; the server sends the second list hidden and the script shows the matching items |
| Mobile app | not yet (it has its own renderer) |

## Limits

- The filter is in the browser: the second list loads whole (up to its limit) and the other items are only hidden. They are in the page source: do not use it to keep data private.
- A listening list is not paginated on the published site (the editor's Preview paginates what is shown).
- The first version filters what was loaded. Catalogues too big for one list will need a query per click, planned for later without changing this configuration.

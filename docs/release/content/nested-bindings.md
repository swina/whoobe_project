# Nested bindings: a list inside the item of another list

Real data is rarely flat. A catalogue API answers with **categories**, each category has its own list of **products**, each product its **variants**. A nested binding lets a container inside a repeated item repeat over the list that is **part of that item**, and the elements inside read the fields of their own item.

Plan and decisions: [`docs/plans/cms/nested-bindings.md`](../../plans/cms/nested-bindings.md).

## Integrations (an API)

1. Add the endpoint's route in **Integrations** and bind the outer container to the first list (for example `categories`) as usual: drag the field chip from the **Gateway** panel onto the container, or use the picker.
2. Put a text in that container and bind it to `title` of the category (drag `categories.title`).
3. Put a **container** inside it and drag the chip `categories.products` onto that container. Because it sits inside the list of the same response, the editor saves the binding **relative to the category** (`products`); nothing more is fetched.
4. Put texts and images in the inner container and drag `categories.products.title`, `.price`, ... onto them. They read the fields of the product.
5. To go deeper, repeat: a container in the product bound to `categories.products.variants`, and so on (up to 5 levels).

In the reverse direction, a field of an **outer** item can be used inside an inner one: drag `categories.title` onto an element inside the products and it shows the name of the product's category (it is saved as `^.title`; `^.^.title` is two levels up).

What the outer lists do:
- The endpoint is called **once**, for the outer list. The nested lists come with each item.
- A nested list can have a **limit** and **filters** (Advanced > Nested list); they are applied to the items of each parent (select the inner container, Advanced > Nested list).
- An item without that list shows an empty inner list on the published page; in the editor's canvas the template stays visible, so it can be edited.

## Data Objects

A Data Class can hold a list inside an object (a **block** or a **field collection**).

1. Bind the outer container to a Data Class (a dynamic query), as usual.
2. Put a container inside it, select it, open **Advanced > Nested list** and choose the field that holds the list. Set "At most" if the list can be long.
3. Inside it, bind texts and images with the data binding button: the picker offers the fields **of the items** of that list.
4. A field of the object above is reachable by typing `^.field` as the field of a relative binding.

## Good to know

- The editor's Preview and the published sites (Next.js, Nuxt, React, Vue, Svelte) show the same lists. The mobile app does not support them yet.
- A **Table** bound to a nested list is not supported yet.
- The "Linked bindings" feature ([linked bindings](linked-bindings.md)) works on nested lists too: a click in the categories can filter the products inside each category, or another list elsewhere on the page.
- A nested list is not a source of data: it does not appear in **Data bindings** (the list above it does).

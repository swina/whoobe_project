# Alpine presets

An **Alpine preset** is a named set of Alpine.js directives. You define it once (for example the six `x-transition:*`
attributes of a "fade and scale" effect) and apply it to any element by name, from the page builder:
**AlpineJS > Presets**. It saves retyping the same directives on every element and keeps effects consistent
across a site.

## Using a preset

1. Select an element in the page builder and open the **AlpineJS** tool in the right-hand bar.
2. In **Presets**, pick a preset from the list and press **Apply**. Its directives are added to the element's
   directive list below (an existing directive with the same name is replaced); a check mark in the list shows the
   presets whose directives are all already on the element.
3. The element needs the rest of the Alpine setup: a transition works only with **`x-show`** on the same element and an
   **`x-data`** scope on it or on a parent. Add them in the same panel, for example `x-data` = `{ open: false }` on a
   container and `x-show` = `open` on the element.

Directives run on the **preview and on the published page**, not in the editing canvas.

> **A transition belongs to the element that has `x-show`.** Alpine animates an element when *its own* `x-show`
> changes; `x-transition:*` on a container does nothing for a child that has the `x-show`, and the other way round.
> If a menu panel is shown with `x-show="menu"`, apply the transition preset to **that panel**, not to the element
> that holds the toggle. The panel warns you when an element has `x-transition` directives but no `x-show`.

## Creating a preset

1. Give an element the directives you want (type them in the same panel).
2. Type a name in the **preset name** field and press **Save as preset**. Using an existing name updates that
   preset.

Example, the fade-and-scale transition:

| Directive | Value |
|---|---|
| `x-transition:enter` | `transition ease-out duration-300` |
| `x-transition:enter-start` | `opacity-0 scale-90` |
| `x-transition:enter-end` | `opacity-100 scale-100` |
| `x-transition:leave` | `transition ease-in duration-300` |
| `x-transition:leave-start` | `opacity-100 scale-100` |
| `x-transition:leave-end` | `opacity-0 scale-90` |

## Managing presets

**Manage** (next to the title) lists the presets with three actions each:

- **use current**: replace the preset's directives with those of the selected element;
- **edit**: change the description and the directives as JSON (`{ "x-show": "open", ... }`);
- **delete**.

The catalog is shared by everyone who uses the installation (each workspace has its own). Reading it needs the
`objects:read` permission, changing it `objects:write`, the same as editing a page.

## What a preset is, and is not

- **Applying copies.** A preset is a library of ready-made sets, not a reference: the directives are copied into the
  element and saved with the page. Editing or deleting a preset later does **not** change pages that already used it,
  and a page never depends on the catalog to render. To update such a page, apply the preset again.
- **Where Alpine runs.** Alpine is loaded by the editor preview, by the public pages served by the editor application
  and by the mobile-app shell. The headless SDK and the generated Next.js / Nuxt sites do not render `element.alpine`
  at all, so presets (like any Alpine directive set on an element) have no effect there.
- **Values are code.** A directive value is a JavaScript expression that Alpine evaluates on the page. Presets can
  therefore do anything an editor could already do by typing directives on an element; give `objects:write` only to
  people you trust with that.

## Limits and validation

The server refuses, with the reason, and stores nothing when:

- a name is empty, longer than 40 characters, or contains anything but letters, digits, space, `.`, `_`, `-`; names are
  unique ignoring case;
- a directive is not an Alpine attribute: only `x-...` (with `:argument` and `.modifier`), `@event` and `:attribute`
  forms are accepted, so `onclick`, `style` and `__proto__` are refused;
- a value is not a string or is longer than 4000 characters; a preset has no directives or more than 40; there are
  more than 100 presets; a description is longer than 200 characters.

## API

`GET /whoobe-one/settings/alpine-presets` returns `{ presets: [{ name, description, directives }] }`;
`PUT /whoobe-one/settings/alpine-presets` replaces the whole catalog with the same shape. See the
[API reference](../api/api-reference.md).

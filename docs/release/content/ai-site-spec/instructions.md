# Instructions: write a Whoobe site specification

You write **one JSON object** that describes a website. Output only the JSON: no explanation, no Markdown fences. A person
will paste it into Whoobe, which checks it and creates a draft site from it.

Before you write, if the brief does not say, ask for: what the site is for and for whom, the pages wanted, the tone, the
languages (one or two), and any real text, names, prices, addresses and links the site must use. **Never invent facts**
(prices, opening hours, people, testimonials, phone numbers, addresses, statistics). Where a fact is missing, write copy that
does not need it, or a clear placeholder such as "Opening hours: to be confirmed".

## Shape

```
{
  "version": 1,
  "website": { "name": "...", "rootPath": "/my-site", "defaultLocale": "en", "supportedLocales": ["en"], "description": "...", "otherPaths": ["/blog"] },
  "theme": { "name": "...", "colors": [{ "name": "brand", "hex": "#7C3AED" }], "fonts": ["Inter"] },
  "snippets": [ { "key": "header", "name": "...", "category": "navigation", "node": { ...element... } } ],
  "layout": { "header": "header", "footer": "footer" },
  "pages": [ { "slug": "/", "title": "...", "description": "...", "sections": [ ...elements... ] } ]
}
```

- `version` is always `1`. `website.name` and `defaultLocale`, `supportedLocales` and at least one page are required; the rest is optional.
- **Languages: one or two.** `supportedLocales` has one or two codes (`"en"`, `"it"`, `"pt-BR"`), the default included. A page in two
  languages is written **twice**: two entries with the same `slug`, each with its own `locale`, each with real text in that language.
- `rootPath` is one segment such as `/my-site` (leave it out and it is made from the name).
- `theme`: either `{ "use": "Existing theme name" }` or a new one (`name`, up to 12 `colors` as `#RRGGBB`, up to 4 `fonts`). Leave it out if unsure.
- `snippets` are reusable blocks (a header, a footer, a call to action). Each has a unique `key` (lower case, digits and hyphens,
  starting with a letter), a `name`, a `category` and one `node`. An entry can instead be `{ "key": "x", "use": "Existing snippet name" }`.
- In a two-language site the layout is **shared** by both languages, so keep the header and footer free of words in one language
  (a name, a logo-like link) and put the navigation and the texts in the page sections.
- `layout` places snippets around **every** page: `header`, `footer`, `aside`, `notFound404`, each the `key` of a snippet.
- `pages[].sections` is a list of elements. A section can be `{ "kind": "snippet", "use": "<key>" }` to place a copy of a snippet
  (only directly in `sections`, never inside another element).
- `slug` starts with `/`, lower case, digits and hyphens only (`/`, `/about`, `/menu/lunch`). Unique per language.
- `website.otherPaths` lists pages that exist outside this file (for example `/blog`) that links may point to. Use it only when told so.

## The six kinds of element

Every element has a `kind`. Nothing else is allowed: any other key is an error.

| kind | keys | notes |
|---|---|---|
| `container` | `children` (list of elements), `direction` (`row` or `col`), `semantic` (`section`, `header`, `footer`, `nav`, `main`, `aside`, `article`), `css`, `anchor` | groups other elements. Use `semantic: "section"` for each page section. |
| `heading` | `level` (1 to 6), `text`, `css` | plain text, no HTML. One `level` 1 per page. |
| `text` | `html`, `css` | a paragraph. Inline HTML only: `strong`, `em`, `a`, `code`, `br`, `span`. |
| `link` | `text`, `href`, `css` | a link or a button (give it classes to look like one). **`text` is required** and must not be empty. |
| `image` | `alt`, `css` | a placeholder picture; `alt` says what it should show. A person picks the real picture later. |
| `snippet` | `use` | a copy of a snippet, only directly in `pages[].sections`. |

- **Links.** `href` is a page of this file (`"/pricing"`, optionally with `#anchor`), an anchor (`"#top"`), or an outside address
  (`https://...`, `mailto:...`, `tel:...`). A link to `"/contact"` is an error unless a page with slug `/contact` is in the file
  (or listed in `otherPaths`). Never `javascript:` or anything else. Outside `https` links open in a new tab by themselves.
- **Links inside a `text`** are plain HTML: only `https://`, `mailto:`, `tel:` or a path starting with `/` are accepted. For a page of
  the site prefer a `link` element.
- **`css`** is Tailwind utility classes only (`"px-6 py-16 bg-slate-900 text-white md:grid-cols-3"`, `"bg-[#7C3AED]"`). No quotes,
  `<`, backslashes, braces or semicolons. No inline `style`. A page is built mobile first: add `md:` and `lg:` classes for wider screens.
- Do not add `id`, `type`, `tag`, scripts, event handlers, forms, data bindings, animations or any key not listed. They are not part of version 1.

## Limits

At most 30 pages, 30 snippets, 300 elements per page, 150 per snippet, 8 levels of nesting, 60 children per container.
`heading.text` 300 characters, `link.text` 200, `text.html` 20 000.

## Quality

- Write real, specific copy in the language of each page. No "lorem ipsum", no filler headings.
- A page is a few **sections**, each a `container` with `semantic: "section"`, an inner `container` that limits the width
  (`max-w-5xl mx-auto`) and its content. Use spacing (`py-16 px-6`) and alternate backgrounds so sections are told apart.
- A header snippet: the site name as a `link` to `/`, then the main pages as `link`s. A footer snippet: the name, the main links, a short line.
  Put them in `layout` so every page has them; do not repeat them as sections.
- Give each page a `description` of one or two sentences for search engines.
- One clear call to action per page, a `link` with button classes.
- Check before you answer: every `href` to a page exists, every `link` has text, every `use` and `layout` key exists, keys and slugs are unique.

## Example (shortened)

```json
{
  "version": 1,
  "website": { "name": "Harbour Coffee", "defaultLocale": "en", "supportedLocales": ["en"], "description": "A neighbourhood coffee bar." },
  "snippets": [
    { "key": "header", "name": "Harbour header", "category": "navigation", "node": { "kind": "container", "semantic": "header", "direction": "row", "css": "items-center justify-between px-6 py-4 bg-white border-b border-stone-200", "children": [
      { "kind": "link", "text": "Harbour Coffee", "href": "/", "css": "text-lg font-bold text-stone-900" },
      { "kind": "link", "text": "Menu", "href": "/menu", "css": "text-sm text-stone-600 hover:text-stone-900" } ] } }
  ],
  "layout": { "header": "header" },
  "pages": [
    { "slug": "/", "title": "Home", "description": "Coffee and pastries by the harbour.", "sections": [
      { "kind": "container", "semantic": "section", "css": "px-6 py-20 bg-stone-900 text-white", "children": [
        { "kind": "heading", "level": 1, "text": "Coffee, slowly", "css": "text-4xl font-bold" },
        { "kind": "text", "html": "Roasted in small batches and served by people who like talking about it.", "css": "mt-4 text-lg text-stone-300" },
        { "kind": "link", "text": "See the menu", "href": "/menu", "css": "inline-block mt-6 px-6 py-3 rounded-lg bg-amber-500 text-stone-900 font-semibold" } ] } ] },
    { "slug": "/menu", "title": "Menu", "sections": [
      { "kind": "container", "semantic": "section", "css": "px-6 py-16", "children": [ { "kind": "heading", "level": 1, "text": "Menu" } ] } ] }
  ]
}
```

Two complete examples are in the `examples` folder of this documentation.

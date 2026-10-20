# Content

Everything an author does to build and publish what visitors see: websites, pages, snippets, kits, templates, themes, languages, and the
ways to publish them. Pages are a tree of elements that every output (generated sites, the app, the SDK adapters) renders with the same renderer and that the editor
draws with its own components ([one renderer, many outputs](../architecture/design-decisions/one-renderer-many-outputs.md)).

## Author

| Document | What it covers |
|---|---|
| [User manual](../guides/user-manual/README.md) | Dashboard tour, first page, the page builder, snippets and kits, themes |
| [Alpine presets](alpine-presets.md) | Named sets of interactive directives applied to any element |
| [Audio element](audio-element.md), [Download element](download-element.md), [Markdown element](markdown-element.md), [Table element](table-element.md) | The media, text and data elements |
| [Dynamic website paths](dynamic-website-paths.md) | A list page linking each record to its own detail page |
| [Nested bindings](nested-bindings.md) | A list inside the item of another list (categories > products > variants), from an API or from a block / field collection |
| [Linked bindings](linked-bindings.md) | A click in one list (categories) shows the related records of another (products) on the same page |
| [Objects list](objects-list.md) | The list and the spreadsheet-like table view of a class's records: context menu, resizable columns, editing in the cell with Save / Save & Publish |
| [Documentation sites](documentation-sites.md) | A folder of Markdown becomes a searchable site, live or static |
| [Forms and automations](../communication/README.md) | Forms, file uploads, mail and flows (Communication pillar) |
| [AI assistance](../ai/README.md) | Generate pages, snippets, images, translations |

## Publish

| Document | What it covers |
|---|---|
| [Website publishing](publishing/website-publishing.md) | Generate a Next.js, Nuxt or static site, with SEO, sitemap and the gateway wiring |
| [Capacitor mobile app](publishing/capacitor-mobile-app.md) | Generate an installable iOS/Android app from the same content |
| [Headless SDK](headless-sdk.md) | Render the page trees with your own React, Vue or Svelte components |
| [Website export and import](website-bundle.md) | Move a whole website (pages, data, files) between installations: staging to production, templates, leaving |
| [Create a site from a specification](site-from-specification.md) | Have any language model draft a whole site (pages, header and footer, theme, one or two languages) as one JSON file, check it in the dashboard and import it as a draft; the instructions and examples are in the [`ai-site-spec` folder](ai-site-spec/README.md) |

**In the dashboard:** *Websites*, *Pages*, *Snippets*, *Themes*, *Publish*, *Documents*; the editor opens from a page or snippet.

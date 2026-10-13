# Markdown element

**Markdown** (palette group *text*) holds Markdown text and shows it as formatted HTML: headings, bold and italic,
lists, links, quotes, code, tables, images. Paste Markdown from a README, a document or an AI answer and the page shows
the result.

## Using it

1. Drag **Markdown** from *Elements > text* onto the page. It starts with a short sample.
2. Select it and click **Edit content** (the pencil in the toolbar). A window opens with the **Markdown source** on the
   left (paste or type there) and a **live preview** on the right, drawn with the element's own classes.
3. Close the window. The canvas, the preview mode and the published page show the HTML.

On the canvas the rendered text is not edited in place: what you would type there is HTML, and the element keeps the
Markdown source. Use *Edit content* to change the text.

## Looks

The element carries plain **Tailwind classes** that style what Markdown produces (`[&_h1]:text-3xl`, `[&_ul]:list-disc`,
`[&_a]:underline`, `[&_pre]:bg-gray-900` ...), because the page reset removes the browser's own heading, list and quote
styles. Change them like any other element in *Customize* or *Advanced > Custom Classes*; remove them for an
unstyled result that inherits the site's own typography.

## What it does to the text

- **Standard Markdown with GitHub extensions** (tables, strike-through, fenced code, autolinks), converted by `marked`.
- The result is **sanitised** like all rich text on the platform: scripts, event handlers, `javascript:` links, frames,
  forms and inline styles other than colour and alignment are removed, in the editor, in the preview and in the
  published output. Raw HTML written inside the Markdown is kept only when it is on the rich-text allow-list.
- Task-list checkboxes are not shown (input elements are not on the allow-list).

## Published pages, the SDKs and the mobile app

The stored page keeps the **source**. When a page is served to the public (`/public/page/...`, `/public/pages/...`) the
server converts the Markdown to HTML once and sends an **ordinary element** with HTML content: the React, Vue and Svelte
adapters, the Next.js and Nuxt projects and the mobile app need nothing of their own for it, and the editor's public
route does not convert it twice. The editor's own raw view (`?editor=true`) and the website export keep the Markdown.

## Related

A `markdown` field of a data object bound to an element is converted as well, as before (data binding, no transform
selected): that is the same conversion in the editor, for data that lives in a data class.

// Rendering of search snippets. The server returns titles/excerpts as raw text,
// plus <em>…</em> markers added by ts_headline around the matched terms, so they
// are NOT safe to feed to v-html as they are: a page/class/object title such as
// `<img src=x onerror=…>` would execute in the viewer's browser. Everything is
// HTML-escaped first and only the highlight markers are turned back into markup.

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `markOpen` must be a trusted literal opening tag, e.g. `<mark class="bg-amber-100">`. */
export function highlightSearchSnippet(text: string | null | undefined, markOpen = '<mark>'): string {
  return escapeHtml(text ?? '')
    .replace(/&lt;em&gt;/g, markOpen)
    .replace(/&lt;\/em&gt;/g, '</mark>');
}

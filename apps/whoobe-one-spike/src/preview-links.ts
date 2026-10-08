// Links inside a page previewed by the editor. The editor is mounted under a base path where it is deployed
// (`/whoobe-one/` in the Docker stacks, `/` in local development), but the links stored in the pages are the site's
// own absolute paths, root path included (`/whoobe-website/blog`). Followed as they are, in the mounted editor, such a
// link leaves it and lands on the dashboard, which knows nothing of that path and shows an empty page.

/** `/whoobe-website/blog` -> `/whoobe-one/whoobe-website/blog` for a base of `/whoobe-one/`; anything that is not an
 *  absolute path inside this site (`https://...`, `//cdn...`, `#top`, `mailto:`, a relative link) or already carries
 *  the base is returned unchanged. */
export function prefixInternalHref(href: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  if (!base) return href
  if (!href.startsWith('/') || href.startsWith('//')) return href
  if (href === base || href.startsWith(`${base}/`) || href.startsWith(`${base}?`) || href.startsWith(`${base}#`)) return href
  return base + href
}

const EVENTS = ['mouseover', 'focusin', 'click', 'auxclick', 'contextmenu'] as const

/** Rewrites the `href` of the link under the pointer just before the browser uses it (hover shows the real address, a
 *  click, a middle click, ctrl+click and "open in a new tab" all follow it). Returns the function that removes it. */
export function installPreviewLinkPrefix(baseUrl: string, doc: Document = document): () => void {
  if (!baseUrl.replace(/\/+$/, '')) return () => {}
  const handler = (e: Event): void => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a) return
    const href = a.getAttribute('href') ?? ''
    const next = prefixInternalHref(href, baseUrl)
    if (next !== href) a.setAttribute('href', next)
  }
  for (const t of EVENTS) doc.addEventListener(t, handler, true)
  return () => { for (const t of EVENTS) doc.removeEventListener(t, handler, true) }
}

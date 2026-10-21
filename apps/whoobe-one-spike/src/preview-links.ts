// Links inside a page previewed by the editor. The editor is mounted under a base path where it is deployed
// (`/whoobe-one/` in the Docker stacks, `/` in local development), but the links stored in the pages are the site's
// own absolute paths, root path included (`/whoobe-website/blog`). Followed as they are from a page opened UNDER the
// mount point (`/whoobe-one/whoobe-website/blog`, the way the editor opens its screens), such a link leaves the editor
// and lands on the dashboard, which knows nothing of that path. A page opened at the website's own address
// (`/whoobe-website/blog`, what the dashboard's previews use) needs nothing: the links are already right.

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

/** Is the page open inside the editor's own mount point (`/whoobe-one/...`)? At a website's own address (`/whoobe-website/...`,
 *  served by the proxy since the root path became the preview address) the stored links are right as they are. */
export function isUnderBase(pathname: string, baseUrl: string): boolean {
  const base = baseUrl.replace(/\/+$/, '')
  return !!base && (pathname === base || pathname.startsWith(`${base}/`))
}

/** A draft preview (`?draft=true`) stays a draft preview when a link of the page is followed: the next page may not be published either. */
export function keepDraftPreview(href: string, currentSearch: string): string {
  if (new URLSearchParams(currentSearch).get('draft') !== 'true') return href
  if (!href.startsWith('/') || href.startsWith('//')) return href
  const hash = href.indexOf('#')
  const main = hash >= 0 ? href.slice(0, hash) : href
  const frag = hash >= 0 ? href.slice(hash) : ''
  if (/[?&]draft=true(&|$)/.test(main)) return href
  return main + (main.includes('?') ? '&' : '?') + 'draft=true' + frag
}

const EVENTS = ['mouseover', 'focusin', 'click', 'auxclick', 'contextmenu'] as const

/** Rewrites the `href` of the link under the pointer just before the browser uses it (hover shows the real address, a
 *  click, a middle click, ctrl+click and "open in a new tab" all follow it). Returns the function that removes it. */
export function installPreviewLinkPrefix(baseUrl: string, doc: Document = document): () => void {
  const handler = (e: Event): void => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a) return
    const href = a.getAttribute('href') ?? ''
    const prefixed = isUnderBase(doc.location.pathname, baseUrl) ? prefixInternalHref(href, baseUrl) : href
    const next = keepDraftPreview(prefixed, doc.location.search)
    if (next !== href) a.setAttribute('href', next)
  }
  for (const t of EVENTS) doc.addEventListener(t, handler, true)
  return () => { for (const t of EVENTS) doc.removeEventListener(t, handler, true) }
}

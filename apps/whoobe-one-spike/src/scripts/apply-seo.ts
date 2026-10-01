// Applies a page's SEO settings (title, description, canonical, robots, Open
// Graph, JSON-LD) to the live document <head>, so PublicPage.vue - and the
// Websites > Paths > Preview iframe that embeds it - can be inspected the same
// way a crawler would see the published page. Every tag it creates is marked
// with data-whoobe-seo so a re-apply replaces them instead of duplicating.
import type { PageSeo } from '../pages-api'

const MARK = 'data-whoobe-seo'

function setTag(tag: 'meta' | 'link', attrs: Record<string, string>) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  el.setAttribute(MARK, '')
  document.head.appendChild(el)
}

export function applyPageSeo(page: { title?: string; seo?: PageSeo | null }): void {
  document.head.querySelectorAll(`[${MARK}]`).forEach((n) => n.remove())
  const seo = page.seo ?? {}

  document.title = seo.metaTitle || page.title || document.title
  if (seo.metaDescription) setTag('meta', { name: 'description', content: seo.metaDescription })
  if (seo.canonicalUrl) setTag('link', { rel: 'canonical', href: seo.canonicalUrl })
  if (seo.robots) {
    const content = `${seo.robots.index ? 'index' : 'noindex'},${seo.robots.follow ? 'follow' : 'nofollow'}`
    setTag('meta', { name: 'robots', content })
  }
  const ogTitle = seo.ogTitle || seo.metaTitle || page.title
  const ogDescription = seo.ogDescription || seo.metaDescription
  if (ogTitle) setTag('meta', { property: 'og:title', content: ogTitle })
  if (ogDescription) setTag('meta', { property: 'og:description', content: ogDescription })
  if (seo.ogImage) setTag('meta', { property: 'og:image', content: seo.ogImage })
  if (seo.structuredData && Object.keys(seo.structuredData).length) {
    const el = document.createElement('script')
    el.type = 'application/ld+json'
    el.setAttribute(MARK, '')
    el.textContent = JSON.stringify(seo.structuredData)
    document.head.appendChild(el)
  }
}

import { ApiClient } from '@whoobe-cms/renderer'
import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const api = new ApiClient(process.env.CMS_API_URL!)
  const pages = await api.listPages(process.env.CMS_WEBSITE_ID)

  return pages
    .filter((p) => p.slug !== '')
    .flatMap((p) => {
      const locale = p.locale || 'en'
      const slug = p.slug === '/' ? '' : p.slug.startsWith('/') ? p.slug.slice(1) : p.slug
      const updatedAt = typeof p.updatedAt === 'string' ? p.updatedAt : undefined
      return {
        url: 'https://' + '${domain}' + '/' + slug,
        lastModified: updatedAt ? new Date(updatedAt) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: slug === '' ? 1.0 : 0.7,
      }
    })
}

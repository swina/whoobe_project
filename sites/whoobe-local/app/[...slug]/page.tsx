import { getPageData, generateMetadataFromPage } from '@whoobe-cms/next'
import { WhoobePage } from '@whoobe-cms/next'
import { ApiClient } from '@whoobe-cms/renderer'
import type { Metadata } from 'next'

export async function generateStaticParams() {
  const api = new ApiClient(process.env.CMS_API_URL!)
  const pages = await api.listPages(process.env.CMS_WEBSITE_ID)
  return pages
    .filter((p) => p.slug && p.slug !== '/')
    .map((p) => ({
      slug: (p.slug.startsWith('/') ? p.slug.slice(1) : p.slug).split('/').filter(Boolean),
    }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params
  const path = '/' + slug.join('/')
  const apiUrl = process.env.CMS_API_URL!
  const websiteId = process.env.CMS_WEBSITE_ID
  const revalidate = parseInt(process.env.CMS_REVALIDATE || '60', 10)

  try {
    const { page } = await getPageData('en', path, {
      baseUrl: apiUrl,
      websiteId,
      revalidate,
      assetBaseUrl: (process.env.NEXT_PUBLIC_ASSET_BASE_URL || apiUrl) + '/dam-asset',
    })
    return generateMetadataFromPage(page, apiUrl)
  } catch {
    return {}
  }
}

export default async function CatchAllPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const path = '/' + slug.join('/')
  const apiUrl = process.env.CMS_API_URL!
  const websiteId = process.env.CMS_WEBSITE_ID
  const revalidate = parseInt(process.env.CMS_REVALIDATE || '60', 10)

  try {
    const { descriptor, layout } = await getPageData('en', path, {
      baseUrl: apiUrl,
      websiteId,
      revalidate,
      assetBaseUrl: (process.env.NEXT_PUBLIC_ASSET_BASE_URL || apiUrl) + '/dam-asset',
    })
    return <WhoobePage descriptor={descriptor} layout={layout} />
  } catch {
    return <div className="p-8 text-center text-gray-400">Page not found</div>
  }
}

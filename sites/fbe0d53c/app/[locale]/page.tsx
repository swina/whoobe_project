import { redirect } from 'next/navigation'
import { getPageData } from '@whoobe-cms/next'
import { WhoobePage } from '@whoobe-cms/next'
import { ApiClient } from '@whoobe-cms/renderer'

export default async function LocaleRootPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const api = new ApiClient(process.env.CMS_API_URL!)
  const pages = await api.listPages(process.env.CMS_WEBSITE_ID)
  const localPages = pages.filter((p) => p.locale === locale)

  // Try rendering a page at slug '/' directly. If schema fails, fall back.
  if (localPages.find((p) => p.slug === '/')) {
    try {
      const { descriptor, layout } = await getPageData(locale, '/', {
        baseUrl: process.env.CMS_API_URL!,
        websiteId: process.env.CMS_WEBSITE_ID,
        revalidate: parseInt(process.env.CMS_REVALIDATE || '60', 10),
        assetBaseUrl: (process.env.NEXT_PUBLIC_ASSET_BASE_URL || process.env.CMS_API_URL!) + '/dam-asset',
      })
      return <WhoobePage descriptor={descriptor} layout={layout} />
    } catch {
      // root page exists but content is invalid — fall through to redirect
    }
  }

  // Redirect to the first published page of this locale.
  const homeSlug = localPages[0]?.slug ?? 'home'
  const path = homeSlug.startsWith('/') ? homeSlug.slice(1) : homeSlug
  redirect('/' + locale + '/' + path)
}

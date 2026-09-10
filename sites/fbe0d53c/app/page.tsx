import { getPageData } from '@whoobe-cms/next'
import { WhoobePage } from '@whoobe-cms/next'

export default async function HomePage() {
  try {
    const { descriptor, layout } = await getPageData('en', '/', {
      baseUrl: process.env.CMS_API_URL!,
      websiteId: process.env.CMS_WEBSITE_ID,
      revalidate: parseInt(process.env.CMS_REVALIDATE || '60', 10),
      assetBaseUrl: (process.env.NEXT_PUBLIC_ASSET_BASE_URL || process.env.CMS_API_URL!) + '/dam-asset',
    })
    return <WhoobePage descriptor={descriptor} layout={layout} />
  } catch {
    return <div className="p-8 text-center text-gray-400">Home page not available</div>
  }
}

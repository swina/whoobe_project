import { ApiClient } from '@whoobe-cms/renderer'

export const api = new ApiClient(process.env.CMS_API_URL!)

export const siteConfig = {
  apiUrl: process.env.CMS_API_URL!,
  websiteId: process.env.CMS_WEBSITE_ID!,
  revalidate: parseInt(process.env.CMS_REVALIDATE || '60', 10),
  domain: 'whoobe.local',
}

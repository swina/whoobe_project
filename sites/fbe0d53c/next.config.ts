/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'whoobecms.local',
        pathname: '/dam-asset/**',
      },
    ],
  },
  env: {
    CMS_API_URL: 'http://whoobecms.local:3003',
    CMS_WEBSITE_ID: 'fbe0d53c-dd13-48b1-aa61-2e1608402e5d',
    CMS_REVALIDATE: '60',
    NEXT_PUBLIC_SITE_URL: 'https://whoobe.local',
  },
}

export default nextConfig

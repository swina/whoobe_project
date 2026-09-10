"use client"

import { WhoobeProvider, createWhoobeApi } from '@whoobe-cms/next'
import './globals.css'

const apiUrl = process.env.NEXT_PUBLIC_CMS_API_URL || ''
const assetBaseUrl = process.env.NEXT_PUBLIC_ASSET_BASE_URL || apiUrl
const api = createWhoobeApi(apiUrl)

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <WhoobeProvider api={api} assetBaseUrl={assetBaseUrl + '/dam-asset'}>
          {children}
        </WhoobeProvider>
      </body>
    </html>
  )
}

const ASSET_PROCESSOR_URL = (typeof window !== 'undefined'
  ? (import.meta as any).env?.VITE_ASSET_PROCESSOR_URL
  : process.env.ASSET_PROCESSOR_URL) ?? 'http://localhost:3002'

const DAM_SERVICE_TOKEN = (typeof window !== 'undefined' ? '' : process.env.DAM_SERVICE_TOKEN) ?? ''

export interface LogFileInfo {
  filename: string
  path: string
  size: number
  uploadedAt?: string
}

export async function listLogFiles(
  appName: string,
  yearMonth?: string
): Promise<LogFileInfo[]> {
  const folderPrefix = yearMonth
    ? `private/logs/${appName}/${yearMonth}/`
    : `private/logs/${appName}/`

  try {
    const url = new URL(`${ASSET_PROCESSOR_URL}/api/v1/dam/assets`)
    url.searchParams.set('folderPath', folderPrefix)

    const headers: Record<string, string> = {}
    if (DAM_SERVICE_TOKEN && typeof window === 'undefined') {
      headers['Authorization'] = `Bearer ${DAM_SERVICE_TOKEN}`
    }

    const response = await fetch(url.toString(), {
      credentials: 'include',
      headers,
    })
    if (!response.ok) return []

    const data = await response.json()
    return (data.assets ?? []).map((a: any) => ({
      filename: a.filename,
      path: a.pimcorePath,
      size: a.sizeBytes,
      uploadedAt: a.createdAt,
    }))
  } catch {
    return []
  }
}

export async function downloadLogFile(pimcorePath: string): Promise<string | null> {
  try {
    const url = new URL(`${ASSET_PROCESSOR_URL}/api/v1/dam/asset-urls`)
    url.searchParams.set('pimcorePath', pimcorePath)

    const headers: Record<string, string> = {}
    if (DAM_SERVICE_TOKEN && typeof window === 'undefined') {
      headers['Authorization'] = `Bearer ${DAM_SERVICE_TOKEN}`
    }

    const response = await fetch(url.toString(), {
      credentials: 'include',
      headers,
    })
    if (!response.ok) return null

    const data = await response.json()
    if (!data.url) return null

    const contentResponse = await fetch(data.url)
    if (!contentResponse.ok) return null

    return contentResponse.text()
  } catch {
    return null
  }
}
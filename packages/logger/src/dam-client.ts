const ASSET_PROCESSOR_URL = (typeof window !== 'undefined'
  ? (import.meta as any).env?.VITE_CORE_API_URL
  : process.env.CORE_API_URL) ?? 'http://localhost:3003'

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
  try {
    const url = new URL(`${ASSET_PROCESSOR_URL}/api/v1/system/logs`)
    url.searchParams.set('app', appName)
    if (yearMonth) url.searchParams.set('month', yearMonth)

    const response = await fetch(url.toString(), {
      credentials: 'include',
    })
    if (!response.ok) return []
    const data = await response.json()
    return data.files ?? []
  } catch {
    return []
  }
}

export async function downloadLogFile(pimcorePath: string): Promise<string | null> {
  try {
    const url = new URL(`${ASSET_PROCESSOR_URL}/api/v1/system/logs/download`)
    url.searchParams.set('path', pimcorePath)

    const response = await fetch(url.toString(), {
      credentials: 'include',
    })
    if (!response.ok) return null
    return response.text()
  } catch {
    return null
  }
}
const API_BASE = import.meta.env.VITE_CMS_API_URL || ''

export interface AppDataResult {
  website: { id: string; name: string; rootPath: string; domains: string[] }
  pwaConfig: Record<string, unknown>
  pages: any[]
  paths: any[]
}

export async function useAppData(appId: string): Promise<AppDataResult> {
  const response = await fetch(`${API_BASE}/public/apps/${appId}`)
  if (!response.ok) {
    throw new Error(`Failed to load app data: ${response.statusText}`)
  }
  return response.json()
}
import { getDefaultCoreApiUrl } from './core-api-url'

export interface ThemeData {
  id: string
  name: string
  colors: { name: string; hex: string }[]
  fonts: string[]
  styles: string
  tailwindClasses: string
}

export async function fetchTheme(id: string): Promise<ThemeData | null> {
  try {
    const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/themes/${id}`, { credentials: 'include' })
    if (!res.ok) return null
    const body = await res.json()
    return body.theme ?? null
  } catch {
    return null
  }
}
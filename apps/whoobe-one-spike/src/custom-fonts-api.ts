// The custom fonts of the workspace (apps/core-api: GET /fonts), woff2 files of the DAM registered in Settings > Custom fonts.
// Only the faces whose file can still be read come back with an address; the address is made absolute here, against the server that serves `/dam-asset/`.
import { getDefaultCoreApiUrl } from './core-api-url'
import { getDefaultAssetProcessorUrl } from './resolve-display-url'

export interface EditorFontFace { family: string; weight: number; style: string; url: string }

export async function fetchCustomFonts(): Promise<EditorFontFace[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/fonts`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Could not load the custom fonts (${res.status})`)
  const body = await res.json()
  const base = getDefaultAssetProcessorUrl()
  return (Array.isArray(body?.fonts) ? body.fonts : [])
    .filter((f: any) => f?.available && typeof f.url === 'string')
    .map((f: any) => ({ family: String(f.family), weight: Number(f.weight), style: String(f.style), url: `${base}${f.url}` }))
}

/** A family in the form the editor keeps font names in (Google Fonts URL form: `+` for spaces). */
export const fontKey = (family: string): string => family.trim().replace(/\s+/g, '+')

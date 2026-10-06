// Client for the Alpine presets catalog (apps/core-api: GET/PUT /whoobe-one/settings/alpine-presets). A preset is a
// named set of Alpine directives that is COPIED into an element's own `alpine` map when applied (see
// components/advanced/AlpineControl.vue); the catalog is only a library of ready-made sets.
import { getDefaultCoreApiUrl } from './core-api-url'

export interface AlpinePreset {
  name: string
  description: string
  directives: Record<string, string>
}

export async function fetchAlpinePresets(): Promise<AlpinePreset[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/settings/alpine-presets`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Could not load the Alpine presets (${res.status})`)
  const body = await res.json()
  return Array.isArray(body?.presets) ? body.presets : []
}

/** Replaces the whole catalog. Rejects with the server's message (validation) or a permission message. */
export async function saveAlpinePresets(presets: AlpinePreset[]): Promise<AlpinePreset[]> {
  const res = await fetch(`${getDefaultCoreApiUrl()}/whoobe-one/settings/alpine-presets`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets }),
  })
  if (res.status === 401 || res.status === 403) throw new Error('You are not allowed to change the Alpine presets')
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error || `Could not save the Alpine presets (${res.status})`)
  return Array.isArray(body?.presets) ? body.presets : []
}

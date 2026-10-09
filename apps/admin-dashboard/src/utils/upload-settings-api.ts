// A website's file-upload limits for its forms (core-api GET/PUT /whoobe-one/websites/:id/upload-settings).
export interface UploadSettings {
  enabled: boolean
  allowedExtensions: string[]
  maxFileBytes: number
  maxFiles: number
  dailyBytes: number
  targetFolder: string
  allowPublicFolder: boolean
}

export interface UploadSettingsResponse {
  uploads: UploadSettings
  ceilings: { maxFileBytes: number; maxFiles: number; dailyBytes: number }
  availableExtensions: string[]
}

function base(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

async function parse(res: Response): Promise<any> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error || `Request failed with status ${res.status}`)
  return body
}

export async function fetchUploadSettings(baseUrl: string, websiteId: string): Promise<UploadSettingsResponse> {
  return parse(await fetch(`${base(baseUrl)}/whoobe-one/websites/${websiteId}/upload-settings`, { credentials: 'include' }))
}

export async function saveUploadSettings(baseUrl: string, websiteId: string, settings: UploadSettings): Promise<UploadSettings> {
  const body = await parse(await fetch(`${base(baseUrl)}/whoobe-one/websites/${websiteId}/upload-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(settings),
  }))
  return body.uploads
}

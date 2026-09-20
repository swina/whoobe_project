import { getDefaultCoreApiUrl } from './auth-api'

export interface WebsiteRecord {
  id: string
  name: string
  rootPath: string
  domains: string[]
  defaultLocale: string
  supportedLocales: string[]
  settings: Record<string, unknown> | null
  themeId: string | null
  pwaEnabled: boolean
  pwaConfig: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')
}

async function parseJsonOrThrow(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // Ignore body parse failures; use the generic message above.
    }
    throw new Error(message)
  }
  return res.json()
}

export async function fetchWebsites(baseUrl: string): Promise<WebsiteRecord[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.websites
}

export async function fetchWebsiteById(baseUrl: string, id: string): Promise<WebsiteRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.website
}

export async function createWebsite(
  baseUrl: string,
  input: {
    name: string
    rootPath?: string
    domains?: string[]
    defaultLocale?: string
    supportedLocales?: string[]
    settings?: Record<string, unknown>
    themeId?: string | null
    pwaEnabled?: boolean
    pwaConfig?: Record<string, unknown>
  }
): Promise<WebsiteRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.website
}

export async function updateWebsite(
  baseUrl: string,
  id: string,
  input: {
    name?: string
    rootPath?: string
    domains?: string[]
    defaultLocale?: string
    supportedLocales?: string[]
    settings?: Record<string, unknown>
    themeId?: string | null
    pwaEnabled?: boolean
    pwaConfig?: Record<string, unknown>
  }
): Promise<WebsiteRecord> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.website
}

export async function deleteWebsite(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}

export interface AiWebsiteStructure {
  website: { name: string; defaultLocale: string; supportedLocales: string[]; settings: Record<string, unknown> }
  pages: { slug: string; title: string; category: string; content: unknown }[]
  snippets: { name: string; category: string; node: unknown }[]
}

export async function generateAiWebsiteStructure(baseUrl: string, prompt: string): Promise<AiWebsiteStructure> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/ai/generate-website-structure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.structure
}

export async function createWebsiteFromAi(
  baseUrl: string,
  structure: AiWebsiteStructure
): Promise<{ website: WebsiteRecord; pages: any[]; snippets: any[] }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/from-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structure }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

// --- Website Export / Import ---

export interface WebsiteExportPayload {
  version: number
  website: {
    name: string
    rootPath: string
    domains: string[]
    defaultLocale: string
    supportedLocales: string[]
    settings: Record<string, unknown> | null
    themeId: string | null
  }
  pages: {
    translationGroupId: string
    locale: string
    slug: string
    title: string
    category: string
    kind: string
    published: boolean
    workflowState: string | null
    content: unknown
    seo: unknown
    sitemap: unknown
    search: unknown
    pimcoreId: string | null
    path: string | null
    themeId: string | null
  }[]
  websiteTemplates: {
    name: string
    description: string | null
    layout: Record<string, unknown>
    pathPatterns: string[]
    isDefault: boolean
  }[]
  websitePaths: {
    name: string
    items: Record<string, unknown>[]
  }[]
  themes: {
    name: string
    colors: { name: string; hex: string }[]
    fonts: string[]
    styles: string
    tailwindClasses: string
  }[]
}

export async function exportWebsite(baseUrl: string, id: string): Promise<WebsiteExportPayload> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}/export`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function importWebsite(
  baseUrl: string,
  payload: WebsiteExportPayload
): Promise<{ website: WebsiteRecord; pages: any[]; websiteTemplates: any[]; websitePaths: any[]; themes: any[] }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

// --- Multi-theme API ---

export interface WebsiteTheme {
  id: string
  name: string
  colors: { name: string; hex: string }[]
  fonts: string[]
  styles: string
  tailwindClasses: string
}

export interface WebsiteThemesResponse {
  themes: WebsiteTheme[]
  defaultThemeId: string
}

export async function fetchWebsiteThemes(baseUrl: string, id: string): Promise<WebsiteThemesResponse> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}/themes`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function createWebsiteTheme(
  baseUrl: string,
  websiteId: string,
  input: { name: string; colors?: { name: string; hex: string }[]; fonts?: string[]; styles?: string; tailwindClasses?: string }
): Promise<WebsiteTheme> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${websiteId}/themes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.theme
}

export async function updateWebsiteTheme(
  baseUrl: string,
  websiteId: string,
  themeId: string,
  input: { name?: string; colors?: { name: string; hex: string }[]; fonts?: string[]; styles?: string; tailwindClasses?: string; isDefault?: boolean }
): Promise<WebsiteTheme> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${websiteId}/themes/${themeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.theme
}

export async function fetchDefaultPlaceholderImage(baseUrl: string): Promise<string | null> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/default-placeholder-image`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.pimcorePath ?? null
}

export async function saveDefaultPlaceholderImage(baseUrl: string, pimcorePath: string | null): Promise<void> {
  await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/default-placeholder-image`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pimcorePath }),
    credentials: 'include',
  })
}

export interface AutosaveSettings {
  enabled: boolean
  interval: number
}

export async function fetchAutosaveSettings(baseUrl: string): Promise<AutosaveSettings> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/autosave`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return {
    enabled: !!body.enabled,
    interval: typeof body.interval === 'number' ? body.interval : 60,
  }
}

export async function saveAutosaveSettings(baseUrl: string, settings: AutosaveSettings): Promise<void> {
  await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/autosave`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
    credentials: 'include',
  })
}

export async function fetchStripHtmlCommentsSetting(baseUrl: string): Promise<boolean> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/strip-html-comments`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return !!body.enabled
}

export async function saveStripHtmlCommentsSetting(baseUrl: string, enabled: boolean): Promise<void> {
  await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/strip-html-comments`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
    credentials: 'include',
  })
}

export async function fetchLoggingEnabled(baseUrl: string): Promise<boolean> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/logging`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return typeof body.enabled === 'boolean' ? body.enabled : true
}

export async function saveLoggingEnabled(baseUrl: string, enabled: boolean): Promise<void> {
  await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/logging`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
    credentials: 'include',
  })
}

// CDN mirror endpoint/route to use for "Publish to CDN" (docs/plans/assets/
// assets-cdn.md) - configured once here, reused by every mirror action.
export interface CdnMirrorSettings {
  gatewayRouteId: string | null
  uploadPreset: string | null
  provider: string
}

export async function fetchCdnMirrorSettings(baseUrl: string): Promise<CdnMirrorSettings> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/cdn-mirror`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return {
    gatewayRouteId: typeof body.gatewayRouteId === 'string' ? body.gatewayRouteId : null,
    uploadPreset: typeof body.uploadPreset === 'string' ? body.uploadPreset : null,
    provider: typeof body.provider === 'string' ? body.provider : 'cloudinary',
  }
}

export async function saveCdnMirrorSettings(baseUrl: string, settings: CdnMirrorSettings): Promise<void> {
  await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/settings/cdn-mirror`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
    credentials: 'include',
  })
}

// Legacy single-theme API (backward-compatible) — reads/writes the default theme.
export interface WebsiteThemeLegacy {
  colors: { name: string; hex: string }[]
  fonts: string[]
}

export async function fetchWebsiteTheme(baseUrl: string, id: string): Promise<WebsiteThemeLegacy> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}/theme`, { credentials: 'include' })
  const body = await parseJsonOrThrow(res)
  return body.theme
}

export async function updateWebsiteThemeLegacy(baseUrl: string, id: string, theme: WebsiteThemeLegacy): Promise<WebsiteThemeLegacy> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/whoobe-one/websites/${id}/theme`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(theme),
    credentials: 'include',
  })
  const body = await parseJsonOrThrow(res)
  return body.theme
}
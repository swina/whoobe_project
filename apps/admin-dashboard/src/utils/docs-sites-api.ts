import { runtimeEnv } from './runtime-env'
import { getDefaultCoreApiUrl } from './auth-api'
import { computeSitePreviewBase } from './site-preview-url'

// Documentation sites (docs/plans/docs-sites/docs-site-plan.md): a website of kind "docs" is built from the Markdown files of a
// DAM folder. Reading and checking go through core-api; the files themselves are written with the ordinary DAM upload.

export type NavNode =
  | { type: 'doc'; title: string; path: string; route: string }
  | { type: 'section'; title: string; items: NavNode[]; path?: string; route?: string }
  | { type: 'link'; title: string; href: string }

export interface DocsDocument {
  path: string
  title: string
  route: string
  hidden: boolean
  isPublic: boolean
  version: number
  sizeBytes: number
  s3Key: string
}

export interface DocsSiteTree {
  config: { sourceFolder: string; homeDoc: string | null; navFile: string; title: string }
  navSource: 'auto' | 'manual'
  nav: NavNode[]
  autoNav: NavNode[]
  navFile: string
  navText: string | null
  documents: DocsDocument[]
  files: string[]
  fileAssets: { path: string; s3Key: string; isPublic: boolean; mimeType: string }[]
  warnings: string[]
}

async function parse(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try { const body = await res.json(); if (body?.error) message = body.error } catch { /* generic message */ }
    throw new Error(message)
  }
  return res.json()
}

const base = (baseUrl: string) => (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')

export async function fetchDocsSiteTree(baseUrl: string, websiteId: string): Promise<DocsSiteTree> {
  return parse(await fetch(`${base(baseUrl)}/docs-sites/${websiteId}/tree`, { credentials: 'include' }))
}

export async function renderDocsDraft(baseUrl: string, websiteId: string, path: string, markdown: string): Promise<{ title: string; html: string; headings: { depth: number; text: string; id: string }[]; warnings: string[] }> {
  return parse(await fetch(`${base(baseUrl)}/docs-sites/${websiteId}/render`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ path, markdown }),
  }))
}

export async function checkDocsNav(baseUrl: string, websiteId: string, text: string): Promise<{ ok: boolean; errors: string[]; warnings: string[]; nav: NavNode[] }> {
  return parse(await fetch(`${base(baseUrl)}/docs-sites/${websiteId}/nav/check`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ text }),
  }))
}

/** The text of a document or of the index file, read from storage (a private file needs the session). */
export async function readDocsFile(assetProcessorUrl: string, s3Key: string): Promise<string> {
  const res = await fetch(`${assetProcessorUrl.replace(/\/+$/, '')}/dam-asset/${encodeURIComponent(s3Key)}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Could not read the file (${res.status})`)
  return res.text()
}

// ---- helpers shared by the manager --------------------------------------------------------------------------

/** A path typed or dropped by the user, made safe: relative, no "..", no empty parts; null when nothing usable is left. */
export function cleanRelativePath(input: string): string | null {
  const parts = input.replace(/\\/g, '/').split('/').map((p) => p.trim()).filter((p) => p !== '' && p !== '.')
  if (parts.length === 0 || parts.some((p) => p === '..' || /[\u0000-\u001f]/.test(p))) return null
  return parts.join('/')
}

const yamlText = (s: string): string => (/^[A-Za-z0-9_./-][A-Za-z0-9_./ -]*$/.test(s) && !/^(true|false|null|yes|no|on|off|~|[0-9.+-]+)$/i.test(s) && !/\s$/.test(s) ? s : JSON.stringify(s))

/** The index as the text of a `_nav.yml` (the automatic one is offered as a starting point to edit). */
export function navToYaml(nav: NavNode[]): string {
  const lines: string[] = []
  const walk = (list: NavNode[], indent: string): void => {
    for (const n of list) {
      if (n.type === 'doc') lines.push(`${indent}- doc: ${yamlText(n.path)}`)
      else if (n.type === 'link') lines.push(`${indent}- link: ${yamlText(n.href)}`, `${indent}  title: ${yamlText(n.title)}`)
      else {
        lines.push(`${indent}- title: ${yamlText(n.title)}`)
        if (n.path) lines.push(`${indent}  index: ${yamlText(n.path)}`)
        lines.push(`${indent}  items:`)
        if (n.items.length === 0) lines[lines.length - 1] = `${indent}  items: []`
        else walk(n.items, indent + '    ')
      }
    }
  }
  walk(nav, '')
  return lines.join('\n') + (lines.length ? '\n' : '')
}

/** A flat list of the index for display: depth 0 for top level. */
export function flattenNavForDisplay(nav: NavNode[]): { depth: number; title: string; kind: NavNode['type']; target?: string }[] {
  const out: { depth: number; title: string; kind: NavNode['type']; target?: string }[] = []
  const walk = (list: NavNode[], depth: number): void => {
    for (const n of list) {
      if (n.type === 'doc') out.push({ depth, title: n.title, kind: 'doc', target: n.path })
      else if (n.type === 'link') out.push({ depth, title: n.title, kind: 'link', target: n.href })
      else { out.push({ depth, title: n.title, kind: 'section', target: n.path }); walk(n.items, depth + 1) }
    }
  }
  walk(nav, 0)
  return out
}

/** Where the documentation site is shown by the editor application: the website's root (preview) path on the editor's origin. */
export function docsPreviewUrl(rootPath: string): string {
  if (typeof window === 'undefined') return ''
  const base = computeSitePreviewBase({ override: runtimeEnv('VITE_WHOOBE_ONE_URL'), protocol: window.location.protocol, hostname: window.location.hostname, port: window.location.port })
  return `${base}${rootPath}/`
}

// ---- images in a document -------------------------------------------------------------------------------------

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i
export const isImagePath = (p: string): boolean => IMAGE_EXT.test(p)

/** The path of `filePath` as written in the document at `docPath` (both relative to the source folder): "../images/a b.png" -> "../images/a%20b.png". */
export function relativeDocPath(docPath: string, filePath: string): string {
  const from = docPath.split('/').slice(0, -1)
  const to = filePath.split('/')
  let i = 0
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++
  const parts = [...Array(from.length - i).fill('..'), ...to.slice(i)]
  return parts.map((p) => (p === '..' ? p : encodeURIComponent(p))).join('/')
}

export interface ImageOptions { alt: string; target: string; width?: string; align?: 'left' | 'center' | 'right' | ''; float?: 'left' | 'right' | '' }

/** `![alt](target){width=50% align=center}` - the attributes only when something was chosen. */
export function imageMarkdown(o: ImageOptions): string {
  const alt = o.alt.replace(/[\[\]\n\\]/g, ' ').replace(/\s+/g, ' ').trim()
  const target = /\s|[()<>]/.test(o.target) ? `<${o.target.replace(/>/g, '%3E')}>` : o.target
  const attrs: string[] = []
  const w = (o.width ?? '').trim()
  if (w) attrs.push(`width=${/^\d+(\.\d+)?$/.test(w) ? w + 'px' : w}`)
  if (o.float) attrs.push(`float=${o.float}`)
  else if (o.align) attrs.push(`align=${o.align}`)
  return `![${alt}](${target})${attrs.length ? `{${attrs.join(' ')}}` : ''}`
}

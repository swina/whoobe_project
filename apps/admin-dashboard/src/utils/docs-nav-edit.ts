// The visual editor of a documentation site's index (`_nav.yml`): a tree the user edits by dragging, and the conversions between that
// tree, the index the server computes (NavNode) and the text of the file. Pure, so the rules are tested without a browser.
import type { TreeAdapter } from '@whoobe-cms/core'
import type { DocsDocument, NavNode } from './docs-sites-api'

export type EditNode =
  | { id: string; kind: 'root'; items: EditNode[] }
  | { id: string; kind: 'section'; title: string; items: EditNode[]; indexPath?: string }
  | { id: string; kind: 'doc'; path: string; title: string; custom: boolean }
  | { id: string; kind: 'link'; href: string; title: string }

let counter = 0
export const newEditId = (): string => `n${++counter}-${Math.random().toString(36).slice(2, 7)}`

export const editAdapter: TreeAdapter<EditNode> = {
  id: (n) => n.id,
  children: (n) => (n.kind === 'root' || n.kind === 'section' ? n.items : null),
}

/** The index as the server computed it -> the tree being edited. A document's title is its own unless the index gave it another. */
export function navToEdit(nav: NavNode[], docs: Pick<DocsDocument, 'path' | 'title'>[]): EditNode {
  const own = new Map(docs.map((d) => [d.path, d.title]))
  const conv = (n: NavNode): EditNode => {
    if (n.type === 'doc') return { id: newEditId(), kind: 'doc', path: n.path, title: n.title, custom: own.has(n.path) && own.get(n.path) !== n.title }
    if (n.type === 'link') return { id: newEditId(), kind: 'link', href: n.href, title: n.title }
    return { id: newEditId(), kind: 'section', title: n.title, items: n.items.map(conv), ...(n.path ? { indexPath: n.path } : {}) }
  }
  return { id: 'root', kind: 'root', items: nav.map(conv) }
}

/** Paths of the documents the tree lists. */
export function listedPaths(root: EditNode): Set<string> {
  const out = new Set<string>()
  const walk = (n: EditNode): void => {
    if (n.kind === 'doc') out.add(n.path)
    if (n.kind === 'section') { if (n.indexPath) out.add(n.indexPath); n.items.forEach(walk) }
    if (n.kind === 'root') n.items.forEach(walk)
  }
  walk(root)
  return out
}

/** Documents that exist and are not in the tree (hidden ones stay out on purpose). */
export function unlistedDocuments(root: EditNode, docs: DocsDocument[]): DocsDocument[] {
  const listed = listedPaths(root)
  return docs.filter((d) => !d.hidden && !listed.has(d.path)).sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true }))
}

const yamlText = (s: string): string => (/^[A-Za-z0-9_./-][A-Za-z0-9_./ -]*$/.test(s) && !/^(true|false|null|yes|no|on|off|~|[0-9.+-]+)$/i.test(s) && !/\s$/.test(s) ? s : JSON.stringify(s))

/** The text of `_nav.yml` for a tree. A document's title is written only when it was changed in the index. */
export function editToYaml(root: EditNode): string {
  const lines: string[] = []
  const walk = (list: EditNode[], indent: string): void => {
    for (const n of list) {
      if (n.kind === 'doc') {
        lines.push(`${indent}- doc: ${yamlText(n.path)}`)
        if (n.custom && n.title.trim()) lines.push(`${indent}  title: ${yamlText(n.title.trim())}`)
      } else if (n.kind === 'link') {
        lines.push(`${indent}- link: ${yamlText(n.href)}`, `${indent}  title: ${yamlText(n.title.trim() || n.href)}`)
      } else if (n.kind === 'section') {
        lines.push(`${indent}- title: ${yamlText(n.title.trim() || 'Section')}`)
        if (n.indexPath) lines.push(`${indent}  index: ${yamlText(n.indexPath)}`)
        if (n.items.length === 0) lines.push(`${indent}  items: []`)
        else { lines.push(`${indent}  items:`); walk(n.items, indent + '    ') }
      }
    }
  }
  if (root.kind === 'root') walk(root.items, '')
  return lines.join('\n') + (lines.length ? '\n' : '')
}

/** A new document node for the tree (dragged from the list of documents that are not in the index). */
export function docNode(d: Pick<DocsDocument, 'path' | 'title'>): EditNode {
  return { id: newEditId(), kind: 'doc', path: d.path, title: d.title, custom: false }
}

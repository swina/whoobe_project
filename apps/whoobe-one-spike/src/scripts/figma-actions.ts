import { cloneWithFreshIds } from './editor-actions'
import { clean, applyImagePlaceholder, normalizeGeneratedTree, findParentAndIndex } from '../helpers'
import type { useEditorStore } from '../store/editor'

type EditorStore = ReturnType<typeof useEditorStore>

function ensureNodeDefaults(node: any): void {
  if (!node.css) node.css = { css: '', container: '' }
  if (!node.blocks) node.blocks = []
  for (const child of node.blocks) {
    ensureNodeDefaults(child)
  }
}

export function insertFigmaAsPage(editor: EditorStore, payload: any, name: string): void {
  const normalized = normalizeGeneratedTree(cloneWithFreshIds(payload)) as any
  ensureNodeDefaults(normalized)

  normalized.css.css = clean(normalized.css.css || '')
  normalized.css.container = 'gap-4'

  if (normalized.tag === 'document' || normalized.type === 'container') {
    editor.setDocument(normalized)
    if (editor.page) {
      editor.page.title = name
    }
  } else {
    const root = createFigmaDocumentRoot(name)
    root.blocks = [normalized]
    editor.setDocument(root)
  }

  editor.setCurrent(null)
  ;(editor as any).pageId = null
}

export function insertFigmaAsSnippet(editor: EditorStore, payload: any): boolean {
  const created = normalizeGeneratedTree(cloneWithFreshIds(payload)) as any
  ensureNodeDefaults(created)

  created.css.css = clean(created.css.css || '')
  created.css.container = clean(created.css.container || '')
  applyImagePlaceholder(created)

  const current = editor.current as (any & { type?: string }) | null

  if (current && current.type === 'container') {
    const blocks = (current.blocks as any[]) || []
    blocks.push(created)
    current.blocks = blocks
  } else if (current) {
    const doc = editor.document
    if (doc) {
      const found = findParentAndIndex(doc as any, current.id as string)
      if (found) {
        found.parent.blocks.splice(found.index + 1, 0, created)
      } else if (doc.blocks) {
        ;(doc.blocks as any[]).push(created)
      }
    }
  } else {
    const doc = editor.document
    if (doc && doc.blocks) {
      ;(doc.blocks as any[]).push(created)
    }
  }

  editor.setCurrent(created as any)
  return true
}

function createFigmaDocumentRoot(name: string): any {
  return {
    id: 'figma-root-' + Math.random().toString(36).substring(2, 7),
    type: 'container',
    tag: 'document',
    element: 'div',
    icon: 'dashboard',
    label: name,
    blocks: [],
    css: { css: '', container: '' },
  }
}
// The visual index editor's model: from the server's index to the tree and back to the text of `_nav.yml`, read by the real parser.
import { describe, it, expect } from 'vitest'
import { editToYaml, navToEdit, unlistedDocuments, listedPaths, docNode, editAdapter, type EditNode } from '../../../apps/admin-dashboard/src/utils/docs-nav-edit'
import { moveNode } from '../../../packages/core/src/ui/tree-dnd'
import { parseNavYaml } from '../../../packages/core/src/docs/navigation'

const docs = [
  { path: 'index.md', title: 'Welcome', route: '/', hidden: false, isPublic: true, version: 1, sizeBytes: 1, s3Key: 'k' },
  { path: 'guide/install.md', title: 'Install', route: '/guide/install', hidden: false, isPublic: true, version: 1, sizeBytes: 1, s3Key: 'k' },
  { path: 'guide/usage.md', title: 'Using it', route: '/guide/usage', hidden: false, isPublic: true, version: 1, sizeBytes: 1, s3Key: 'k' },
  { path: 'draft.md', title: 'Draft', route: '/draft', hidden: true, isPublic: true, version: 1, sizeBytes: 1, s3Key: 'k' },
  { path: 'faq.md', title: 'FAQ', route: '/faq', hidden: false, isPublic: true, version: 1, sizeBytes: 1, s3Key: 'k' },
]
const nav = [
  { type: 'doc' as const, title: 'Welcome', path: 'index.md', route: '/' },
  { type: 'section' as const, title: 'Guide', path: undefined, route: undefined, items: [
    { type: 'doc' as const, title: 'First step', path: 'guide/install.md', route: '/guide/install' },
    { type: 'doc' as const, title: 'Using it', path: 'guide/usage.md', route: '/guide/usage' } ] },
  { type: 'link' as const, title: 'Changelog', href: 'https://example.org/changelog' },
]

describe('navToEdit / editToYaml', () => {
  const root = navToEdit(nav as any, docs)
  it('keeps the structure and notices which titles were changed in the index', () => {
    expect(root.kind).toBe('root')
    const first = (root as any).items[1].items[0]
    expect(first).toMatchObject({ kind: 'doc', path: 'guide/install.md', title: 'First step', custom: true })
    expect((root as any).items[1].items[1].custom).toBe(false)
  })
  it('writes a text the real parser reads back to the same structure', () => {
    const text = editToYaml(root)
    expect(text).toContain('- doc: guide/install.md\n      title: First step')
    expect(text).not.toMatch(/title: Using it/)                 // not customised: not written
    const parsed = parseNavYaml(text)
    expect(parsed.errors).toEqual([])
    expect(parsed.entries).toEqual([
      { doc: 'index.md', title: undefined },
      { title: 'Guide', doc: undefined, items: [{ doc: 'guide/install.md', title: 'First step' }, { doc: 'guide/usage.md', title: undefined }] },
      { link: 'https://example.org/changelog', title: 'Changelog' },
    ])
  })
  it('odd titles are quoted so the file stays valid', () => {
    const r: EditNode = { id: 'root', kind: 'root', items: [{ id: 'a', kind: 'section', title: 'Q&A: "tips" # 1', items: [] }, { id: 'b', kind: 'link', href: 'https://x.org/?a=1&b=2', title: 'true' }] }
    const parsed = parseNavYaml(editToYaml(r))
    expect(parsed.errors).toEqual([])
    expect(parsed.entries[0]).toMatchObject({ title: 'Q&A: "tips" # 1', items: [] })
    expect(parsed.entries[1]).toMatchObject({ link: 'https://x.org/?a=1&b=2', title: 'true' })
  })
  it('an empty tree is an empty file; an empty section and a nameless one are still valid', () => {
    expect(editToYaml({ id: 'root', kind: 'root', items: [] })).toBe('')
    const parsed = parseNavYaml(editToYaml({ id: 'root', kind: 'root', items: [{ id: 's', kind: 'section', title: '  ', items: [] }] }))
    expect(parsed.errors).toEqual([])
    expect(parsed.entries[0].title).toBe('Section')
  })
  it('a section keeps its own page (index)', () => {
    const r = navToEdit([{ type: 'section', title: 'Guides', path: 'guide/index.md', route: '/guide/', items: [] }] as any, docs)
    expect(parseNavYaml(editToYaml(r)).entries[0]).toMatchObject({ title: 'Guides', doc: 'guide/index.md' })
  })
})

describe('what is not in the index', () => {
  const root = navToEdit(nav as any, docs)
  it('lists the documents the tree leaves out, hidden ones excepted', () => {
    expect(unlistedDocuments(root, docs).map((d) => d.path)).toEqual(['faq.md'])
    expect([...listedPaths(root)].sort()).toEqual(['guide/install.md', 'guide/usage.md', 'index.md'])
  })
})

describe('dragging in the tree', () => {
  it('a document from the list lands in a section, a node moves between levels, removal returns it to the list', () => {
    const root = navToEdit(nav as any, docs) as any
    const guide = root.items[1]
    guide.items.push(docNode(docs[4]))
    expect(unlistedDocuments(root, docs)).toEqual([])
    expect(moveNode(root, editAdapter, guide.items[0].id, root.items[0].id, 'before')).toMatchObject({ ok: true, moved: true })
    expect(root.items.map((n: EditNode) => (n as any).path ?? (n as any).title)).toEqual(['guide/install.md', 'index.md', 'Guide', 'Changelog'])
    expect(moveNode(root, editAdapter, root.items[0].id, root.items[3].id, 'inside')).toMatchObject({ ok: false, reason: 'not-a-container' })   // a link is a leaf
    guide.items.length = 0
    expect(unlistedDocuments(root, docs).map((d) => d.path)).toEqual(['faq.md', 'guide/usage.md'])
  })
})

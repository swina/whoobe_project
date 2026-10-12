// Finds what is bound to dynamic data (Data Objects or an Integrations/API route) in a page or snippet tree, so the Data bindings
// list of the admin dashboard can show every page and snippet with dynamic data in one place
// (docs/plans/cms/data-bindings-list.md). Pure functions, no Vue and no network: the view feeds them the trees. Nothing is stored.
// Same shape as automations.ts, which does this for forms.

export interface BindingNode {
  id?: string
  blocks?: BindingNode[]
  /** Stamped by the editor on the clone it makes when a snippet is inserted into a page. */
  sourceSnippetId?: string
  dataBinding?: { className?: string; resolveMode?: string; field?: string | null } | null
  gatewayBinding?: { endpointName?: string; routePath?: string; bindingId?: string } | null
}

export interface DataBindingSource {
  kind: 'page' | 'snippet'
  id: string
  title: string
  websiteId?: string | null
  published?: boolean
}

export interface DataBindingEntry {
  /** source + kind + target + route + originating snippet: unique per row of the list. */
  key: string
  source: DataBindingSource
  kind: 'dataObject' | 'gateway'
  /** Data Class name, or the Integrations endpoint name. */
  target: string
  /** Route path of a gateway binding, else ''. */
  route: string
  /** The snippet this block was inserted from, when it came from one. */
  fromSnippetId: string
  /** Bound elements with this target, in document order; the first one is what "Open" selects. */
  elementIds: string[]
}

const MAX_DEPTH = 200

/** Every binding below `root` (the root itself included), grouped by target so a block with ten bound fields is one row. */
export function collectDataBindings(root: unknown, source: DataBindingSource): DataBindingEntry[] {
  const groups = new Map<string, DataBindingEntry>()
  const add = (kind: DataBindingEntry['kind'], target: string, route: string, fromSnippetId: string, elementId: string): void => {
    const key = [source.kind, source.id, kind, target, route, fromSnippetId].join(':')
    const found = groups.get(key)
    if (found) found.elementIds.push(elementId)
    else groups.set(key, { key, source, kind, target, route, fromSnippetId, elementIds: [elementId] })
  }
  const visit = (node: BindingNode | null | undefined, fromSnippetId: string, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return
    const from = typeof node.sourceSnippetId === 'string' && node.sourceSnippetId ? node.sourceSnippetId : fromSnippetId
    if (typeof node.id === 'string') {
      const db = node.dataBinding
      if (db && typeof db === 'object' && typeof db.className === 'string' && db.className) add('dataObject', db.className, '', from, node.id)
      const gb = node.gatewayBinding
      if (gb && typeof gb === 'object' && (gb.endpointName || gb.bindingId)) {
        // the endpoint name is authoring-only (stripped from public content): a binding that only has its id is still a binding
        add('gateway', gb.endpointName || '(unnamed endpoint)', gb.routePath || '', from, node.id)
      }
    }
    for (const child of Array.isArray(node.blocks) ? node.blocks : []) visit(child, from, depth + 1)
  }
  visit(root as BindingNode, '', 0)
  return [...groups.values()]
}

/** The snippet ids a tree was built from, with how many blocks carry each: "this snippet is used in N places". */
export function collectSnippetUses(root: unknown): Map<string, number> {
  const uses = new Map<string, number>()
  const visit = (node: BindingNode | null | undefined, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return
    if (typeof node.sourceSnippetId === 'string' && node.sourceSnippetId) uses.set(node.sourceSnippetId, (uses.get(node.sourceSnippetId) ?? 0) + 1)
    for (const child of Array.isArray(node.blocks) ? node.blocks : []) visit(child, depth + 1)
  }
  visit(root as BindingNode, 0)
  return uses
}

export interface DataBindingListFilter {
  text?: string
  kind?: 'dataObject' | 'gateway' | ''
  /** Only blocks that came from a snippet / only blocks built in the page itself. */
  origin?: 'snippet' | 'own' | ''
}

export function filterDataBindings(entries: DataBindingEntry[], f: DataBindingListFilter): DataBindingEntry[] {
  const q = (f.text ?? '').trim().toLowerCase()
  return entries.filter((e) => {
    if (f.kind && e.kind !== f.kind) return false
    if (f.origin === 'snippet' && !e.fromSnippetId) return false
    if (f.origin === 'own' && e.fromSnippetId) return false
    if (!q) return true
    return [e.source.title, e.target, e.route].some((v) => v.toLowerCase().includes(q))
  })
}

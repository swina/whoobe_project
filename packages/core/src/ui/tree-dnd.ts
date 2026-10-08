// Moving things in a tree: the rules, without any DOM. Used by the editor's element tree and by the documentation index editor, so
// that "where does it land" means the same everywhere and is tested once. Nodes are moved IN PLACE (the callers' trees are reactive).
//
// A drop is always described by a target node and a position relative to it - before, after or inside - never by a pixel or a DOM
// index, which is what made dragging in a flat list of indented rows unreliable.

export type DropPosition = 'before' | 'inside' | 'after'

export interface TreeAdapter<T> {
  id(node: T): string
  /** The node's children array, or null when it cannot have children (a leaf). The array itself is edited. */
  children(node: T): T[] | null
}

export type MoveFailure = 'missing' | 'root' | 'into-itself' | 'not-a-container'
export type MoveResult =
  | { ok: true; moved: boolean; parentId: string; index: number }
  | { ok: false; reason: MoveFailure }

/** Where the pointer is within a row: a container is split in three (top quarter before, bottom quarter after, the rest inside),
 *  a leaf in two. `offsetY` is measured from the top of the row. */
export function dropPositionAt(offsetY: number, height: number, canContain: boolean): DropPosition {
  if (height <= 0) return canContain ? 'inside' : 'after'
  const ratio = Math.min(1, Math.max(0, offsetY / height))
  if (canContain) return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside'
  return ratio < 0.5 ? 'before' : 'after'
}

interface Located<T> { node: T; parent: T | null; index: number }

export function locate<T>(root: T, a: TreeAdapter<T>, id: string): Located<T> | null {
  if (a.id(root) === id) return { node: root, parent: null, index: -1 }
  const walk = (parent: T): Located<T> | null => {
    const kids = a.children(parent)
    if (!kids) return null
    for (let i = 0; i < kids.length; i++) {
      if (a.id(kids[i]) === id) return { node: kids[i], parent, index: i }
      const deeper = walk(kids[i])
      if (deeper) return deeper
    }
    return null
  }
  return walk(root)
}

/** Is `maybeDescendantId` inside the subtree of `ancestor` (or the ancestor itself)? */
export function inSubtree<T>(ancestor: T, a: TreeAdapter<T>, maybeDescendantId: string): boolean {
  return locate(ancestor, a, maybeDescendantId) !== null
}

function plan<T>(root: T, a: TreeAdapter<T>, id: string, targetId: string, pos: DropPosition):
  | { ok: true; from: Located<T>; destParent: T; destIndex: number }
  | { ok: false; reason: MoveFailure } {
  const from = locate(root, a, id)
  const target = locate(root, a, targetId)
  if (!from || !target) return { ok: false, reason: 'missing' }
  if (!from.parent) return { ok: false, reason: 'root' }                              // the root itself is never moved
  if (inSubtree(from.node, a, targetId) && !(pos !== 'inside' && targetId === id)) return { ok: false, reason: 'into-itself' }
  if (pos === 'inside') {
    const kids = a.children(target.node)
    if (!kids) return { ok: false, reason: 'not-a-container' }
    return { ok: true, from, destParent: target.node, destIndex: kids.length }
  }
  if (!target.parent) return { ok: false, reason: 'root' }                            // nothing can sit beside the root
  return { ok: true, from, destParent: target.parent, destIndex: target.index + (pos === 'after' ? 1 : 0) }
}

/** Can `id` be dropped there? (Same answer as moveNode, without moving - for the highlight while dragging.) */
export function canDrop<T>(root: T, a: TreeAdapter<T>, id: string, targetId: string, pos: DropPosition): boolean {
  if (id === targetId && pos !== 'inside') return true            // beside itself: allowed, changes nothing
  return plan(root, a, id, targetId, pos).ok
}

export function moveNode<T>(root: T, a: TreeAdapter<T>, id: string, targetId: string, pos: DropPosition): MoveResult {
  const p = plan(root, a, id, targetId, pos)
  if (!p.ok) return p
  const { from, destParent } = p
  let index = p.destIndex
  const fromKids = a.children(from.parent as T) as T[]
  const toKids = a.children(destParent) as T[]
  if (fromKids === toKids && from.index < index) index -= 1                          // the removal shifts what comes after
  if (fromKids === toKids && from.index === index) return { ok: true, moved: false, parentId: a.id(destParent), index }
  fromKids.splice(from.index, 1)
  toKids.splice(index, 0, from.node)
  return { ok: true, moved: true, parentId: a.id(destParent), index }
}

export type SiblingMove = 'up' | 'down' | 'indent' | 'outdent'

/** The keyboard / button moves: one step up or down among the siblings, into the previous sibling (indent) or out to the parent's level (outdent). */
export function siblingMove<T>(root: T, a: TreeAdapter<T>, id: string, how: SiblingMove): MoveResult {
  const from = locate(root, a, id)
  if (!from) return { ok: false, reason: 'missing' }
  if (!from.parent) return { ok: false, reason: 'root' }
  const kids = a.children(from.parent) as T[]
  if (how === 'up') {
    if (from.index === 0) return { ok: true, moved: false, parentId: a.id(from.parent), index: 0 }
    return moveNode(root, a, id, a.id(kids[from.index - 1]), 'before')
  }
  if (how === 'down') {
    if (from.index === kids.length - 1) return { ok: true, moved: false, parentId: a.id(from.parent), index: from.index }
    return moveNode(root, a, id, a.id(kids[from.index + 1]), 'after')
  }
  if (how === 'indent') {
    const prev = kids[from.index - 1]
    if (!prev) return { ok: true, moved: false, parentId: a.id(from.parent), index: from.index }
    if (!a.children(prev)) return { ok: false, reason: 'not-a-container' }
    return moveNode(root, a, id, a.id(prev), 'inside')
  }
  const up = locate(root, a, a.id(from.parent))
  if (!up || !up.parent) return { ok: true, moved: false, parentId: a.id(from.parent), index: from.index }   // already at the top level
  return moveNode(root, a, id, a.id(from.parent), 'after')
}

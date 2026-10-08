import { describe, it, expect } from 'vitest';
import { canDrop, dropPositionAt, inSubtree, locate, moveNode, siblingMove, type TreeAdapter } from './tree-dnd.js';

interface N { id: string; kids?: N[] }
const A: TreeAdapter<N> = { id: (n) => n.id, children: (n) => n.kids ?? null };
const leaf = (id: string): N => ({ id });
const box = (id: string, ...kids: N[]): N => ({ id, kids });
const shape = (n: N): string => (n.kids ? `${n.id}[${n.kids.map(shape).join(' ')}]` : n.id);
const make = () => box('root', leaf('a'), box('b', leaf('b1'), leaf('b2')), leaf('c'), box('d'));
//  root[a b[b1 b2] c d[]]

describe('dropPositionAt', () => {
  it('a container: top quarter before, bottom quarter after, the middle inside', () => {
    expect([0, 4, 5, 10, 15, 16, 20].map((y) => dropPositionAt(y, 20, true))).toEqual(['before', 'before', 'inside', 'inside', 'inside', 'after', 'after']);
  });
  it('a leaf: upper half before, lower half after; odd heights and out-of-range offsets are safe', () => {
    expect([0, 9, 10, 19].map((y) => dropPositionAt(y, 20, false))).toEqual(['before', 'before', 'after', 'after']);
    expect(dropPositionAt(-5, 20, false)).toBe('before');
    expect(dropPositionAt(99, 20, true)).toBe('after');
    expect(dropPositionAt(3, 0, true)).toBe('inside');
    expect(dropPositionAt(3, 0, false)).toBe('after');
  });
});

describe('moveNode', () => {
  it('before / after a sibling', () => {
    const t = make();
    expect(moveNode(t, A, 'c', 'a', 'before')).toEqual({ ok: true, moved: true, parentId: 'root', index: 0 });
    expect(shape(t)).toBe('root[c a b[b1 b2] d[]]');
    moveNode(t, A, 'c', 'b', 'after');
    expect(shape(t)).toBe('root[a b[b1 b2] c d[]]');
  });
  it('moving down within the same parent accounts for the removal (the classic off-by-one)', () => {
    const t = make();
    moveNode(t, A, 'a', 'c', 'after');
    expect(shape(t)).toBe('root[b[b1 b2] c a d[]]');
    moveNode(t, A, 'a', 'd', 'before');
    expect(shape(t)).toBe('root[b[b1 b2] c a d[]]');         // already just before d: nothing changes
  });
  it('inside a container goes last, into an empty one too, and across levels', () => {
    const t = make();
    moveNode(t, A, 'a', 'b', 'inside');
    expect(shape(t)).toBe('root[b[b1 b2 a] c d[]]');
    moveNode(t, A, 'c', 'd', 'inside');
    expect(shape(t)).toBe('root[b[b1 b2 a] d[c]]');
    moveNode(t, A, 'b1', 'root', 'inside');
    expect(shape(t)).toBe('root[b[b2 a] d[c] b1]');
  });
  it('beside a node of another level lands at that level', () => {
    const t = make();
    moveNode(t, A, 'a', 'b2', 'before');
    expect(shape(t)).toBe('root[b[b1 a b2] c d[]]');
  });
  it('refuses to put a node inside itself or its descendants, the root, a leaf as a container', () => {
    const t = make();
    expect(moveNode(t, A, 'b', 'b', 'inside')).toEqual({ ok: false, reason: 'into-itself' });
    expect(moveNode(t, A, 'b', 'b1', 'inside')).toEqual({ ok: false, reason: 'into-itself' });
    expect(moveNode(t, A, 'b', 'b2', 'after')).toEqual({ ok: false, reason: 'into-itself' });
    expect(moveNode(t, A, 'root', 'a', 'after')).toEqual({ ok: false, reason: 'root' });
    expect(moveNode(t, A, 'a', 'root', 'after')).toEqual({ ok: false, reason: 'root' });
    expect(moveNode(t, A, 'a', 'c', 'inside')).toEqual({ ok: false, reason: 'not-a-container' });
    expect(moveNode(t, A, 'zz', 'a', 'before')).toEqual({ ok: false, reason: 'missing' });
    expect(shape(t)).toBe(shape(make()));              // nothing was lost or changed by the refusals
  });
  it('beside itself is a harmless no-op', () => {
    const t = make();
    expect(moveNode(t, A, 'b', 'b', 'before')).toMatchObject({ ok: true, moved: false });
    expect(shape(t)).toBe(shape(make()));
  });
  it('never loses or duplicates a node, whatever is moved where', () => {
    const ids = ['a', 'b', 'b1', 'b2', 'c', 'd'];
    const count = (n: N): string[] => [n.id, ...(n.kids ?? []).flatMap(count)].sort();
    for (const id of ids) for (const target of [...ids, 'root']) for (const pos of ['before', 'inside', 'after'] as const) {
      const t = make();
      moveNode(t, A, id, target, pos);
      expect(count(t), `${id} ${pos} ${target}`).toEqual(count(make()));
    }
  });
});

describe('canDrop', () => {
  it('agrees with moveNode without moving anything', () => {
    const t = make();
    expect(canDrop(t, A, 'a', 'd', 'inside')).toBe(true);
    expect(canDrop(t, A, 'b', 'b1', 'inside')).toBe(false);
    expect(canDrop(t, A, 'a', 'c', 'inside')).toBe(false);
    expect(canDrop(t, A, 'a', 'a', 'before')).toBe(true);
    expect(shape(t)).toBe(shape(make()));
  });
});

describe('siblingMove (keyboard and buttons)', () => {
  it('up and down swap with the neighbour and stop at the ends', () => {
    const t = make();
    siblingMove(t, A, 'c', 'up');
    expect(shape(t)).toBe('root[a c b[b1 b2] d[]]');
    siblingMove(t, A, 'c', 'down');
    siblingMove(t, A, 'c', 'down');
    expect(shape(t)).toBe('root[a b[b1 b2] d[] c]');
    expect(siblingMove(t, A, 'c', 'down')).toMatchObject({ ok: true, moved: false });
    expect(siblingMove(t, A, 'a', 'up')).toMatchObject({ ok: true, moved: false });
  });
  it('indent goes into the previous sibling (last), outdent comes out after the parent', () => {
    const t = make();
    siblingMove(t, A, 'c', 'indent');
    expect(shape(t)).toBe('root[a b[b1 b2 c] d[]]');
    siblingMove(t, A, 'b1', 'outdent');
    expect(shape(t)).toBe('root[a b[b2 c] b1 d[]]');
    expect(siblingMove(t, A, 'a', 'outdent')).toMatchObject({ ok: true, moved: false });      // already at the top
    expect(siblingMove(t, A, 'a', 'indent')).toMatchObject({ ok: true, moved: false });       // nothing before it
    expect(siblingMove(t, A, 'b1', 'indent')).toMatchObject({ ok: true, moved: true });        // b is a container: b1 goes back into it
    expect(shape(t)).toBe('root[a b[b2 c b1] d[]]');
  });
  it('indent into a leaf is refused', () => {
    const t = box('root', leaf('x'), leaf('y'));
    expect(siblingMove(t, A, 'y', 'indent')).toEqual({ ok: false, reason: 'not-a-container' });
  });
});

describe('locate / inSubtree', () => {
  it('finds nodes, parents and positions', () => {
    const t = make();
    expect(locate(t, A, 'b2')).toMatchObject({ index: 1, parent: { id: 'b' } });
    expect(locate(t, A, 'root')).toMatchObject({ parent: null });
    expect(locate(t, A, 'nope')).toBeNull();
    expect(inSubtree(t.kids![1], A, 'b2')).toBe(true);
    expect(inSubtree(t.kids![1], A, 'c')).toBe(false);
  });
});

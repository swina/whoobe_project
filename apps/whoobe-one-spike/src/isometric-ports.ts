// Geometry shared by the Isometric canvas (components/BlockIsometric.vue) and its read-only counterpart
// (components/preview/BlockIsometricPreview.vue): where a connection port sits on a box, and the cable that joins two ports.
// Every box has a port on each of its four sides; any port can start or end a connection. A connection stores the side
// it leaves (`fromSide`) and the side it enters (`toSide`); connections saved before the top/bottom ports existed have
// neither and are read as right -> left, drawn exactly as they always were.

export type PortSide = 'top' | 'right' | 'bottom' | 'left'
export interface Point { x: number; y: number }
export interface EdgeSides { fromSide?: PortSide; toSide?: PortSide }

export const BOX_W = 240
// The left/right ports sit a little below the top edge (not at mid-height: boxes have very different heights)
export const PORT_Y = 18
export const PORT_SIDES: PortSide[] = ['top', 'right', 'bottom', 'left']

const DIR: Record<PortSide, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}
const OPPOSITE: Record<PortSide, PortSide> = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }

export const oppositeSide = (side: PortSide): PortSide => OPPOSITE[side]
export const edgeFromSide = (edge: EdgeSides): PortSide => edge.fromSide ?? 'right'
export const edgeToSide = (edge: EdgeSides): PortSide => edge.toSide ?? 'left'

/** Canvas position of a box's port. `pos` is the box's top-left corner, `w`/`h` its measured size. */
export function portPos(pos: Point, w: number, h: number, side: PortSide): Point {
  switch (side) {
    case 'left': return { x: pos.x, y: pos.y + PORT_Y }
    case 'right': return { x: pos.x + w, y: pos.y + PORT_Y }
    case 'top': return { x: pos.x + w / 2, y: pos.y }
    case 'bottom': return { x: pos.x + w / 2, y: pos.y + h }
  }
}

/** SVG cubic bezier from port `p1` (leaving through `s1`) to port `p2` (entered through `s2`). */
export function cablePath(p1: Point, s1: PortSide, p2: Point, s2: PortSide): string {
  if (s1 === 'right' && s2 === 'left') {
    // the original horizontal cable, unchanged
    const cx = (p1.x + p2.x) / 2
    return `M ${p1.x} ${p1.y} C ${cx} ${p1.y} ${cx} ${p2.y} ${p2.x} ${p2.y}`
  }
  const k = Math.max(40, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 3)
  const d1 = DIR[s1]
  const d2 = DIR[s2]
  return `M ${p1.x} ${p1.y} C ${p1.x + d1.x * k} ${p1.y + d1.y * k} ${p2.x + d2.x * k} ${p2.y + d2.y * k} ${p2.x} ${p2.y}`
}

/** Small arrow head at the end of a cable, pointing into the box through `side`. Returns an SVG `points` value. */
export function arrowPoints(end: Point, side: PortSide, strokeWidth = 2): string {
  const d = DIR[side]
  const len = 7 + strokeWidth * 1.5
  const half = 3 + strokeWidth
  const tip = { x: end.x + d.x * 8, y: end.y + d.y * 8 } // just outside the port circle
  const base = { x: tip.x + d.x * len, y: tip.y + d.y * len }
  const n = { x: -d.y, y: d.x }
  const f = (p: Point) => `${p.x},${p.y}`
  return [f(tip), f({ x: base.x + n.x * half, y: base.y + n.y * half }), f({ x: base.x - n.x * half, y: base.y - n.y * half })].join(' ')
}

// Isometric canvas: every box has a connection port on each of its four sides and any port can start or end a cable.
// Connections saved before the top/bottom ports existed have no side and must keep being drawn exactly as before.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'
import { PORT_SIDES, PORT_Y, arrowPoints, cablePath, edgeFromSide, edgeToSide, oppositeSide, portPos } from '../../../apps/whoobe-one-spike/src/isometric-ports'

describe('isometric port geometry', () => {
  const pos = { x: 100, y: 50 }
  it('places a port on each side of the measured box', () => {
    expect(portPos(pos, 240, 120, 'left')).toEqual({ x: 100, y: 50 + PORT_Y })
    expect(portPos(pos, 240, 120, 'right')).toEqual({ x: 340, y: 50 + PORT_Y })
    expect(portPos(pos, 240, 120, 'top')).toEqual({ x: 220, y: 50 })
    expect(portPos(pos, 240, 120, 'bottom')).toEqual({ x: 220, y: 170 })
    expect(PORT_SIDES.slice().sort()).toEqual(['bottom', 'left', 'right', 'top'])
  })
  it('a connection without sides reads as right -> left', () => {
    expect(edgeFromSide({})).toBe('right')
    expect(edgeToSide({})).toBe('left')
    expect(edgeFromSide({ fromSide: 'bottom' })).toBe('bottom')
    expect(edgeToSide({ toSide: 'top' })).toBe('top')
  })
  it('the right -> left cable is the original horizontal bezier, byte for byte', () => {
    expect(cablePath({ x: 340, y: 68 }, 'right', { x: 500, y: 200 }, 'left')).toBe('M 340 68 C 420 68 420 200 500 200')
  })
  it('vertical cables leave and enter along the vertical axis', () => {
    // bottom of one box (x 220, y 170) to top of the box below it (x 220, y 300)
    const d = cablePath({ x: 220, y: 170 }, 'bottom', { x: 220, y: 300 }, 'top')
    const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
    const [x1, y1, c1x, c1y, c2x, c2y, x2, y2] = n
    expect([x1, y1, x2, y2]).toEqual([220, 170, 220, 300])
    expect(c1x).toBe(220); expect(c1y).toBeGreaterThan(170) // leaves downwards
    expect(c2x).toBe(220); expect(c2y).toBeLessThan(300) // enters from above
  })
  it('the arrow head has its tip exactly on the box side and points into the box', () => {
    const pts = (s: string) => s.split(' ').map((p) => p.split(',').map(Number))
    const top = pts(arrowPoints({ x: 220, y: 50 }, 'top'))
    expect(top[0]).toEqual([220, 50]) // tip on the port, i.e. on the side
    expect(top[1][1]).toBeLessThan(50) // base further out, above the box
    expect(top[2][1]).toBeLessThan(50)
    const left = pts(arrowPoints({ x: 100, y: 68 }, 'left'))
    expect(left[0]).toEqual([100, 68])
    expect(left[1][0]).toBeLessThan(100)
    const bottom = pts(arrowPoints({ x: 220, y: 170 }, 'bottom'))
    expect(bottom[0]).toEqual([220, 170]); expect(bottom[1][1]).toBeGreaterThan(170)
    const right = pts(arrowPoints({ x: 340, y: 68 }, 'right'))
    expect(right[0]).toEqual([340, 68]); expect(right[1][0]).toBeGreaterThan(340)
    expect(oppositeSide('top')).toBe('bottom')
  })
})

describe('isometric components use the shared geometry', () => {
  const dir = 'apps/whoobe-one-spike/src/components/'
  const editor = readFileSync(join(ROOT_DIR, dir, 'BlockIsometric.vue'), 'utf8')
  const preview = readFileSync(join(ROOT_DIR, dir, 'preview/BlockIsometricPreview.vue'), 'utf8')
  it('the editor draws four ports per box and stores the sides of a new connection', () => {
    expect(editor).toMatch(/v-for="side in PORT_SIDES"/)
    expect(editor).toMatch(/fromSide: pending\.fromSide[^}]*toSide: side/)
  })
  it('the preview and the editor draw cables with the same function', () => {
    expect(editor).toMatch(/cablePath\(/)
    expect(preview).toMatch(/cablePath\(/)
    expect(preview).toMatch(/arrowPoints\(/)
  })
})

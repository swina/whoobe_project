import { describe, it, expect } from 'vitest'
import { ANIMATION_EASES, ANIMATION_EFFECTS, ANIMATION_EFFECT_DEFINITIONS, EASE_FUNCTIONS, cssEasing, effectKeyframe, resolveTiming } from './animations.js'

// values of the editor's previous animation library at p = 0, .1, .25, .5, .75, .9, 1 (measured, GSAP 3.15)
const REFERENCE: Record<string, number[]> = {
  none: [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1],
  power1: [0, 0.19, 0.4375, 0.75, 0.9375, 0.99, 1],
  power2: [0, 0.271, 0.5781, 0.875, 0.9844, 0.999, 1],
  power3: [0, 0.3439, 0.6836, 0.9375, 0.9961, 0.9999, 1],
  power4: [0, 0.4095, 0.7627, 0.9688, 0.999, 1, 1],
  back: [0, 0.4088, 0.8174, 1.0877, 1.0641, 1.0143, 1],
  elastic: [0, 1.25, 0.9116, 1.0156, 1.0055, 0.998, 1],
  bounce: [0, 0.0756, 0.4727, 0.7656, 0.9727, 0.9881, 1],
  circ: [0, 0.4359, 0.6614, 0.866, 0.9682, 0.995, 1],
  expo: [0, 0.4969, 0.8229, 0.9766, 0.9984, 0.9998, 1],
  sine: [0, 0.1564, 0.3827, 0.7071, 0.9239, 0.9877, 1],
}
const P = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]

describe('eases', () => {
  for (const [name, ref] of Object.entries(REFERENCE)) {
    it(`${name} matches the previous curve`, () => {
      P.forEach((p, i) => expect(EASE_FUNCTIONS[name](p)).toBeCloseTo(ref[i], 3))
    })
  }
  it('every ease the editor offers has a curve and a CSS timing function', () => {
    for (const e of ANIMATION_EASES) {
      expect(typeof EASE_FUNCTIONS[e]).toBe('function')
      expect(EASE_FUNCTIONS[e](0)).toBeCloseTo(0, 6)
      expect(EASE_FUNCTIONS[e](1)).toBeCloseTo(1, 6)
      expect(cssEasing(e)).toBeTruthy()
    }
    expect(cssEasing('nonsense')).toBe(cssEasing('power1'))
  })
})

describe('effects', () => {
  it('every effect the editor offers is defined, and every definition is offered', () => {
    expect([...ANIMATION_EFFECTS].sort()).toEqual(Object.keys(ANIMATION_EFFECT_DEFINITIONS).sort())
  })
  it('writes the transform in a fixed order', () => {
    expect(effectKeyframe({ x: 300, scale: 0.5, rotate: 360, rotateX: 90 })).toEqual({ transform: 'translate(300px, 0px) rotate(360deg) rotateX(90deg) scale(0.5)' })
    expect(effectKeyframe({ perspective: '80vw', rotateY: 28 })).toEqual({ transform: 'perspective(80vw) rotateY(28deg)' })
  })
  it('collapse measures the element and has its own default timing', () => {
    expect(ANIMATION_EFFECT_DEFINITIONS.collapse.measure).toBe('height')
    expect(resolveTiming({ animation: 'collapse' })).toMatchObject({ durationMs: 350, delayMs: 0 })
  })
  it('autoAlpha is opacity and visibility', () => {
    expect(effectKeyframe({ autoAlpha: 0 })).toEqual({ opacity: '0', visibility: 'hidden' })
    expect(effectKeyframe({ autoAlpha: 1 })).toEqual({ opacity: '1', visibility: 'inherit' })
  })
  it('timing: empty or zero means the effect default; rotate-hover keeps its own duration', () => {
    expect(resolveTiming({ animation: 'fade', duration: 0, delay: '' })).toMatchObject({ durationMs: 700, delayMs: 0 })
    expect(resolveTiming({ animation: 'fade', duration: '1.5', delay: 0.2 })).toMatchObject({ durationMs: 1500, delayMs: 200 })
    expect(resolveTiming({ animation: 'rotate-3DY' })).toMatchObject({ delayMs: 1000 })
    expect(resolveTiming({ animation: 'rotate-hover', duration: 3 })).toMatchObject({ durationMs: 1000 })
    expect(resolveTiming({ animation: 'nope' })).toBeNull()
    expect(resolveTiming({})).toBeNull()
  })
})

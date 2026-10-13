// Entrance and hover animations of an element (`node.gsap = { animation, ease, duration, delay, trigger }`), on the browser's own
// Web Animations API: no animation library. The editor preview and the React, Vue, Svelte and Nuxt outputs share this one module
// (docs/plans/cms/replace-gsap.md). The effect names, the ease names and the stored fields are the ones the editor has always written, so
// no content changes. The `gsap` key name stays for the same reason.
//
// Nothing runs at import time; the functions below are called from the client's lifecycle (mounted / effect), never on the server.

/** What is stored on a node. `duration` and `delay` are seconds, a number or a numeric text; empty or 0 means "the effect's own default". */
export interface AnimationConfig {
  animation?: string | null
  ease?: string | null
  duration?: number | string | null
  delay?: number | string | null
  /** true: play on hover (and reverse on leave); otherwise play when the element scrolls into view. */
  trigger?: boolean | null
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Eases. The names the editor offers; the curves are the usual "out" curves, written as functions of progress 0..1.

export const ANIMATION_EASES = ['none', 'power1', 'power2', 'power3', 'power4', 'back', 'elastic', 'bounce', 'rough', 'slow', 'steps', 'circ', 'expo', 'sine'] as const

const powerOut = (n: number) => (p: number) => 1 - Math.pow(1 - p, n)
const expoIn = (p: number) => Math.pow(2, 10 * (p - 1)) * p + Math.pow(p, 6) * (1 - p)
const bounceOut = (p: number) => {
  const n = 7.5625, d = 2.75
  if (p < 1 / d) return n * p * p
  if (p < 2 / d) { p -= 1.5 / d; return n * p * p + 0.75 }
  if (p < 2.5 / d) { p -= 2.25 / d; return n * p * p + 0.9375 }
  p -= 2.625 / d
  return n * p * p + 0.984375
}
const elasticOut = (p: number) => {
  if (p === 1) return 1
  const period = 0.3, shift = (period / (2 * Math.PI)) * (Math.PI / 2) // amplitude 1
  return Math.pow(2, -10 * p) * Math.sin(((p - shift) * 2 * Math.PI) / period) + 1
}

/** Progress 0..1 to eased progress 0..1 (may overshoot). Unknown or empty names give the default, `power1`. */
export const EASE_FUNCTIONS: Record<string, (p: number) => number> = {
  none: (p) => p,
  power1: powerOut(2),
  power2: powerOut(3),
  power3: powerOut(4),
  power4: powerOut(5),
  back: (p) => (p ? ((p -= 1) * p * (2.70158 * p + 1.70158) + 1) : 0),
  elastic: elasticOut,
  bounce: bounceOut,
  // `rough` and `slow` never worked in the editor (they were not known to the animation library and fell back to the default),
  // and `steps` raised an error: they are kept in the list and given a sensible curve
  rough: powerOut(2),
  slow: (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p)),
  steps: (p) => Math.min(1, Math.floor(p * 12) / 12 + (p >= 1 ? 1 : 0)),
  circ: (p) => Math.sqrt(1 - (1 - p) * (1 - p)),
  expo: (p) => (p >= 1 ? 1 : 1 - expoIn(1 - p)),
  sine: (p) => (p >= 1 ? 1 : Math.sin((p * Math.PI) / 2)),
}

const CUBIC_FALLBACK: Record<string, string> = {
  none: 'linear', power1: 'cubic-bezier(.25,.46,.45,.94)', power2: 'cubic-bezier(.215,.61,.355,1)', power3: 'cubic-bezier(.165,.84,.44,1)',
  power4: 'cubic-bezier(.23,1,.32,1)', back: 'cubic-bezier(.175,.885,.32,1.275)', circ: 'cubic-bezier(.075,.82,.165,1)', expo: 'cubic-bezier(.19,1,.22,1)',
  sine: 'cubic-bezier(.39,.575,.565,1)', elastic: 'ease-out', bounce: 'ease-out', rough: 'ease-out', slow: 'ease-in-out', steps: 'steps(12)',
}
const easingCache = new Map<string, string>()

/** The CSS timing function for an ease name: `linear(...)` through sampled points where the browser supports it, else a close cubic-bezier. */
export function cssEasing(name?: string | null): string {
  const key = name && name in EASE_FUNCTIONS ? name : 'power1'
  const hit = easingCache.get(key)
  if (hit) return hit
  const supported = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timing-function', 'linear(0, 1)')
  let value: string
  if (!supported) value = CUBIC_FALLBACK[key]
  else if (key === 'none') value = 'linear'
  else if (key === 'steps') value = 'steps(12)'
  else {
    const fn = EASE_FUNCTIONS[key]
    const pts: string[] = []
    const n = 128
    for (let i = 0; i <= n; i++) pts.push(String(Math.round(fn(i / n) * 10000) / 10000))
    value = `linear(${pts.join(', ')})`
  }
  easingCache.set(key, value)
  return value
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Effects. Each is a start state and an end state of the element; a property left out of `from` starts from where the element is.

export interface EffectProps {
  x?: number | string
  y?: number | string
  scale?: number
  scaleX?: number
  scaleY?: number
  /** degrees */
  rotate?: number
  rotateX?: number
  rotateY?: number
  perspective?: string
  opacity?: number
  /** opacity plus visibility: hidden at 0 */
  autoAlpha?: number
  width?: number | string
  height?: number | string
}

export interface EffectDefinition {
  from?: EffectProps
  to: EffectProps
  /** seconds */
  duration?: number
  delay?: number
  /** the duration is not configurable (the effect's own) */
  fixedDuration?: boolean
  /** the end state is the element's own natural height, measured when the animation is built (a height cannot be animated to `auto`) */
  measure?: 'height'
  origin?: string
  ease?: string
}

const D = 0.7

export const ANIMATION_EFFECT_DEFINITIONS: Record<string, EffectDefinition> = {
  fade: { from: { opacity: 0 }, to: { opacity: 1 } },
  scale: { from: { scale: 0, opacity: 0 }, to: { scale: 1, opacity: 1 } },
  'scale-in': { from: { scale: 2, opacity: 0 }, to: { scale: 1, opacity: 1 } },
  'scale-out': { from: { scale: 1 }, to: { scale: 1.1, opacity: 1 } },
  'flip-x': { from: { opacity: 0 }, to: { rotateX: 360, opacity: 1, scale: 1 } },
  'flip-y': { from: { opacity: 0 }, to: { rotateY: 360, opacity: 1, scale: 1 } },
  'slide-left': { from: { autoAlpha: 0, x: 300 }, to: { autoAlpha: 1, x: 0 } },
  'slide-right': { from: { autoAlpha: 0, x: -300 }, to: { autoAlpha: 1, x: 0 } },
  'slide-top': { from: { autoAlpha: 0, y: 200 }, to: { autoAlpha: 1, y: 0 } },
  'slide-down': { from: { autoAlpha: 0, y: -200 }, to: { autoAlpha: 1, y: 0 } },
  rotate: { to: { rotateX: 360, opacity: 1, scale: 1 }, ease: 'power1' },
  'rotate-3DY': { from: { opacity: 1 }, to: { opacity: 1, rotateY: 28, perspective: '80vw' }, delay: 1 },
  'rotate-scale': { from: { opacity: 0, scale: 0.5, x: 300 }, to: { opacity: 1, scale: 1, rotate: 360, x: 0 } },
  'rotate-hover': { from: { opacity: 0.4, scaleX: 2, rotateX: 90 }, to: { rotateX: 360, opacity: 1, scale: 1 }, duration: 1, fixedDuration: true },
  'grow-width': { from: { opacity: 0, x: '100%' }, to: { opacity: 1, x: 0 } },
  // the previous effect also started 100% to the right, but a percentage was measured on the element while it was still 0 wide, so it never moved:
  // only the width grows, from the left
  'width-reverse': { from: { opacity: 0, width: 0 }, to: { opacity: 1, width: '100%' } },
  // the previous effect set width and height to 100% from the start and kept them: they are in both states
  'close-left': { from: { scaleX: 1, width: '100%', height: '100%' }, to: { scaleX: 0, width: '100%', height: '100%' }, origin: '0% 100%' },
  'close-right': { from: { x: 0 }, to: { x: '100%' } },
  // the editor's list calls it `grow-height`; the registered effect used to be spelled `growh-eight`, so it could never play
  'grow-height': { from: { autoAlpha: 1, scaleY: 0 }, to: { autoAlpha: 1, scaleY: 1 } },
  // the element opens from nothing to its own height and then goes back to its natural size (pushing what follows down); on hover it closes again on leave
  collapse: { to: {}, measure: 'height', duration: 0.35, ease: 'power2' },
}

/** The effect names in the order the editor offers them. */
export const ANIMATION_EFFECTS = [
  'fade', 'scale', 'scale-in', 'scale-out', 'flip-x', 'flip-y', 'slide-left', 'slide-right', 'slide-top', 'slide-down', 'rotate', 'rotate-3DY',
  'rotate-scale', 'rotate-hover', 'grow-width', 'width-reverse', 'close-left', 'close-right', 'grow-height', 'collapse',
] as const

export interface TransformUse { perspective?: string; translate?: boolean; rotate?: boolean; rotateY?: boolean; rotateX?: boolean; scale?: boolean }

/** The transform functions a state sets. */
export function transformUse(p: EffectProps | undefined): TransformUse {
  if (!p) return {}
  return {
    perspective: p.perspective, translate: p.x !== undefined || p.y !== undefined, rotate: p.rotate !== undefined, rotateY: p.rotateY !== undefined,
    rotateX: p.rotateX !== undefined, scale: p.scale !== undefined || p.scaleX !== undefined || p.scaleY !== undefined,
  }
}

/** The two states of an effect, with matching transform function lists. */
export function effectFrames(effect: EffectDefinition): [Record<string, string>, Record<string, string>] {
  const a = transformUse(effect.from), b = transformUse(effect.to)
  const uses: TransformUse = {
    perspective: a.perspective ?? b.perspective, translate: a.translate || b.translate, rotate: a.rotate || b.rotate, rotateY: a.rotateY || b.rotateY,
    rotateX: a.rotateX || b.rotateX, scale: a.scale || b.scale,
  }
  // a state that sets no transform at all (it starts where the element is) keeps that: the browser then interpolates from the element's own transform
  return [effect.from && Object.keys(a).some((k) => (a as any)[k]) ? effectKeyframe(effect.from, effect.origin, uses) : effectKeyframe(effect.from, effect.origin), effectKeyframe(effect.to, effect.origin, uses)]
}

const px = (v: number | string) => (typeof v === 'number' ? `${v}px` : v)

/**
 * One state of an effect as CSS properties. The transform order is perspective, translate, rotate, rotateY, rotateX, scale. `uses` lists the
 * transform functions to write even when this state does not set them (at their neutral value): two states that name the same functions in
 * the same order are interpolated function by function, so a 360 degree turn really turns instead of being read as "no change".
 */
export function effectKeyframe(p: EffectProps | undefined, origin?: string, uses?: TransformUse): Record<string, string> {
  const out: Record<string, string> = {}
  if (!p) return out
  const t: string[] = []
  const u = uses ?? transformUse(p)
  if (u.perspective) t.push(`perspective(${p.perspective ?? u.perspective})`)
  if (u.translate) t.push(`translate(${px(p.x ?? 0)}, ${px(p.y ?? 0)})`)
  if (u.rotate) t.push(`rotate(${p.rotate ?? 0}deg)`)
  if (u.rotateY) t.push(`rotateY(${p.rotateY ?? 0}deg)`)
  if (u.rotateX) t.push(`rotateX(${p.rotateX ?? 0}deg)`)
  if (u.scale) t.push(`scale(${p.scale ?? p.scaleX ?? 1}${p.scale === undefined && (p.scaleX !== undefined || p.scaleY !== undefined) ? `, ${p.scaleY ?? 1}` : ''})`)
  if (t.length) out.transform = t.join(' ')
  if (p.autoAlpha !== undefined) { out.opacity = String(p.autoAlpha); out.visibility = p.autoAlpha > 0 ? 'inherit' : 'hidden' }
  if (p.opacity !== undefined) out.opacity = String(p.opacity)
  if (p.width !== undefined) out.width = px(p.width)
  if (p.height !== undefined) out.height = px(p.height)
  if (origin) out.transformOrigin = origin
  return out
}

/** The numbers an effect plays with, from the stored config: a missing or zero duration and delay mean the effect's own, as they always have. */
export function resolveTiming(cfg: AnimationConfig): { effect: EffectDefinition; durationMs: number; delayMs: number; easing: string } | null {
  const effect = cfg.animation ? ANIMATION_EFFECT_DEFINITIONS[cfg.animation] : undefined
  if (!effect) return null
  const duration = effect.fixedDuration ? effect.duration! : parseFloat(String(cfg.duration ?? '')) || effect.duration || D
  const delay = parseFloat(String(cfg.delay ?? '')) || effect.delay || 0
  return { effect, durationMs: duration * 1000, delayMs: delay * 1000, easing: cssEasing(cfg.ease || effect.ease || 'power1') }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Playing

function canAnimate(el: Element | null | undefined): el is HTMLElement {
  return !!el && typeof (el as HTMLElement).animate === 'function'
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Builds the animation on the element (it starts playing; pause it if you need to). Null when the effect is unknown or the browser has no Web Animations. */
export function createAnimation(el: Element, cfg: AnimationConfig): Animation | null {
  const timing = resolveTiming(cfg)
  if (!timing || !canAnimate(el)) return null
  const { effect, durationMs, delayMs, easing } = timing
  const frames = effect.measure === 'height'
    ? [{ height: '0px', overflow: 'hidden' }, { height: `${el.scrollHeight}px`, overflow: 'hidden' }]
    : effectFrames(effect)
  const anim = el.animate(frames, { duration: durationMs, delay: delayMs, easing, fill: 'both' })
  // an element that opened to its own height goes back to its natural one, so it keeps growing and shrinking with its content
  if (effect.measure) anim.addEventListener('finish', () => { if (anim.playbackRate > 0) anim.cancel() })
  return anim
}

/**
 * Plays the animation once, now (the editor's "preview"), then leaves the element as it was. Returns how long it takes in milliseconds
 * (delay included), 0 if nothing plays.
 */
export function previewAnimation(el: Element, cfg: AnimationConfig): number {
  const anim = createAnimation(el, cfg)
  if (!anim) return 0
  const ms = anim.effect?.getComputedTiming().endTime
  const total = typeof ms === 'number' ? ms : 1000
  anim.finished.then(() => anim.cancel()).catch(() => undefined)
  return total
}

/**
 * Wires the animation to the element on a published or preview page and returns the function that undoes it. By default it plays when the
 * element scrolls into view and starts again each time it comes back; with `trigger` it plays on hover and reverses when the pointer leaves.
 * Nothing animates for visitors who ask for reduced motion.
 */
export function mountAnimation(el: Element, cfg: AnimationConfig): () => void {
  if (!cfg.animation || !canAnimate(el) || !ANIMATION_EFFECT_DEFINITIONS[cfg.animation] || reducedMotion()) return () => {}

  if (cfg.trigger) {
    let hover: Animation | null = null
    const onEnter = () => { hover?.cancel(); hover = createAnimation(el, cfg) }
    const onLeave = () => { hover?.reverse() }
    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mouseenter', onEnter)
      el.removeEventListener('mouseleave', onLeave)
      hover?.cancel()
    }
  }

  const anim = createAnimation(el, cfg)
  if (!anim) return () => {}
  if (typeof IntersectionObserver === 'undefined') return () => anim.cancel()
  anim.pause()
  anim.currentTime = 0
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { anim.currentTime = 0; anim.play() } else if (anim.playState === 'running') anim.pause()
    }
  })
  io.observe(el)
  return () => { io.disconnect(); anim.cancel() }
}

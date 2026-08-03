// Port of whoobe-one-studio's src/scripts/gsap.js (another Vue.prototype.$x
// plugin) - plain exported function instead, same rationale as
// editor-actions.ts/database-actions.ts. animations.js (the ~18
// gsap.registerEffect() presets, ported in Phase 1 but dormant until now)
// is what this actually exercises - importing it here is what runs those
// registerEffect() calls, populating gsap.effects[name].
//
// The source's $animation (ScrollTrigger-driven: play once scrolled into
// view, or a hover-triggered variant when `element.gsap.trigger` is set)
// is aimed at the *exported static page*, not the live editor - there's no
// scrolling-into-view moment worth reacting to while you're actively
// editing a node that's already on screen. $animationElement (the
// simpler, immediate-play variant, no ScrollTrigger) is the one that
// actually fits "preview this animation right now" - ported as
// `previewAnimation()` below; $animation itself isn't ported (nothing in
// this spike exports a static page yet for it to matter to).
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import './animations.js'
import type Element from './ElementsClass.js'

gsap.registerPlugin(ScrollTrigger)

type WhoobeElement = InstanceType<typeof Element>

/** Immediately plays the node's configured gsap.animation on its live DOM
 * element - a direct port of $animationElement, minus the always-dead
 * (commented out in the source too) ScrollTrigger.create() block. */
export function previewAnimation(element: WhoobeElement): void {
  if (!element.gsap?.animation) return
  const el = document.getElementById(element.id)
  if (!el) return
  const effect = (gsap as any).effects[element.gsap.animation]
  if (!effect) return
  effect(el, {
    duration: parseFloat(String(element.gsap.duration)) || undefined,
    delay: parseFloat(String(element.gsap.delay)) || undefined,
    ease: element.gsap.ease || undefined,
  })
}

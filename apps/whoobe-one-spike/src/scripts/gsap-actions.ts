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

/** Wires the node's configured gsap.animation to trigger on the published/
 * preview page - a port of the reference's $animation (its own src/scripts
 * /gsap.js), which was never carried over here because this spike had no
 * live preview/published render path yet at the time (see this file's own
 * header comment). PublicPage.vue/DocumentPreview.vue do now, so this
 * closes that gap: called from onMounted() in BlockElementPreview.vue/
 * BlockContainerPreview.vue/BlockSliderPreview.vue.
 *
 * Two trigger modes, matching the source: ScrollTrigger-driven (plays once
 * scrolled into view) by default, or hover (mouseenter/mouseleave) when
 * `element.gsap.trigger` is set. Deliberately gated on `gsap.animation`
 * alone, NOT also `&& gsap.duration` the way the source's own call site
 * gates it (preview/BlockElement.vue's mounted()) - `duration` defaults to
 * `0` on every element (ElementsClass.js's constructor) and nothing ever
 * sets it to a real value unless a user explicitly edits the new Animation
 * panel's Duration field, so that extra condition would silently prevent
 * every freshly-picked animation from ever playing - a real bug in the
 * source, not reproduced here. `previewAnimation()` above already only
 * gates on `animation` for the same reason (a falsy `duration`/`delay`/
 * `ease` here likewise falls through to `undefined`, letting the GSAP
 * effect's own registered `defaults` - animations.js - take over).
 *
 * Returns a cleanup function - the source never tore any of this down, a
 * real gap once preview components can mount/unmount repeatedly
 * (DocumentPreview opening/closing, PublicPage navigation, a data-bound
 * repeater re-rendering its rows). */
export function mountAnimation(element: WhoobeElement, el: HTMLElement): () => void {
  if (!element.gsap?.animation) return () => {}
  const effect = (gsap as any).effects[element.gsap.animation]
  if (!effect) return () => {}

  const opts = {
    duration: parseFloat(String(element.gsap.duration)) || undefined,
    delay: parseFloat(String(element.gsap.delay)) || undefined,
    ease: element.gsap.ease || undefined,
  }

  if (!(element.gsap as any).trigger) {
    const animation = effect(el, opts)
    const trigger = ScrollTrigger.create({
      id: element.id,
      start: 'top 99.99%',
      trigger: el,
      toggleActions: 'play pause restart none',
      animation,
      onEnter: () => {
        if (element.gsap!.delay) animation.play()
        else animation.play(0)
      },
    })
    return () => trigger.kill()
  }

  let hoverAnimation: gsap.core.Tween | null = null
  const onEnter = () => {
    hoverAnimation = effect(el, opts)
    hoverAnimation?.play()
  }
  const onLeave = () => {
    hoverAnimation?.reverse()
  }
  el.addEventListener('mouseenter', onEnter)
  el.addEventListener('mouseleave', onLeave)
  return () => {
    el.removeEventListener('mouseenter', onEnter)
    el.removeEventListener('mouseleave', onLeave)
    hoverAnimation?.kill()
  }
}

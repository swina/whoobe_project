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
import { ref } from 'vue'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import './animations.js'
import type Element from './ElementsClass.js'

gsap.registerPlugin(ScrollTrigger)

type WhoobeElement = InstanceType<typeof Element>

// Set for the duration of a live previewAnimation() run below - read by
// FloatingToolbar.vue's own position-tracking loop (`updatePosition()`,
// re-run every animation frame off `document.getElementById(editor.current.
// id).getBoundingClientRect()`) to skip re-anchoring itself while true. A
// user reported the toolbar visibly "animating too" when previewing a
// bounce/shake/scale effect on the selected element - not literally true
// (the toolbar's own box has no animation on it at all), but from the
// user's side indistinguishable from one: the toolbar faithfully re-reads
// and re-applies the SAME element's bounding rect every frame, so as that
// rect moves/scales through the tween, the toolbar visibly moves/jitters
// right along with it. Freezing tracking for exactly the tween's own
// duration (see previewAnimation() below) means the toolbar just sits still
// at its settled position through the preview, then resumes normal tracking
// once the element is back at rest - matching what "preview the ELEMENT's
// animation" should look like from the outside.
export const previewAnimationActive = ref(false)

/** Immediately plays the node's configured gsap.animation on its live DOM
 * element - a direct port of $animationElement, minus the always-dead
 * (commented out in the source too) ScrollTrigger.create() block. */
export function previewAnimation(element: WhoobeElement): void {
  if (!element.gsap?.animation) return
  const el = document.getElementById(element.id)
  if (!el) return
  const effect = (gsap as any).effects[element.gsap.animation]
  if (!effect) return
  const tween = effect(el, {
    duration: parseFloat(String(element.gsap.duration)) || undefined,
    delay: parseFloat(String(element.gsap.delay)) || undefined,
    ease: element.gsap.ease || undefined,
  })
  // `tween.totalDuration()` (not the `duration`/`delay` passed in above,
  // which are only ever the USER's overrides - most fields are left
  // `undefined` so the named effect's own registered default takes over,
  // see this function's existing comment elsewhere in this file) reads back
  // the tween's real, fully-resolved playback length in seconds, however it
  // was actually determined. A plain timeout rather than an onComplete
  // callback deliberately, so this never touches the tween's own callback
  // wiring - some of the ~18 registered effects in animations.js may
  // already rely on their own internal onComplete for chaining, and
  // overwriting that would be a real behavior change, not just a tracking
  // fix.
  const ms = (typeof tween?.totalDuration === 'function' ? tween.totalDuration() : 1) * 1000
  previewAnimationActive.value = true
  window.setTimeout(() => { previewAnimationActive.value = false }, Math.max(200, ms) + 50)
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

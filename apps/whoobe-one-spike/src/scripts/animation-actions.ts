// The editor's side of element animations: "preview it now" (floating toolbar, Animation panel) and "play it on the preview / published page"
// (the four preview components). The animation itself is the Web Animations based module of @whoobe-cms/renderer, shared with the React, Vue and
// Svelte outputs (docs/plans/cms/replace-gsap.md); this file only adapts it to the editor's Element class. The stored field is still
// `element.gsap` ({ animation, ease, duration, delay, trigger }) so pages and kits keep working.
import { ref } from 'vue'
import { mountAnimation as mountElementAnimation, previewAnimation as previewElementAnimation } from '@whoobe-cms/renderer'
import type Element from './ElementsClass.js'

type WhoobeElement = InstanceType<typeof Element>

// True for the length of a live preview below. FloatingToolbar.vue re-reads the selected element's rectangle every frame to stay next to it;
// while a bounce, shake or scale is playing that rectangle moves, and the toolbar visibly chased it. The toolbar stops tracking for exactly
// the animation's own length, then resumes once the element is back at rest.
export const previewAnimationActive = ref(false)

/** Plays the element's configured animation once, now, on its live DOM element. */
export function previewAnimation(element: WhoobeElement): void {
  if (!element.gsap?.animation) return
  const el = document.getElementById(element.id)
  if (!el) return
  const ms = previewElementAnimation(el, element.gsap)
  if (!ms) return
  previewAnimationActive.value = true
  window.setTimeout(() => { previewAnimationActive.value = false }, Math.max(200, ms) + 50)
}

/**
 * Wires the element's animation on the preview or published page: it plays when the element scrolls into view (and again each time it comes
 * back), or on hover when `element.gsap.trigger` is set. Returns the cleanup; called from onMounted() of the preview components.
 */
export function mountAnimation(element: WhoobeElement, el: HTMLElement): () => void {
  if (!element.gsap?.animation) return () => {}
  return mountElementAnimation(el, element.gsap)
}

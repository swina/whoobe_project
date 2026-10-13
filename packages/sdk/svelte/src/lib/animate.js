// Svelte action: plays an element's animation (`node.gsap`) when it scrolls into view, or on hover when `trigger` is set. The animation is the shared
// Web Animations module of @whoobe-cms/renderer; the action runs only in the browser, after mount.
import { mountAnimation } from '@whoobe-cms/renderer'

/** @param {HTMLElement} el  @param {{ animation?: string | null } | null | undefined} config */
export function animate(el, config) {
  let stop = config?.animation ? mountAnimation(el, config) : () => {}
  return {
    update(next) { stop(); stop = next?.animation ? mountAnimation(el, next) : () => {} },
    destroy() { stop() },
  }
}

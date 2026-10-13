// Plays an element's animation (`node.gsap`) in Vue outputs: on scroll into view, or on hover when `trigger` is set. A directive, so it attaches to
// the rendered DOM element after mount (nothing runs during SSR). The animation is the shared Web Animations module of @whoobe-cms/renderer.
import { mountAnimation, type AnimationConfig } from '@whoobe-cms/renderer'
import type { Directive } from 'vue'

type Cleanup = () => void
const cleanups = new WeakMap<Element, Cleanup>()

export const vWhoobeAnimation: Directive<HTMLElement, AnimationConfig | null | undefined> = {
  mounted(el, binding) {
    if (binding.value?.animation) cleanups.set(el, mountAnimation(el, binding.value))
  },
  unmounted(el) {
    cleanups.get(el)?.()
    cleanups.delete(el)
  },
}

import { watch, onBeforeUnmount } from 'vue'
import { useEditorStore } from '../store/editor'

const STYLE_ID = 'whoobe-appmode-breakpoints'

// Name of the CSS container the App Mode phone frame declares (BlockEditor.vue: `container: app / inline-size`).
export const APP_MODE_CONTAINER = 'app'

// Tailwind's default breakpoints (rem). Responsive variants are media queries on the *window*, so a canvas
// narrowed to 390px inside a 1400px window would still apply `md:`/`lg:`. While App Mode is on, the variants
// are redefined as container queries on the phone frame, so `sm:`, `md:`, `max-md:`... follow the frame width,
// exactly as they would on a phone. Verified against @tailwindcss/browser 4.3: `@custom-variant` replaces the
// built-in variant, and changing the <style> text (not removing the element) makes the runtime rebuild.
const BREAKPOINTS: [string, number][] = [['sm', 40], ['md', 48], ['lg', 64], ['xl', 80], ['2xl', 96]]

const APP_MODE_RULES = BREAKPOINTS.flatMap(([name, rem]) => [
  `@custom-variant ${name} (@container ${APP_MODE_CONTAINER} (width >= ${rem}rem));`,
  `@custom-variant max-${name} (@container ${APP_MODE_CONTAINER} (width < ${rem}rem));`,
]).join('\n')

function styleElement(): HTMLStyleElement {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    el.setAttribute('type', 'text/tailwindcss')
    document.head.appendChild(el)
  }
  return el
}

/**
 * Makes Tailwind's responsive classes follow the App Mode phone frame while editing.
 * Off (empty rules = Tailwind's own window media queries) when App Mode is off and while the preview overlay is
 * open: the desktop preview renders in this same document, outside the frame, and needs the normal breakpoints.
 */
export function useAppModeBreakpoints() {
  const editor = useEditorStore()

  watch(
    () => editor.appMode && !editor.preview,
    (on) => { styleElement().textContent = on ? APP_MODE_RULES : '' },
    { immediate: true },
  )

  onBeforeUnmount(() => { styleElement().textContent = '' })
}

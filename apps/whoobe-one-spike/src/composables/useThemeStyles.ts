import { watch } from 'vue'
import { useEditorStore } from '../store/editor'
import { fontFaceCss } from '@whoobe-cms/core'
import { fetchCustomFonts, fontKey } from '../custom-fonts-api'

const THEME_STYLE_ID = 'whoobe-theme-styles'
const CUSTOM_STYLE_ID = 'whoobe-custom-styles'
const TAILWIND_CLASSES_ID = 'whoobe-tailwind-classes'
const CUSTOM_FONTS_ID = 'whoobe-custom-fonts'

// The custom fonts are read once per page load, by whichever view uses the theme first; a failure (signed out, no route to the server) leaves the list empty.
let customFontsLoad: Promise<void> | null = null

/**
 * Keeps the theme's custom CSS the LAST stylesheet of the head. Rules of equal specificity (`body { background: black }`
 * in the theme against what the page or @tailwindcss/browser writes) are decided by order, and the Tailwind runtime adds its
 * own <style> when its script has loaded - after the theme was injected - so the theme would end up before it.
 * One observer on the head, shared by every composable instance; it moves the element only when something was added after it.
 */
let keepLastObserver: MutationObserver | null = null
function keepCustomStylesLast() {
  if (keepLastObserver || typeof MutationObserver === 'undefined') return
  keepLastObserver = new MutationObserver(() => {
    const el = document.getElementById(CUSTOM_STYLE_ID)
    if (el && el.parentNode === document.head && document.head.lastElementChild !== el) document.head.appendChild(el)
  })
  keepLastObserver.observe(document.head, { childList: true })
}

/**
 * Injects theme styles into the page head so @tailwindcss/browser and the
 * browser's font system recognize what the Theme modal configured.
 *
 * Merges two layers:
 *   1. The website-level theme (editor.websiteTheme) — always injected.
 *   2. The per-page theme (getDoc()?.theme) — overrides the website theme
 *      for the same color names, and replaces website fonts entirely when
 *      the page has its own font list.
 *
 * Also injects the theme's custom CSS styles as a raw <style> element,
 * so both website theme and page/snippet theme styles are applied
 * simultaneously (CSS cascade handles conflicts).
 */
export function useThemeStyles(getDoc: () => any) {
  const editor = useEditorStore()
  let fontLinks: HTMLLinkElement[] = []

  customFontsLoad ??= fetchCustomFonts().then((faces) => editor.setCustomFonts(faces)).catch(() => {})

  function update() {
    const doc = getDoc()
    const pageTheme = doc?.theme
    const webTheme = editor.websiteTheme

    // --- Merge colors: website base + page overrides ---
    const existing = document.getElementById(THEME_STYLE_ID)
    const webColors = (webTheme?.colors as { name: string; hex: string }[]) ?? []
    const pageColors = (pageTheme?.colors as { name: string; hex: string }[]) ?? []

    const colorMap = new Map<string, string>()
    for (const c of webColors) colorMap.set(c.name, c.hex)
    for (const c of pageColors) colorMap.set(c.name, c.hex)

    if (colorMap.size > 0) {
      const lines: string[] = []
      colorMap.forEach((hex, name) => {
        lines.push(`  --color-${name}: ${hex};`)
      })
      let style = existing as HTMLStyleElement | null
      if (!style) {
        style = document.createElement('style')
        style.id = THEME_STYLE_ID
        document.head.appendChild(style)
      }
      style.textContent = `@theme {\n${lines.join('\n')}\n}`
    } else {
      if (existing) existing.remove()
    }

    // --- Fonts: page fonts > website fonts > default list ---
    const pageFonts = pageTheme?.fonts as string[] | undefined
    const webFonts = webTheme?.fonts as string[] | undefined
    const fontList = pageFonts?.length
      ? pageFonts
      : webFonts?.length
        ? webFonts
        : (editor.fonts as string[])

    // One <link> per family, not one combined request - Google Fonts can
    // reject the whole css2 request over a single bad/unknown family name
    // (found live: a theme with a typo'd family and a non-Google system
    // font name in the same list 403'd, taking down every family with it).
    // Isolating requests means one bad name only loses that one font.
    for (const link of fontLinks) link.remove()
    fontLinks = []
    // A custom font has its own @font-face (below) and is not asked of Google, even when a Google family has the same name.
    const customKeys = new Set(editor.customFonts.map((c) => fontKey(c.family)))
    for (const f of fontList) {
      if (customKeys.has(f)) continue
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${f}&display=swap`
      document.head.appendChild(link)
      fontLinks.push(link)
    }

    // --- Custom fonts: every face, so a font used by an element renders whether or not the theme lists it ---
    const faceCss = fontFaceCss(editor.customFonts)
    const faceEl = document.getElementById(CUSTOM_FONTS_ID)
    if (faceCss) {
      const el = (faceEl as HTMLStyleElement | null) ?? Object.assign(document.createElement('style'), { id: CUSTOM_FONTS_ID })
      el.textContent = faceCss
      if (!faceEl) document.head.appendChild(el)
    } else if (faceEl) faceEl.remove()

    // --- Custom styles: inject raw CSS from the active theme ---
    const customExisting = document.getElementById(CUSTOM_STYLE_ID)
    const styles = webTheme?.styles?.trim()
    if (styles) {
      let style = customExisting as HTMLStyleElement | null
      if (!style) {
        style = document.createElement('style')
        style.id = CUSTOM_STYLE_ID
        document.head.appendChild(style)
        keepCustomStylesLast()
      }
      style.textContent = styles
    } else {
      if (customExisting) customExisting.remove()
    }

    // --- Tailwind custom classes: inject into a hidden <div> so
    // @tailwindcss/browser's DOM scanner picks them up and generates CSS ---
    const twExisting = document.getElementById(TAILWIND_CLASSES_ID)
    const twClasses = webTheme?.tailwindClasses?.trim()
    if (twClasses) {
      let div = twExisting as HTMLDivElement | null
      if (!div) {
        div = document.createElement('div')
        div.id = TAILWIND_CLASSES_ID
        div.style.display = 'none'
        document.body.appendChild(div)
      }
      div.className = twClasses
    } else {
      if (twExisting) twExisting.remove()
    }
  }

  watch(
    () => getDoc()?.theme?.colors,
    update,
    { deep: true }
  )
  watch(() => getDoc(), update, { immediate: true })
  watch(() => editor.customFonts, update, { deep: true })
  watch(
    () => editor.websiteTheme,
    update,
    { deep: true }
  )
}
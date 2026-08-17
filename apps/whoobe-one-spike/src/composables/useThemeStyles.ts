import { watch } from 'vue'
import { useEditorStore } from '../store/editor'

const THEME_STYLE_ID = 'whoobe-theme-styles'

/**
 * Injects theme styles into the page head so @tailwindcss/browser and the
 * browser's font system recognize what the Theme modal configured:
 *
 *   - Colors: a <style> element with @theme { --color-{name}: {hex}; ... }
 *   - Fonts: a <link> element pointing at Google Fonts for each family
 *
 * Takes a getter function (not a Ref) so it works with Pinia store
 * properties which are auto-unwrapped. Safe to call from multiple
 * components — all watchers update the same shared elements.
 */
export function useThemeStyles(getDoc: () => any) {
  const editor = useEditorStore()
  let fontLink: HTMLLinkElement | null = null

  function update() {
    const doc = getDoc()
    const theme = doc?.theme

    // --- Colors (@theme) ---
    const existing = document.getElementById(THEME_STYLE_ID)
    if (theme?.colors?.length) {
      const colors = theme.colors
        .map((c: { name: string; hex: string }) => `  --color-${c.name}: ${c.hex};`)
        .join('\n')
      let style = existing as HTMLStyleElement | null
      if (!style) {
        style = document.createElement('style')
        style.id = THEME_STYLE_ID
        document.head.appendChild(style)
      }
      style.textContent = `@theme {\n${colors}\n}`
    } else {
      if (existing) existing.remove()
    }

    // --- Fonts (Google Fonts <link>) ---
    const pageFonts = theme?.fonts as string[] | undefined
    const fontList = pageFonts?.length
      ? pageFonts
      : // Fall back to the editor store's default list when the document
        // has no page-specific fonts (un-opened Theme modal, or a raw
        // fetched page that was saved before theme existed).
        (editor.fonts as string[])
    const fontKey = fontList.join('|')

    fontLink?.remove()
    fontLink = null
    if (fontKey) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?${fontKey
        .split('|')
        .map((f) => `family=${f}`)
        .join('&')}&display=swap`
      document.head.appendChild(link)
      fontLink = link
    }
  }

  watch(
    () => getDoc()?.theme?.colors,
    update,
    { deep: true }
  )
  watch(() => getDoc(), update)
  if (getDoc()) update()
}
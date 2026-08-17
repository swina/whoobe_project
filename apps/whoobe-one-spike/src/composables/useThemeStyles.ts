import { watch } from 'vue'
import { useEditorStore } from '../store/editor'

const THEME_STYLE_ID = 'whoobe-theme-styles'

/**
 * Injects theme styles into the page head so @tailwindcss/browser and the
 * browser's font system recognize what the Theme modal configured.
 *
 * Merges two layers:
 *   1. The website-level theme (editor.websiteTheme, set from
 *      websites.settings.theme when a page/snippet belonging to a website
 *      is loaded) — acts as the base.
 *   2. The per-page theme (getDoc()?.theme) — overrides the website theme
 *      for the same color names, and replaces website fonts entirely when
 *      the page has its own font list.
 */
export function useThemeStyles(getDoc: () => any) {
  const editor = useEditorStore()
  let fontLink: HTMLLinkElement | null = null

  function update() {
    const doc = getDoc()
    const pageTheme = doc?.theme
    const webTheme = editor.websiteTheme

    // --- Merge colors: website base + page overrides ---
    const existing = document.getElementById(THEME_STYLE_ID)
    const webColors = (webTheme?.colors as { name: string; hex: string }[]) ?? []
    const pageColors = (pageTheme?.colors as { name: string; hex: string }[]) ?? []

    // Page colors with the same name replace the website's entry.
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
  watch(
    () => editor.websiteTheme,
    update,
    { deep: true }
  )
  if (getDoc()) update()
}
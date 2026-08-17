import { watch, type Ref } from 'vue'

const THEME_STYLE_ID = 'whoobe-theme-styles'

/**
 * Injects theme colors as @theme CSS custom properties so
 * @tailwindcss/browser recognizes named classes like `bg-light-grey`.
 * Watches `docRef` for theme.colors changes and updates a <style> element.
 * Call from any component that renders a document tree (editor, preview,
 * public page). Safe to call from multiple components simultaneously -
 * the shared <style id="whoobe-theme-styles"> is updated in place.
 */
export function useThemeStyles(docRef: Ref<any>) {
  function update() {
    const existing = document.getElementById(THEME_STYLE_ID)
    const theme = docRef.value?.theme
    if (!theme?.colors?.length) {
      if (existing) existing.remove()
      return
    }
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
  }

  watch(
    () => docRef.value?.theme?.colors,
    update,
    { deep: true }
  )
  watch(() => docRef.value, update)

  // Call once synchronously if the document is already available.
  if (docRef.value) update()
}
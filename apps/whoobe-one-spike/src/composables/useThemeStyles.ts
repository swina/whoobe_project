import { watch } from 'vue'

const THEME_STYLE_ID = 'whoobe-theme-styles'

/**
 * Injects theme colors as @theme CSS custom properties so
 * @tailwindcss/browser recognizes named classes like `bg-light-grey`.
 * Takes a getter function (not a Ref) so it works with Pinia store
 * properties which are auto-unwrapped.
 */
export function useThemeStyles(getDoc: () => any) {
  function update() {
    const existing = document.getElementById(THEME_STYLE_ID)
    const doc = getDoc()
    const theme = doc?.theme
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
    () => getDoc()?.theme?.colors,
    update,
    { deep: true }
  )
  watch(() => getDoc(), update)
  if (getDoc()) update()
}
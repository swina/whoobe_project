import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'whoobe:theme'

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyThemeClass(theme: Theme) {
  // The 'light' custom variant (style.css) activates on a `.light`
  // ancestor class - dark is this app's default, always-applied look
  // (every existing color utility), so dark mode needs no class at all.
  document.documentElement.classList.toggle('light', theme === 'light')
}

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>(readStoredTheme())
  applyThemeClass(theme.value)

  watch(theme, (value) => {
    applyThemeClass(value)
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Storage unavailable - the toggle still works for this session,
      // it just won't be remembered next visit.
    }
  })

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  return { theme, toggleTheme }
})

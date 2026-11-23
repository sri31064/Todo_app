import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'taskspace-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
const THEME_COLOR = {
  light: '#f3f4f9',
  dark: '#0f1117',
} as const

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(DARK_QUERY).matches
  )
}

function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[theme])
}

/**
 * Light/dark theme state. The first load follows the operating system; once
 * the user toggles, their choice is saved in localStorage and takes over.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme() ?? (prefersDark() ? 'dark' : 'light'))
  const [hasChoice, setHasChoice] = useState(() => readStoredTheme() !== null)

  useEffect(() => {
    applyTheme(theme)
    if (hasChoice) {
      try {
        window.localStorage.setItem(STORAGE_KEY, theme)
      } catch {
        // Private browsing can block storage; the theme still applies in memory.
      }
    }
  }, [theme, hasChoice])

  // Until the user picks a theme, follow OS changes while the tab is open.
  useEffect(() => {
    if (hasChoice || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => {
      setTheme(event.matches ? 'dark' : 'light')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [hasChoice])

  const toggleTheme = useCallback(() => {
    setHasChoice(true)
    setTheme((current) => (current === 'light' ? 'dark' : 'light'))
  }, [])

  return { theme, toggleTheme }
}

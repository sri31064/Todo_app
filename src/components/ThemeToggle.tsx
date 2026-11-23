import type { Theme } from '../hooks/useTheme'
import { MoonIcon, SunIcon } from './icons'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
  className?: string
}

/** Button that flips between light and dark themes. */
export function ThemeToggle({ theme, onToggle, className = '' }: ThemeToggleProps) {
  const next = theme === 'light' ? 'dark' : 'light'
  const label = `Switch to ${next} theme`

  return (
    <button
      type="button"
      className={`icon-btn theme-toggle${className ? ` ${className}` : ''}`}
      onClick={onToggle}
      aria-label={label}
      title={label}
    >
      {theme === 'light' ? <MoonIcon /> : <SunIcon />}
    </button>
  )
}

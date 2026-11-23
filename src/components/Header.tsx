import type { Theme } from '../hooks/useTheme'
import { LogOutIcon, UserIcon } from './icons'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  title: string
  subtitle: string
  email: string
  theme: Theme
  onToggleTheme: () => void
  onSignOut: () => void
}

export function Header({
  title,
  subtitle,
  email,
  theme,
  onToggleTheme,
  onSignOut,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div>
        <h1 id="app-title">{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
      <div className="header-actions">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <span className="user-chip" title={email} aria-label={`Signed in as ${email}`}>
          <UserIcon />
          <span className="user-email">{email}</span>
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={onSignOut}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOutIcon />
        </button>
      </div>
    </header>
  )
}

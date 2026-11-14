import { LogOutIcon, UserIcon } from './icons'

interface HeaderProps {
  title: string
  subtitle: string
  email: string
  onSignOut: () => void
}

export function Header({ title, subtitle, email, onSignOut }: HeaderProps) {
  return (
    <header className="app-header">
      <div>
        <h1 id="app-title">{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
      <div className="header-actions">
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

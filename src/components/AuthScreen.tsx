import { useState, type FormEvent } from 'react'
import type { Theme } from '../types'
import { CheckCircleIcon } from './icons'
import { ThemeToggle } from './ThemeToggle'

export type AuthMode = 'signin' | 'signup'

interface AuthScreenProps {
  theme: Theme
  busy: boolean
  error: string | null
  onSubmit: (mode: AuthMode, email: string, password: string) => void
  onClearError: () => void
  onToggleTheme: () => void
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(mode: AuthMode, email: string, password: string): string | null {
  if (!email) return 'Enter your email address.'
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address.'
  if (!password) return 'Enter your password.'
  if (mode === 'signup' && password.length < 8) {
    return 'Password must be at least 8 characters.'
  }
  return null
}

export function AuthScreen({
  theme,
  busy,
  error,
  onSubmit,
  onClearError,
  onToggleTheme,
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const isSignup = mode === 'signup'
  const message = localError ?? error

  function changeMode(next: AuthMode) {
    if (next === mode) return
    setMode(next)
    setPassword('')
    setLocalError(null)
    onClearError()
  }

  function clearError() {
    if (localError) setLocalError(null)
    if (error) onClearError()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const problem = validate(mode, email.trim(), password)
    if (problem) {
      setLocalError(problem)
      return
    }

    setLocalError(null)
    onSubmit(mode, email.trim(), password)
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-top">
          <div className="auth-brand">
            <span className="auth-logo" aria-hidden="true">
              <CheckCircleIcon />
            </span>
            <div>
              <p className="auth-eyebrow">My Tasks</p>
              <h1 id="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
            </div>
          </div>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>

        <p className="auth-sub">
          {isSignup
            ? 'Your tasks will be saved to this account and only visible to you.'
            : 'Sign in to open your private task list.'}
        </p>

        <div className="auth-tabs" role="group" aria-label="Authentication mode">
          <button
            type="button"
            className={mode === 'signin' ? 'auth-tab is-active' : 'auth-tab'}
            aria-pressed={mode === 'signin'}
            onClick={() => changeMode('signin')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'auth-tab is-active' : 'auth-tab'}
            aria-pressed={mode === 'signup'}
            onClick={() => changeMode('signup')}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" noValidate onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <input
              id="auth-email"
              type="email"
              name="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              disabled={busy}
              onChange={(event) => {
                setEmail(event.target.value)
                clearError()
              }}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              id="auth-password"
              type="password"
              name="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              placeholder={isSignup ? 'At least 8 characters' : 'Your password'}
              value={password}
              disabled={busy}
              onChange={(event) => {
                setPassword(event.target.value)
                clearError()
              }}
            />
          </label>

          {message && (
            <p className="auth-error" role="alert">
              {message}
            </p>
          )}

          <button type="submit" className="btn-primary auth-submit" disabled={busy}>
            {busy
              ? isSignup
                ? 'Creating account…'
                : 'Signing in…'
              : isSignup
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>

        <p className="auth-help">
          {isSignup
            ? 'Passwords are hashed before they are stored. At least 8 characters.'
            : 'Each account has its own private tasks and history.'}
        </p>
      </section>

      <p className="auth-footnote">Sessions last 30 days on this device.</p>
    </main>
  )
}

export function AuthLoading() {
  return (
    <main className="auth-shell">
      <section className="auth-card auth-loading" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <p>Loading your tasks…</p>
      </section>
    </main>
  )
}

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { TeamDetail } from '../lib/api'
import { PlusIcon, ShieldIcon, TrashIcon, XIcon } from './icons'

interface ModalShellProps {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}

function ModalShell({ title, description, onClose, children }: ModalShellProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-head">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p className="modal-sub">{description}</p>}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

interface CreateTeamDialogProps {
  busy: boolean
  error: string | null
  userEmail: string
  onClose: () => void
  onSubmit: (name: string, emails: string[]) => void
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function CreateTeamDialog({
  busy,
  error,
  userEmail,
  onClose,
  onSubmit,
}: CreateTeamDialogProps) {
  const [name, setName] = useState('')
  const [emails, setEmails] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const trimmedName = name.trim()
    if (!trimmedName) {
      setLocalError('Give the team a name.')
      return
    }

    const list = emails
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
      .filter((email) => email !== userEmail.trim().toLowerCase())

    const invalid = list.find((email) => !EMAIL_PATTERN.test(email))
    if (invalid) {
      setLocalError(`“${invalid}” is not a valid email address.`)
      return
    }

    setLocalError(null)
    onSubmit(trimmedName, [...new Set(list)])
  }

  return (
    <ModalShell
      title="Create a team"
      description="You are the host. Invite people by email; existing accounts join immediately."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        <label className="auth-field">
          <span>Team name</span>
          <input
            type="text"
            autoFocus
            maxLength={80}
            placeholder="e.g. Home projects, Design team"
            value={name}
            disabled={busy}
            onChange={(event) => {
              setName(event.target.value)
              setLocalError(null)
            }}
          />
        </label>

        <label className="auth-field">
          <span>Invite by email</span>
          <textarea
            className="modal-textarea"
            rows={4}
            placeholder={'teammate@example.com\nanother@example.com'}
            value={emails}
            disabled={busy}
            onChange={(event) => {
              setEmails(event.target.value)
              setLocalError(null)
            }}
          />
        </label>

        <p className="modal-help">
          Separate emails with commas or new lines. People without an account
          join automatically after they sign up with that email.
        </p>

        {(localError ?? error) && (
          <p className="auth-error" role="alert">
            {localError ?? error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="link-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Creating team…' : 'Create team'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

interface ManageTeamDialogProps {
  team: TeamDetail
  currentUserId: string
  busy: boolean
  error: string | null
  onClose: () => void
  onAddMember: (email: string) => Promise<boolean>
  onRemoveMember: (userId: string) => Promise<boolean>
  onRemoveInvite: (email: string) => Promise<boolean>
  onRename: (name: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
}

export function ManageTeamDialog({
  team,
  currentUserId,
  busy,
  error,
  onClose,
  onAddMember,
  onRemoveMember,
  onRemoveInvite,
  onRename,
  onDelete,
}: ManageTeamDialogProps) {
  const isOwner = team.role === 'owner'
  const [emailDraft, setEmailDraft] = useState('')
  const [nameDraft, setNameDraft] = useState(team.name)
  const [localError, setLocalError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'delete' | 'leave' | null>(null)

  useEffect(() => {
    setNameDraft(team.name)
  }, [team.name])

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const email = emailDraft.trim().toLowerCase()
    if (!email) {
      setLocalError('Enter an email address.')
      return
    }
    if (!EMAIL_PATTERN.test(email)) {
      setLocalError('Enter a valid email address.')
      return
    }
    setLocalError(null)
    if (await onAddMember(email)) setEmailDraft('')
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const name = nameDraft.trim()
    if (!name) {
      setLocalError('Give the team a name.')
      return
    }
    setLocalError(null)
    await onRename(name)
  }

  return (
    <ModalShell
      title={isOwner ? 'Manage team' : team.name}
      description={`${team.members.length} member${
        team.members.length === 1 ? '' : 's'
      } · host ${team.ownerEmail}`}
      onClose={onClose}
    >
      <div className="modal-body">
        {isOwner && (
          <form className="modal-form" onSubmit={handleRename}>
            <label className="auth-field">
              <span>Team name</span>
              <div className="inline-form modal-inline">
                <input
                  type="text"
                  maxLength={80}
                  value={nameDraft}
                  disabled={busy}
                  onChange={(event) => {
                    setNameDraft(event.target.value)
                    setLocalError(null)
                  }}
                />
                <button
                  type="submit"
                  className="btn-small"
                  disabled={busy || nameDraft.trim() === team.name}
                >
                  Save
                </button>
              </div>
            </label>
          </form>
        )}

        <section>
          <h3 className="modal-section-title">Members</h3>
          <ul className="member-list">
            {team.members.map((member) => (
              <li key={member.id} className="member-row">
                <span className="member-avatar" aria-hidden="true">
                  {member.email.trim().charAt(0).toUpperCase() || '?'}
                </span>
                <div className="member-row-body">
                  <span className="member-row-email">
                    {member.email}
                    {member.id === currentUserId && (
                      <span className="you-badge">you</span>
                    )}
                  </span>
                  {member.role === 'owner' && (
                    <span className="owner-badge">
                      <ShieldIcon />
                      Host
                    </span>
                  )}
                </div>
                {member.role !== 'owner' &&
                  (isOwner || member.id === currentUserId) && (
                    <button
                      type="button"
                      className="mini-btn member-remove"
                      disabled={busy}
                      onClick={() => void onRemoveMember(member.id)}
                      aria-label={
                        member.id === currentUserId
                          ? 'Leave team'
                          : `Remove ${member.email}`
                      }
                      title={member.id === currentUserId ? 'Leave team' : 'Remove'}
                    >
                      <XIcon />
                    </button>
                  )}
              </li>
            ))}
          </ul>
        </section>

        {isOwner && (
          <>
            <form className="modal-form" onSubmit={handleAdd}>
              <label className="auth-field">
                <span>Add someone by email</span>
                <div className="inline-form modal-inline">
                  <input
                    type="email"
                    placeholder="teammate@example.com"
                    value={emailDraft}
                    disabled={busy}
                    onChange={(event) => {
                      setEmailDraft(event.target.value)
                      setLocalError(null)
                    }}
                  />
                  <button type="submit" className="btn-small" disabled={busy}>
                    <PlusIcon /> Add
                  </button>
                </div>
              </label>
            </form>

            {team.pendingInvites.length > 0 && (
              <section>
                <h3 className="modal-section-title">Pending invites</h3>
                <p className="modal-help">
                  These emails do not have an account yet. They join
                  automatically when they sign up.
                </p>
                <ul className="member-list">
                  {team.pendingInvites.map((invite) => (
                    <li key={invite.email} className="member-row">
                      <span className="member-avatar is-pending" aria-hidden="true">
                        ?
                      </span>
                      <div className="member-row-body">
                        <span className="member-row-email">{invite.email}</span>
                        <span className="pending-badge">Waiting to sign up</span>
                      </div>
                      <button
                        type="button"
                        className="mini-btn member-remove"
                        disabled={busy}
                        onClick={() => void onRemoveInvite(invite.email)}
                        aria-label={`Cancel invite for ${invite.email}`}
                        title="Cancel invite"
                      >
                        <XIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="modal-danger">
              <h3 className="modal-section-title">Delete team</h3>
              <p className="modal-help">
                This removes the team and all of its shared team tasks for
                everyone. Personal tasks are not affected.
              </p>
              {confirm === 'delete' ? (
                <div className="modal-actions">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setConfirm(null)}
                    disabled={busy}
                  >
                    Keep team
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={busy}
                    onClick={() => void onDelete()}
                  >
                    <TrashIcon />
                    {busy ? 'Deleting…' : 'Yes, delete team'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => setConfirm('delete')}
                >
                  <TrashIcon />
                  Delete team
                </button>
              )}
            </section>
          </>
        )}

        {!isOwner && (
          <section className="modal-danger">
            <h3 className="modal-section-title">Leave team</h3>
            <p className="modal-help">
              You will lose access to this team&apos;s shared tasks. Your personal
              tasks stay in My Tasks.
            </p>
            {confirm === 'leave' ? (
              <div className="modal-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setConfirm(null)}
                  disabled={busy}
                >
                  Stay
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy}
                  onClick={() => void onRemoveMember(currentUserId)}
                >
                  {busy ? 'Leaving…' : 'Yes, leave team'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-danger"
                onClick={() => setConfirm('leave')}
              >
                Leave team
              </button>
            )}
          </section>
        )}

        {(localError ?? error) && (
          <p className="auth-error" role="alert">
            {localError ?? error}
          </p>
        )}
      </div>
    </ModalShell>
  )
}

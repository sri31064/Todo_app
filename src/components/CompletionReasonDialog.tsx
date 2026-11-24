import { useEffect, useState, type FormEvent } from 'react'
import { describeCompletionTiming, MAX_COMPLETION_REASON_LENGTH } from '../lib/tasks'
import type { Task } from '../types'
import { XIcon } from './icons'

interface CompletionReasonDialogProps {
  task: Task
  /** reason is null when the user chooses to complete without a note. */
  onSubmit: (reason: string | null) => void
  onCancel: () => void
}

/** Asked when a task is marked done, so late or early completions can be explained. */
export function CompletionReasonDialog({
  task,
  onSubmit,
  onCancel,
}: CompletionReasonDialogProps) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [onCancel])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit(reason.trim() || null)
  }

  const timing = describeCompletionTiming(task.due, Date.now())

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="completion-reason-title"
        aria-describedby="completion-reason-hint"
      >
        <div className="modal-head">
          <div>
            <h2 id="completion-reason-title">Reason for delay or early completion</h2>
            <p className="modal-sub">{task.title}</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onCancel}
            aria-label="Cancel completion"
          >
            <XIcon />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <p id="completion-reason-hint" className="modal-help">
            {timing ?? 'No deadline was set. Add a note if you like.'} This is optional
            and will be saved with the task.
          </p>
          <label className="auth-field">
            <span>Reason</span>
            <textarea
              className="modal-textarea"
              autoFocus
              maxLength={MAX_COMPLETION_REASON_LENGTH}
              placeholder="e.g. Waiting on approval from the client"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="link-btn" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-small"
              onClick={() => onSubmit(null)}
            >
              Complete without reason
            </button>
            <button type="submit" className="btn-primary">
              Save and complete
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

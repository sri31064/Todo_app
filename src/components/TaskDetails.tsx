import { useState, type FormEvent } from 'react'
import { describeDue, formatDueDate, formatTimestamp } from '../lib/date'
import {
  capitalizePriority,
  getSubtaskProgress,
  isOverdue,
  MAX_COMMENT_LENGTH,
  MAX_SUBTASK_LENGTH,
} from '../lib/tasks'
import type { Task } from '../types'
import { XIcon } from './icons'
import { ProgressBar } from './ProgressBar'

interface TaskDetailsProps {
  id: string
  hidden: boolean
  task: Task
  readOnly?: boolean
  onAddSubtask: (taskId: string, title: string) => void
  onToggleSubtask: (taskId: string, subtaskId: string, done: boolean) => void
  onDeleteSubtask: (taskId: string, subtaskId: string) => void
  onAddComment: (taskId: string, text: string) => void
  onDeleteComment: (taskId: string, commentId: string) => void
}

export function TaskDetails({
  id,
  hidden,
  task,
  readOnly = false,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onAddComment,
  onDeleteComment,
}: TaskDetailsProps) {
  const [partDraft, setPartDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const progress = getSubtaskProgress(task.subtasks)

  function submitPart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = partDraft.trim()
    if (!value) return
    onAddSubtask(task.id, value)
    setPartDraft('')
  }

  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = noteDraft.trim()
    if (!value) return
    onAddComment(task.id, value)
    setNoteDraft('')
  }

  return (
    <div id={id} className="task-details" hidden={hidden}>
      <div className="details-facts" aria-label="Task details">
        <div className="details-fact">
          <span className="details-label">Deadline</span>
          <span className="details-value">
            {task.due
              ? `${formatDueDate(task.due)} · ${describeDue(task.due)?.label ?? ''}`
              : 'No deadline'}
          </span>
        </div>
        <div className="details-fact">
          <span className="details-label">Priority</span>
          <span className="details-value">{capitalizePriority(task.priority)}</span>
        </div>
        <div className="details-fact">
          <span className="details-label">Added</span>
          <span className="details-value">{formatTimestamp(task.createdAt)}</span>
        </div>
        <div className={task.done ? 'details-fact is-complete' : 'details-fact'}>
          <span className="details-label">Status</span>
          <span className="details-value">
            {task.done
              ? task.completedAt
                ? `Completed ${formatTimestamp(task.completedAt)}`
                : 'Completed'
              : isOverdue(task)
                ? 'Overdue'
                : 'Pending'}
          </span>
        </div>
        {task.completionReason && (
          <div className="details-fact details-fact-reason">
            <span className="details-label">Reason for delay or early completion</span>
            <span className="details-value">{task.completionReason}</span>
          </div>
        )}
      </div>

      <section aria-labelledby={`${id}-parts-title`}>
        <div className="details-head">
          <h3 className="details-title" id={`${id}-parts-title`}>
            Parts
          </h3>
          <span className="details-meta">
            {progress.total === 0
              ? 'No parts yet'
              : `${progress.done} of ${progress.total} done · ${progress.percent}%`}
          </span>
        </div>

        {progress.total > 0 && <ProgressBar subtasks={task.subtasks} />}

        {task.subtasks.length > 0 ? (
          <ul className="subtask-list">
            {task.subtasks.map((subtask) => (
              <li key={subtask.id} className={subtask.done ? 'subtask is-done' : 'subtask'}>
                <input
                  type="checkbox"
                  className="subtask-check"
                  checked={subtask.done}
                  disabled={readOnly}
                  onChange={(event) => onToggleSubtask(task.id, subtask.id, event.target.checked)}
                  aria-label={`${subtask.done ? 'Mark part as not done' : 'Mark part as done'}: ${subtask.title}`}
                />
                <span className="subtask-title">{subtask.title}</span>
                {!readOnly && (
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => onDeleteSubtask(task.id, subtask.id)}
                    aria-label={`Remove part: ${subtask.title}`}
                    title="Remove part"
                  >
                    <XIcon />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="details-empty">Break this task into smaller steps.</p>
        )}

        {!readOnly && (
          <form className="inline-form" onSubmit={submitPart}>
            <input
              type="text"
              placeholder="Add a part…"
              aria-label="New part"
              maxLength={MAX_SUBTASK_LENGTH}
              value={partDraft}
              onChange={(event) => setPartDraft(event.target.value)}
            />
            <button className="btn-small" type="submit">
              Add
            </button>
          </form>
        )}
      </section>

      <section aria-labelledby={`${id}-notes-title`}>
        <div className="details-head">
          <h3 className="details-title" id={`${id}-notes-title`}>
            Progress notes
          </h3>
          <span className="details-meta">
            {task.comments.length === 0
              ? 'No notes yet'
              : `${task.comments.length} note${task.comments.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {task.comments.length > 0 ? (
          <ul className="note-list">
            {task.comments.map((comment) => (
              <li key={comment.id} className="note">
                <div className="note-body">
                  <p className="note-text">{comment.text}</p>
                  <p className="note-time">{formatTimestamp(comment.createdAt)}</p>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    className="mini-btn note-del"
                    onClick={() => onDeleteComment(task.id, comment.id)}
                    aria-label="Delete note"
                    title="Delete note"
                  >
                    <XIcon />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="details-empty">Log what you’ve completed as you go.</p>
        )}

        {!readOnly && (
          <form className="inline-form" onSubmit={submitNote}>
            <input
              type="text"
              placeholder="What did you get done?"
              aria-label="New progress note"
              maxLength={MAX_COMMENT_LENGTH}
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
            />
            <button className="btn-small" type="submit">
              Post
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

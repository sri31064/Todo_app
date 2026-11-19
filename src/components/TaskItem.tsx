import { useEffect, useId, useRef, useState } from 'react'
import { describeDue, formatTimestamp } from '../lib/date'
import { capitalizePriority, categoryLabel, getSubtaskProgress, subcategoryLabel } from '../lib/tasks'
import type { Task } from '../types'
import { ChevronDownIcon, PencilIcon, TrashIcon } from './icons'
import { ProgressBar } from './ProgressBar'
import { TaskDetails } from './TaskDetails'

interface TaskItemProps {
  task: Task
  currentUserId?: string
  readOnly?: boolean
  showAuthor?: boolean
  onToggle: (id: string, done: boolean) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onAddSubtask: (taskId: string, title: string) => void
  onToggleSubtask: (taskId: string, subtaskId: string, done: boolean) => void
  onDeleteSubtask: (taskId: string, subtaskId: string) => void
  onAddComment: (taskId: string, text: string) => void
  onDeleteComment: (taskId: string, commentId: string) => void
}

export function TaskItem({
  task,
  currentUserId,
  readOnly = false,
  showAuthor = false,
  onToggle,
  onRename,
  onDelete,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onAddComment,
  onDeleteComment,
}: TaskItemProps) {
  const [editing, setEditing] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [draft, setDraft] = useState(task.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const finishedRef = useRef(false)
  const panelId = useId()
  const progress = getSubtaskProgress(task.subtasks)

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  function startEditing() {
    setDraft(task.title)
    finishedRef.current = false
    setEditing(true)
  }

  function commit() {
    if (finishedRef.current) return
    finishedRef.current = true

    const value = draft.trim()
    if (value && value !== task.title) onRename(task.id, value)
    setEditing(false)
  }

  function cancel() {
    if (finishedRef.current) return
    finishedRef.current = true
    setDraft(task.title)
    setEditing(false)
  }

  const due = describeDue(task.due)
  const toggleDetails = () => setDetailsOpen((open) => !open)

  return (
    <li className="task-group">
      <div className={task.done ? 'task is-done' : 'task'}>
        <input
          type="checkbox"
          className="task-check"
          checked={task.done}
          disabled={readOnly}
          onChange={(event) => onToggle(task.id, event.target.checked)}
          aria-label={`${task.done ? 'Mark as not done' : 'Mark as done'}: ${task.title}`}
        />

        <div className="task-body">
          {editing && !readOnly ? (
            <input
              ref={inputRef}
              className="edit-input"
              type="text"
              aria-label="Edit task title"
              maxLength={200}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commit()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  cancel()
                }
              }}
            />
          ) : (
            <div
              className="task-title"
              onDoubleClick={readOnly ? undefined : startEditing}
              title={readOnly ? undefined : 'Double-click to edit'}
            >
              {task.title}
            </div>
          )}

          <div className="task-meta">
            {due && (
              <span
                className={`chip due${
                  due.tone === 'soon' ? ' due--soon' : due.tone === 'overdue' ? ' due--overdue' : ''
                }`}
              >
                {due.label}
              </span>
            )}
            <span className={`chip priority priority--${task.priority}`}>
              {capitalizePriority(task.priority)}
            </span>
            <span className={`chip category category--${task.category}`}>
              {categoryLabel(task.category)}
            </span>
            <span className={`chip subcategory subcategory--${task.subcategory}`}>
              {subcategoryLabel(task.subcategory)}
            </span>
            {showAuthor && task.ownerEmail && (
              <span className="chip author-chip" title={`Added by ${task.ownerEmail}`}>
                {task.ownerId === currentUserId ? 'You' : task.ownerEmail}
              </span>
            )}
            {task.done && (
              <span className="chip completed-chip">
                Completed{task.completedAt ? ` ${formatTimestamp(task.completedAt)}` : ''}
              </span>
            )}
            {task.comments.length > 0 && (
              <button
                type="button"
                className="chip note-chip"
                onClick={toggleDetails}
                aria-expanded={detailsOpen}
                aria-controls={panelId}
              >
                {task.comments.length} note{task.comments.length === 1 ? '' : 's'}
              </button>
            )}
            {progress.total === 0 && !readOnly && (
              <button
                type="button"
                className="chip add-parts-chip"
                onClick={toggleDetails}
                aria-expanded={detailsOpen}
                aria-controls={panelId}
              >
                + Break into parts
              </button>
            )}
          </div>

          {progress.total > 0 && (
            <div className="task-progress">
              <ProgressBar subtasks={task.subtasks} />
              <button
                type="button"
                className={
                  progress.done === progress.total
                    ? 'progress-label is-complete'
                    : 'progress-label'
                }
                onClick={toggleDetails}
                aria-expanded={detailsOpen}
                aria-controls={panelId}
              >
                {progress.done}/{progress.total} parts · {progress.percent}%
              </button>
            </div>
          )}
        </div>

        <div className="task-actions">
          <button
            type="button"
            className={detailsOpen ? 'icon-btn task-action is-open' : 'icon-btn task-action'}
            onClick={toggleDetails}
            aria-label={detailsOpen ? 'Hide parts and notes' : 'Show parts and notes'}
            aria-expanded={detailsOpen}
            aria-controls={panelId}
            title="Parts & notes"
          >
            <ChevronDownIcon />
          </button>
          {!readOnly && (
            <>
              <button
                type="button"
                className="icon-btn task-action"
                onClick={startEditing}
                aria-label="Edit task"
                title="Edit task"
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                className="icon-btn task-action task-action--delete"
                onClick={() => onDelete(task.id)}
                aria-label="Delete task"
                title="Delete task"
              >
                <TrashIcon />
              </button>
            </>
          )}
        </div>
      </div>

      <TaskDetails
        id={panelId}
        hidden={!detailsOpen}
        task={task}
        readOnly={readOnly}
        onAddSubtask={onAddSubtask}
        onToggleSubtask={onToggleSubtask}
        onDeleteSubtask={onDeleteSubtask}
        onAddComment={onAddComment}
        onDeleteComment={onDeleteComment}
      />
    </li>
  )
}

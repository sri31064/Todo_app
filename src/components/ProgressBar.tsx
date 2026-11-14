import { getSubtaskProgress } from '../lib/tasks'
import type { Subtask } from '../types'

interface ProgressBarProps {
  subtasks: Subtask[]
  className?: string
}

export function ProgressBar({ subtasks, className }: ProgressBarProps) {
  const progress = getSubtaskProgress(subtasks)

  return (
    <div
      className={
        progress.done === progress.total
          ? `progress-segments is-complete${className ? ` ${className}` : ''}`
          : `progress-segments${className ? ` ${className}` : ''}`
      }
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.done}
      aria-label={`${progress.done} of ${progress.total} parts complete`}
    >
      {subtasks.map((subtask) => (
        <span
          key={subtask.id}
          className={subtask.done ? 'progress-segment is-done' : 'progress-segment'}
        />
      ))}
    </div>
  )
}

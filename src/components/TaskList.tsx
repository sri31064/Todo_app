import type { Task } from '../types'
import { TaskItem } from './TaskItem'

interface TaskListProps {
  tasks: Task[]
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

export function TaskList({
  tasks,
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
}: TaskListProps) {
  return (
    <ul id="task-list" className="task-list" aria-label="Tasks">
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          currentUserId={currentUserId}
          readOnly={readOnly}
          showAuthor={showAuthor}
          onToggle={onToggle}
          onRename={onRename}
          onDelete={onDelete}
          onAddSubtask={onAddSubtask}
          onToggleSubtask={onToggleSubtask}
          onDeleteSubtask={onDeleteSubtask}
          onAddComment={onAddComment}
          onDeleteComment={onDeleteComment}
        />
      ))}
    </ul>
  )
}

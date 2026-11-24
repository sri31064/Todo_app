import type {
  Category,
  Filter,
  NewTask,
  Priority,
  Subcategory,
  Subtask,
  Task,
  TaskComment,
  TaskCounts,
} from '../types'
import { daysFromToday, isoDate, parseISODate } from './date'

export const PRIORITIES: readonly Priority[] = ['low', 'medium', 'high']
export const CATEGORIES: readonly Category[] = [
  'recreation',
  'household',
  'field',
  'manual',
]
export const CATEGORY_LABELS: Record<Category, string> = {
  recreation: 'Recreation',
  household: 'Household work',
  field: 'Field work',
  manual: 'Manual work',
}
export const DEFAULT_CATEGORY: Category = 'recreation'
export const SUBCATEGORIES: readonly Subcategory[] = [
  'level1',
  'level2',
  'level3',
  'level4',
]
export const SUBCATEGORY_LABELS: Record<Subcategory, string> = {
  level1: 'Level 1',
  level2: 'Level 2',
  level3: 'Level 3',
  level4: 'Level 4',
}
export const DEFAULT_SUBCATEGORY: Subcategory = 'level1'
export const MAX_TITLE_LENGTH = 200
export const MAX_SUBTASK_LENGTH = 120
export const MAX_COMMENT_LENGTH = 500
export const MAX_COMPLETION_REASON_LENGTH = 500

export function parseCategory(value: unknown): Category {
  return CATEGORIES.includes(value as Category)
    ? (value as Category)
    : DEFAULT_CATEGORY
}

export function categoryLabel(category: Category): string {
  return CATEGORY_LABELS[category]
}

export function parseSubcategory(value: unknown): Subcategory {
  return SUBCATEGORIES.includes(value as Subcategory)
    ? (value as Subcategory)
    : DEFAULT_SUBCATEGORY
}

export function subcategoryLabel(subcategory: Subcategory): string {
  return SUBCATEGORY_LABELS[subcategory]
}

export interface SubtaskProgress {
  done: number
  total: number
  percent: number
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`
}

export function createTask(input: NewTask): Task {
  return {
    id: createId(),
    title: input.title.trim().slice(0, MAX_TITLE_LENGTH),
    done: false,
    due: input.due,
    priority: input.priority,
    category: input.category,
    subcategory: input.subcategory,
    createdAt: Date.now(),
    completedAt: null,
    completionReason: null,
    subtasks: [],
    comments: [],
  }
}

export function createSubtask(title: string): Subtask {
  return {
    id: createId(),
    title: title.trim().slice(0, MAX_SUBTASK_LENGTH),
    done: false,
  }
}

export function createComment(text: string): TaskComment {
  return {
    id: createId(),
    text: text.trim().slice(0, MAX_COMMENT_LENGTH),
    createdAt: Date.now(),
  }
}

export function isOverdue(task: Task): boolean {
  return !task.done && task.due !== null && daysFromToday(task.due) < 0
}

/** Human-readable timing of a completion relative to the task's deadline. */
export function describeCompletionTiming(
  due: string | null,
  completedAt: number | null,
): string | null {
  if (!due || !completedAt) return null

  const completionDay = isoDate(new Date(completedAt))
  const diff = Math.round(
    (parseISODate(due).getTime() - parseISODate(completionDay).getTime()) / 86_400_000,
  )

  if (diff > 0) {
    return diff === 1
      ? 'Completed 1 day before the deadline.'
      : `Completed ${diff} days before the deadline.`
  }
  if (diff < 0) {
    const late = Math.abs(diff)
    return late === 1
      ? 'Completed 1 day after the deadline.'
      : `Completed ${late} days after the deadline.`
  }
  return 'Completed on the deadline.'
}

export function getCounts(tasks: Task[]): TaskCounts {
  let done = 0
  let overdue = 0

  for (const task of tasks) {
    if (task.done) {
      done += 1
    } else if (isOverdue(task)) {
      overdue += 1
    }
  }

  return { all: tasks.length, pending: tasks.length - done, overdue, done }
}

export function getSubtaskProgress(subtasks: Subtask[]): SubtaskProgress {
  const total = subtasks.length
  let done = 0
  for (const subtask of subtasks) {
    if (subtask.done) done += 1
  }
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}

export function sortTasks(tasks: Task[]): Task[] {
  return tasks.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1

    if (!a.done) {
      const aDue = a.due ?? '9999-12-31'
      const bDue = b.due ?? '9999-12-31'
      if (aDue !== bDue) return aDue < bDue ? -1 : 1

      const byPriority = PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority)
      if (byPriority !== 0) return byPriority
    }

    return a.createdAt - b.createdAt || a.id.localeCompare(b.id)
  })
}

export function getVisibleTasks(tasks: Task[], filter: Filter, query: string): Task[] {
  const needle = query.trim().toLowerCase()

  return sortTasks(
    tasks.filter((task) => {
      if (filter === 'pending' && task.done) return false
      if (filter === 'overdue' && !isOverdue(task)) return false
      if (filter === 'done' && !task.done) return false
      if (needle && !task.title.toLowerCase().includes(needle)) return false
      return true
    }),
  )
}

export function capitalizePriority(priority: Priority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

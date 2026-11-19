import type { Priority, Subtask, Task, TaskComment } from '../types'
import { isISODate } from './date'
import {
  createId,
  MAX_COMMENT_LENGTH,
  MAX_SUBTASK_LENGTH,
  MAX_TITLE_LENGTH,
  parseCategory,
  parseSubcategory,
  PRIORITIES,
} from './tasks'

export const LEGACY_STORAGE_KEY = 'todo-app-v1'

export interface LegacyScan {
  origin: string
  keys: string[]
  tasks: Task[]
}

function parsePriority(value: unknown): Priority {
  return PRIORITIES.includes(value as Priority) ? (value as Priority) : 'medium'
}

function toSubtask(value: unknown): Subtask | null {
  if (!value || typeof value !== 'object') return null

  const item = value as Record<string, unknown>
  if (typeof item.title !== 'string') return null

  const title = item.title.trim().slice(0, MAX_SUBTASK_LENGTH)
  if (!title) return null

  return {
    id: typeof item.id === 'string' && item.id ? item.id : createId(),
    title,
    done: Boolean(item.done),
  }
}

function toComment(value: unknown): TaskComment | null {
  if (!value || typeof value !== 'object') return null

  const item = value as Record<string, unknown>
  if (typeof item.text !== 'string') return null

  const text = item.text.trim().slice(0, MAX_COMMENT_LENGTH)
  if (!text) return null

  return {
    id: typeof item.id === 'string' && item.id ? item.id : createId(),
    text,
    createdAt:
      typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
        ? item.createdAt
        : Date.now(),
  }
}

function toTask(value: unknown): Task | null {
  if (!value || typeof value !== 'object') return null

  const item = value as Record<string, unknown>
  if (typeof item.title !== 'string') return null

  const title = item.title.trim().slice(0, MAX_TITLE_LENGTH)
  if (!title) return null

  return {
    id: typeof item.id === 'string' && item.id ? item.id : createId(),
    title,
    done: Boolean(item.done),
    due: isISODate(item.due) ? item.due : null,
    priority: parsePriority(item.priority),
    category: parseCategory(item.category),
    subcategory: parseSubcategory(item.subcategory),
    createdAt:
      typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
        ? item.createdAt
        : Date.now(),
    completedAt:
      typeof item.completedAt === 'number' && Number.isFinite(item.completedAt)
        ? item.completedAt
        : null,
    subtasks: Array.isArray(item.subtasks)
      ? item.subtasks.map(toSubtask).filter((subtask): subtask is Subtask => subtask !== null)
      : [],
    comments: Array.isArray(item.comments)
      ? item.comments.map(toComment).filter((comment): comment is TaskComment => comment !== null)
      : [],
  }
}

function parseTaskArray(data: unknown): Task[] {
  if (!Array.isArray(data)) return []

  return data.map(toTask).filter((task): task is Task => task !== null)
}

function extractTaskArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data

  if (data && typeof data === 'object' && Array.isArray((data as { tasks?: unknown }).tasks)) {
    return (data as { tasks: unknown[] }).tasks
  }

  return null
}

function looksLikeTask(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false

  const item = value as Record<string, unknown>
  if (typeof item.title !== 'string') return false

  return (
    'done' in item ||
    'due' in item ||
    'priority' in item ||
    'createdAt' in item ||
    'completedAt' in item ||
    'subtasks' in item ||
    'comments' in item
  )
}

export function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return []
    return parseTaskArray(JSON.parse(raw))
  } catch (error) {
    console.warn('Could not load tasks:', error)
    return []
  }
}

/**
 * Scan every localStorage entry for a saved task list. Earlier versions of the
 * app used `todo-app-v1`, but this also catches renamed keys or payloads such
 * as `{ tasks: [...] }` so old data is not stranded after an upgrade.
 */
export function scanLegacyTasks(): LegacyScan {
  const keys: string[] = []
  const tasks = new Map<string, Task>()
  const origin = typeof location === 'undefined' ? '' : location.origin

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key) continue

      const raw = localStorage.getItem(key)
      if (!raw) continue

      let data: unknown
      try {
        data = JSON.parse(raw)
      } catch {
        continue
      }

      const candidates = extractTaskArray(data)
      if (!candidates || !candidates.some(looksLikeTask)) continue

      const parsed = parseTaskArray(candidates)
      if (parsed.length === 0) continue

      keys.push(key)
      for (const task of parsed) {
        const existing = tasks.get(task.id)
        if (!existing) {
          tasks.set(task.id, task)
        } else if (
          existing.subtasks.length + existing.comments.length <
          task.subtasks.length + task.comments.length
        ) {
          // Keep the richer copy when the same task appears under two keys.
          tasks.set(task.id, task)
        }
      }
    }
  } catch (error) {
    console.warn('Could not scan local tasks:', error)
  }

  return {
    origin,
    keys,
    tasks: [...tasks.values()].sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    ),
  }
}

function taskSignature(task: Task): string {
  return `${task.title}\u0000${task.createdAt}\u0000${task.due ?? ''}`
}

/** Merge old browser tasks into an account without duplicating existing ones. */
export function mergeTasks(
  existing: Task[],
  incoming: Task[],
): { tasks: Task[]; added: number } {
  const ids = new Set(existing.map((task) => task.id))
  const signatures = new Set(existing.map(taskSignature))
  const merged = existing.slice()
  let added = 0

  for (const task of incoming) {
    const signature = taskSignature(task)
    if (ids.has(task.id) || signatures.has(signature)) continue

    ids.add(task.id)
    signatures.add(signature)
    merged.push(task)
    added += 1
  }

  return { tasks: merged, added }
}

export function clearLegacyTasks(keys: string[]): void {
  try {
    const all = new Set([LEGACY_STORAGE_KEY, ...keys])
    for (const key of all) localStorage.removeItem(key)
  } catch (error) {
    console.warn('Could not clear local tasks:', error)
  }
}

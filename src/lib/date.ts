const DAY_IN_MS = 86_400_000

export interface DueInfo {
  label: string
  tone: 'default' | 'soon' | 'overdue'
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

export function isoToday(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function daysFromToday(due: string): number {
  const today = parseISODate(isoToday())
  const target = parseISODate(due)
  return Math.round((target.getTime() - today.getTime()) / DAY_IN_MS)
}

export function formatToday(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function isISODate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function describeDue(due: string | null): DueInfo | null {
  if (!due) return null

  const diff = daysFromToday(due)
  const date = parseISODate(due)
  const showYear = date.getFullYear() !== new Date().getFullYear()

  if (diff === 0) return { label: 'Due today', tone: 'soon' }
  if (diff === 1) return { label: 'Due tomorrow', tone: 'soon' }

  if (diff < 0) {
    const overdueDays = Math.abs(diff)
    if (overdueDays <= 7) {
      return {
        label: overdueDays === 1 ? 'Overdue by 1 day' : `Overdue by ${overdueDays} days`,
        tone: 'overdue',
      }
    }

    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
    if (showYear) options.year = 'numeric'
    return { label: `Overdue · ${date.toLocaleDateString(undefined, options)}`, tone: 'overdue' }
  }

  if (diff <= 7) {
    return { label: `Due in ${diff} days`, tone: 'default' }
  }

  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }
  if (showYear) options.year = 'numeric'
  return { label: `Due ${date.toLocaleDateString(undefined, options)}`, tone: 'default' }
}

export function formatDueDate(due: string): string {
  const date = parseISODate(due)
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric'
  return date.toLocaleDateString(undefined, options)
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  if (date.toDateString() === now.toDateString()) return `Today · ${time}`

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday · ${time}`

  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric'
  return `${date.toLocaleDateString(undefined, options)} · ${time}`
}

import { useEffect, useRef } from 'react'
import type { Filter, TaskCounts } from '../types'

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'done', label: 'Completed' },
]

interface ToolbarProps {
  filter: Filter
  counts: TaskCounts
  query: string
  onFilterChange: (filter: Filter) => void
  onQueryChange: (query: string) => void
}

export function Toolbar({ filter, counts, query, onFilterChange, onQueryChange }: ToolbarProps) {
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return

      const target = event.target
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      if (typing) return

      event.preventDefault()
      searchRef.current?.focus()
    }

    document.addEventListener('keydown', focusSearch)
    return () => document.removeEventListener('keydown', focusSearch)
  }, [])

  return (
    <section className="toolbar" aria-label="Task controls">
      <div className="filters" role="group" aria-label="Filter tasks">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={filter === key ? 'filter is-active' : 'filter'}
            aria-pressed={filter === key}
            onClick={() => onFilterChange(key)}
          >
            {label} <span className="count">{counts[key]}</span>
          </button>
        ))}
      </div>
      <input
        ref={searchRef}
        id="search"
        type="search"
        placeholder="Search tasks"
        aria-label="Search tasks"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && query) {
            event.preventDefault()
            onQueryChange('')
          }
        }}
      />
    </section>
  )
}

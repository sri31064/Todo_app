import { useRef, useState, type FormEvent } from 'react'
import type { NewTask, Priority } from '../types'

interface AddTaskFormProps {
  onAdd: (task: NewTask) => void
}

export function AddTaskForm({ onAdd }: AddTaskFormProps) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const titleRef = useRef<HTMLInputElement>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = title.trim()
    if (!trimmed) {
      titleRef.current?.focus()
      return
    }

    onAdd({ title: trimmed, due: due || null, priority })
    setTitle('')
    setDue('')
    setPriority('medium')
    titleRef.current?.focus()
  }

  return (
    <form
      id="add-form"
      className="add-bar"
      onSubmit={handleSubmit}
      autoComplete="off"
      aria-label="Add a task"
    >
      <div className="add-row">
        <input
          ref={titleRef}
          id="new-title"
          className="new-title"
          type="text"
          placeholder="What needs doing?"
          aria-label="Task title"
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button className="btn-primary" type="submit">
          Add
        </button>
      </div>
      <div className="add-options">
        <label className="opt">
          <span>Deadline</span>
          <input
            id="new-due"
            type="date"
            aria-label="Deadline"
            value={due}
            onChange={(event) => setDue(event.target.value)}
          />
        </label>
        <label className="opt">
          <span>Priority</span>
          <select
            id="new-priority"
            aria-label="Priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>
    </form>
  )
}

export type Priority = 'low' | 'medium' | 'high'
export type Category = 'recreation' | 'household' | 'field' | 'manual'
export type Subcategory = 'level1' | 'level2' | 'level3' | 'level4'
export type Filter = 'all' | 'pending' | 'overdue' | 'done'

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface TaskComment {
  id: string
  text: string
  createdAt: number
}

export interface Task {
  id: string
  title: string
  done: boolean
  due: string | null
  priority: Priority
  category: Category
  subcategory: Subcategory
  createdAt: number
  completedAt: number | null
  subtasks: Subtask[]
  comments: TaskComment[]
  teamId?: string | null
  ownerId?: string
  ownerEmail?: string
}

export type View = { kind: 'personal' } | { kind: 'team'; teamId: string }
export type TeamTab = 'team' | 'people'

export interface NewTask {
  title: string
  due: string | null
  priority: Priority
  category: Category
  subcategory: Subcategory
}

export type TaskCounts = Record<Filter, number>

import { CheckCircleIcon } from './icons'

export type EmptyReason = 'none' | 'search' | 'pending' | 'overdue' | 'done' | 'filtered'

interface EmptyStateProps {
  reason: EmptyReason
  query?: string
}

function getCopy(reason: EmptyReason, query?: string): { title: string; body: string } {
  switch (reason) {
    case 'search':
      return {
        title: 'No matches',
        body: `Nothing matches “${query?.trim() ?? ''}”. Try a different search or filter.`,
      }
    case 'pending':
      return { title: 'All done!', body: 'Nothing pending. Take a breather.' }
    case 'overdue':
      return {
        title: 'Nothing overdue',
        body: 'You’re on top of every deadline. Nice work.',
      }
    case 'done':
      return {
        title: 'Nothing completed yet',
        body: 'Tasks you check off will land here.',
      }
    case 'filtered':
      return { title: 'Nothing here', body: 'Try a different filter.' }
    default:
      return {
        title: 'No tasks yet',
        body: 'Add your first task above — even small ones count.',
      }
  }
}

export function EmptyState({ reason, query }: EmptyStateProps) {
  const copy = getCopy(reason, query)

  return (
    <div className="empty">
      <CheckCircleIcon />
      <p className="empty-title">{copy.title}</p>
      <p className="empty-body">{copy.body}</p>
    </div>
  )
}

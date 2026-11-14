import type { ToastState } from '../hooks/useToast'

interface ToastProps {
  toast: ToastState | null
  onUndo: () => void
}

export function Toast({ toast, onUndo }: ToastProps) {
  return (
    <div className={toast ? 'toast show' : 'toast'} role="status" aria-live="polite">
      <span>{toast?.message ?? ''}</span>
      {toast?.action && (
        <button type="button" className="toast-btn" onClick={onUndo}>
          Undo
        </button>
      )}
    </div>
  )
}

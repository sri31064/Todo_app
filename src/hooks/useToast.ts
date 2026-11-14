import { useCallback, useEffect, useRef, useState } from 'react'

export interface ToastState {
  message: string
  action?: () => void
}

const DEFAULT_TIMEOUT = 6000

export function useToast(timeout = DEFAULT_TIMEOUT) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timerRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const hide = useCallback(() => {
    clearTimer()
    setToast(null)
  }, [clearTimer])

  const show = useCallback(
    (message: string, action?: () => void) => {
      clearTimer()
      setToast({ message, action })
      timerRef.current = window.setTimeout(() => setToast(null), timeout)
    },
    [clearTimer, timeout],
  )

  useEffect(() => clearTimer, [clearTimer])

  return { toast, show, hide }
}

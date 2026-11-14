import { useEffect, useMemo, useRef, useState } from 'react'
import { AddTaskForm } from './components/AddTaskForm'
import { AuthLoading, AuthScreen, type AuthMode } from './components/AuthScreen'
import { EmptyState, type EmptyReason } from './components/EmptyState'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { TeamView } from './components/TeamView'
import {
  CreateTeamDialog,
  ManageTeamDialog,
} from './components/TeamDialogs'
import { TaskList } from './components/TaskList'
import { Toast } from './components/Toast'
import { Toolbar } from './components/Toolbar'
import { useToast } from './hooks/useToast'
import {
  ApiError,
  api,
  type TeamDetail,
  type TeamSummary,
  type User,
} from './lib/api'
import { formatToday } from './lib/date'
import { clearLegacyTasks, mergeTasks, scanLegacyTasks } from './lib/storage'
import {
  createComment,
  createSubtask,
  createTask,
  getCounts,
  getVisibleTasks,
} from './lib/tasks'
import type { Filter, NewTask, Task, TeamTab, View } from './types'

function getEmptyReason(
  taskCount: number,
  visibleCount: number,
  filter: Filter,
  query: string,
): EmptyReason | null {
  if (visibleCount > 0) return null
  if (taskCount === 0) return 'none'
  if (query.trim()) return 'search'
  if (filter === 'pending') return 'pending'
  if (filter === 'overdue') return 'overdue'
  if (filter === 'done') return 'done'
  return 'filtered'
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Something went wrong. Please try again.'
}

interface LoadedTasks {
  tasks: Task[]
}

interface TeamLoadResult {
  teams: TeamSummary[]
  joinedTeams: number
}

const NO_TEAMS: TeamLoadResult = { teams: [], joinedTeams: 0 }

function taskWithAuthor(task: Task, teamId: string, user: User): Task {
  return {
    ...task,
    teamId,
    ownerId: user.id,
    ownerEmail: user.email,
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [legacyImport, setLegacyImport] = useState<{
    count: number
    error: string | null
  } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [view, setView] = useState<View>({ kind: 'personal' })
  const [team, setTeam] = useState<TeamDetail | null>(null)
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [teamSyncError, setTeamSyncError] = useState<string | null>(null)
  const [teamTab, setTeamTab] = useState<TeamTab>('team')

  const [dialog, setDialog] = useState<'create' | 'manage' | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const { toast, show: showToast, hide: hideToast } = useToast()

  const saveTimerRef = useRef<number | null>(null)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())
  const lastSavedRef = useRef('')
  const sessionVersionRef = useRef(0)
  const tasksRef = useRef<Task[]>([])
  const legacyCheckedRef = useRef(false)
  const pendingLegacyRef = useRef<{ keys: string[]; added: number } | null>(null)

  const teamRef = useRef<TeamDetail | null>(null)
  const teamRequestRef = useRef(0)
  const teamSaveChainsRef = useRef(new Map<string, Promise<void>>())
  const teamPendingRef = useRef(0)

  const counts = useMemo(() => getCounts(tasks), [tasks])
  const visibleTasks = useMemo(
    () => getVisibleTasks(tasks, filter, query),
    [tasks, filter, query],
  )
  const teamCounts = useMemo(
    () => getCounts(team?.teamTasks ?? []),
    [team?.teamTasks],
  )

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      try {
        const session = await api.me()
        if (cancelled) return
        if (!session.user) {
          setAuthLoading(false)
          return
        }

        const [loaded, teamList] = await Promise.all([
          loadTasksForUser(),
          api.listTeams().catch(() => NO_TEAMS),
        ])
        if (cancelled) return
        applySession(
          session.user,
          loaded,
          teamList.teams,
          session.joinedTeams + teamList.joinedTeams,
        )
      } catch (error) {
        if (!cancelled) {
          setAuthError(errorMessage(error))
          setAuthLoading(false)
        }
      }
    }

    void restoreSession()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Show the sign-in or migration notice once the task screen is mounted.
  useEffect(() => {
    if (!user || !notice) return
    showToast(notice)
    setNotice(null)
  }, [user, notice, showToast])

  // Keep a synchronous copy of the list for the one-time browser import.
  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  // Pick up tasks saved by the pre-account version of the app, even if the
  // account already has some tasks or the page was already signed in.
  useEffect(() => {
    if (!user || !hydrated || legacyCheckedRef.current) return
    legacyCheckedRef.current = true
    void importLegacyTasks(false)
    // Import runs once per session; the ref guards StrictMode's double mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hydrated])

  // Persist personal task changes to the signed-in user's account.
  useEffect(() => {
    if (!user || !hydrated) return

    const snapshot = JSON.stringify(tasks)
    if (snapshot === lastSavedRef.current) return

    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      queueSave(tasks)
    }, 250)

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
    // queueSave is intentionally omitted; it only uses refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, user, hydrated])

  // Load a team when it becomes the active view.
  useEffect(() => {
    if (view.kind !== 'team') {
      teamRequestRef.current += 1
      teamRef.current = null
      setTeam(null)
      setTeamLoading(false)
      setTeamError(null)
      setTeamSyncError(null)
      return
    }

    void loadTeam(view.teamId)
    // loadTeam only reads state through setters and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // Keep team views reasonably fresh for teammates working at the same time.
  useEffect(() => {
    if (view.kind !== 'team') return
    const teamId = view.teamId

    function refreshIfIdle() {
      if (
        document.visibilityState === 'visible' &&
        teamPendingRef.current === 0
      ) {
        void loadTeam(teamId, true)
      }
    }

    const interval = window.setInterval(refreshIfIdle, 20_000)
    document.addEventListener('visibilitychange', refreshIfIdle)
    window.addEventListener('focus', refreshIfIdle)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshIfIdle)
      window.removeEventListener('focus', refreshIfIdle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // Pick up teams someone else added this user to while the app stays open.
  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function refreshTeamList() {
      if (document.visibilityState !== 'visible') return
      try {
        const result = await api.listTeams()
        if (cancelled) return
        setTeams((current) =>
          JSON.stringify(current) === JSON.stringify(result.teams)
            ? current
            : result.teams,
        )
        if (result.joinedTeams > 0) {
          setNotice(
            `You joined ${result.joinedTeams} team${result.joinedTeams === 1 ? '' : 's'}.`,
          )
        }
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          handleSessionExpired()
        }
      }
    }

    const interval = window.setInterval(refreshTeamList, 30_000)
    document.addEventListener('visibilitychange', refreshTeamList)
    window.addEventListener('focus', refreshTeamList)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshTeamList)
      window.removeEventListener('focus', refreshTeamList)
    }
    // Only the signed-in user controls this listener's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadTasksForUser(): Promise<LoadedTasks> {
    return { tasks: await api.listTasks() }
  }

  function applySession(
    nextUser: User,
    loaded: LoadedTasks,
    teamList: TeamSummary[],
    joinedTeams = 0,
  ) {
    sessionVersionRef.current += 1
    teamRequestRef.current += 1
    tasksRef.current = loaded.tasks
    lastSavedRef.current = JSON.stringify(loaded.tasks)
    legacyCheckedRef.current = false
    pendingLegacyRef.current = null
    teamRef.current = null
    teamSaveChainsRef.current.clear()
    teamPendingRef.current = 0
    setTaskImportState(null)
    setTasks(loaded.tasks)
    setTeams(teamList)
    setTeamsLoading(false)
    setView({ kind: 'personal' })
    setTeam(null)
    setTeamLoading(false)
    setTeamError(null)
    setTeamSyncError(null)
    setDialog(null)
    setDialogBusy(false)
    setDialogError(null)
    setUser(nextUser)
    setHydrated(true)
    setAuthLoading(false)
    setAuthError(null)
    setSyncError(null)
    setFilter('all')
    setQuery('')
    setTeamTab('team')
    if (joinedTeams > 0) {
      setNotice(
        `You joined ${joinedTeams} team${joinedTeams === 1 ? '' : 's'}.`,
      )
    }
  }

  function setTaskImportState(
    next: { count: number; error: string | null } | null,
  ): void {
    setLegacyImport(next)
  }

  async function importLegacyTasks(manual: boolean): Promise<void> {
    const scan = scanLegacyTasks()

    if (scan.tasks.length === 0) {
      if (manual) {
        setTaskImportState(null)
        showToast('No old tasks were found in this browser.')
      }
      return
    }

    const { tasks: merged, added } = mergeTasks(tasksRef.current, scan.tasks)
    if (added === 0) {
      clearLegacyTasks(scan.keys)
      setTaskImportState(null)
      if (manual) showToast('Those tasks are already in your account.')
      return
    }

    pendingLegacyRef.current = { keys: scan.keys, added }
    tasksRef.current = merged
    setTaskImportState({ count: added, error: null })
    setTasks(merged)
  }

  function queueSave(snapshotTasks: Task[]) {
    const version = sessionVersionRef.current
    const legacy = pendingLegacyRef.current

    saveChainRef.current = saveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (version !== sessionVersionRef.current) return
        const saved = await api.saveTasks(snapshotTasks)
        if (version !== sessionVersionRef.current) return
        lastSavedRef.current = JSON.stringify(saved)
        setSyncError(null)
        if (legacy && pendingLegacyRef.current === legacy) {
          pendingLegacyRef.current = null
          clearLegacyTasks(legacy.keys)
          setTaskImportState(null)
          setNotice(
            `Imported ${legacy.added} existing task${legacy.added === 1 ? '' : 's'} from this browser into your account.`,
          )
        }
      })
      .catch((error: unknown) => {
        if (version !== sessionVersionRef.current) return
        if (error instanceof ApiError && error.status === 401) {
          handleSessionExpired()
          return
        }
        if (legacy && pendingLegacyRef.current === legacy) {
          pendingLegacyRef.current = null
          setTaskImportState({ count: legacy.added, error: errorMessage(error) })
          return
        }
        setSyncError(errorMessage(error))
      })
  }

  async function refreshTeams(): Promise<TeamSummary[]> {
    try {
      const result = await api.listTeams()
      setTeams(result.teams)
      if (result.joinedTeams > 0) {
        setNotice(
          `You joined ${result.joinedTeams} team${result.joinedTeams === 1 ? '' : 's'}.`,
        )
      }
      return result.teams
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired()
      }
      return []
    }
  }

  function applyTeam(detail: TeamDetail): void {
    teamRef.current = detail
    setTeam(detail)
  }

  async function loadTeam(teamId: string, silent = false): Promise<void> {
    const version = ++teamRequestRef.current
    if (!silent) {
      setTeamLoading(true)
      setTeamError(null)
    }

    try {
      const detail = await api.getTeam(teamId)
      if (version !== teamRequestRef.current) return
      applyTeam(detail)
      setTeamError(null)
      setTeamSyncError(null)
    } catch (error) {
      if (version !== teamRequestRef.current) return

      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired()
        return
      }

      if (
        error instanceof ApiError &&
        (error.status === 403 || error.status === 404)
      ) {
        setView({ kind: 'personal' })
        teamRef.current = null
        setTeam(null)
        void refreshTeams()
        showToast(error.message)
        return
      }

      if (silent) setTeamSyncError(errorMessage(error))
      else setTeamError(errorMessage(error))
    } finally {
      if (version === teamRequestRef.current) setTeamLoading(false)
    }
  }

  function handleTeamOpError(error: unknown): void {
    if (error instanceof ApiError && error.status === 401) {
      handleSessionExpired()
      return
    }

    setTeamSyncError(errorMessage(error))

    if (
      error instanceof ApiError &&
      (error.status === 403 || error.status === 404) &&
      teamRef.current
    ) {
      void loadTeam(teamRef.current.id, true)
    }
  }

  function updateTeamTaskLocal(
    taskId: string,
    updater: (task: Task) => Task,
  ): void {
    const current = teamRef.current
    if (!current) return

    const existing = current.teamTasks.find((task) => task.id === taskId)
    if (!existing) return

    const nextTask = updater(existing)
    const next = {
      ...current,
      teamTasks: current.teamTasks.map((task) =>
        task.id === taskId ? nextTask : task,
      ),
    }
    teamRef.current = next
    setTeam(next)
    queueTeamSave(nextTask)
  }

  function queueTeamSave(task: Task): void {
    const current = teamRef.current
    if (!current) return

    const teamId = current.id
    const version = sessionVersionRef.current
    const previous = teamSaveChainsRef.current.get(task.id) ?? Promise.resolve()

    teamPendingRef.current += 1

    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (version !== sessionVersionRef.current) return
        try {
          await api.updateTeamTask(teamId, task)
          if (version === sessionVersionRef.current) setTeamSyncError(null)
        } catch (error) {
          if (version === sessionVersionRef.current) handleTeamOpError(error)
        } finally {
          teamPendingRef.current = Math.max(0, teamPendingRef.current - 1)
        }
      })

    teamSaveChainsRef.current.set(task.id, next)
    void next.finally(() => {
      if (teamSaveChainsRef.current.get(task.id) === next) {
        teamSaveChainsRef.current.delete(task.id)
      }
    })
  }

  function handleSessionExpired() {
    sessionVersionRef.current += 1
    teamRequestRef.current += 1
    tasksRef.current = []
    lastSavedRef.current = ''
    legacyCheckedRef.current = false
    pendingLegacyRef.current = null
    teamRef.current = null
    teamSaveChainsRef.current.clear()
    teamPendingRef.current = 0
    setTaskImportState(null)
    setTasks([])
    setTeams([])
    setTeamsLoading(false)
    setView({ kind: 'personal' })
    setTeam(null)
    setTeamLoading(false)
    setTeamError(null)
    setTeamSyncError(null)
    setDialog(null)
    setDialogBusy(false)
    setDialogError(null)
    setUser(null)
    setHydrated(false)
    setSyncError(null)
    setAuthError('Your session expired. Please sign in again.')
    hideToast()
  }

  async function handleAuth(mode: AuthMode, email: string, password: string) {
    setAuthBusy(true)
    setAuthError(null)

    try {
      const result =
        mode === 'signup'
          ? await api.signUp(email, password)
          : await api.signIn(email, password)
      const [loaded, teamList] = await Promise.all([
        loadTasksForUser(),
        api.listTeams().catch(() => NO_TEAMS),
      ])
      applySession(
        result.user,
        loaded,
        teamList.teams,
        result.joinedTeams + teamList.joinedTeams,
      )
    } catch (error) {
      setAuthError(errorMessage(error))
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleSignOut() {
    try {
      await api.signOut()
    } catch {
      // Sign out locally even if the server is unreachable.
    }

    sessionVersionRef.current += 1
    teamRequestRef.current += 1
    tasksRef.current = []
    lastSavedRef.current = ''
    legacyCheckedRef.current = false
    pendingLegacyRef.current = null
    teamRef.current = null
    teamSaveChainsRef.current.clear()
    teamPendingRef.current = 0
    setTaskImportState(null)
    setTasks([])
    setTeams([])
    setTeamsLoading(false)
    setView({ kind: 'personal' })
    setTeam(null)
    setTeamLoading(false)
    setTeamError(null)
    setTeamSyncError(null)
    setDialog(null)
    setDialogBusy(false)
    setDialogError(null)
    setUser(null)
    setHydrated(false)
    setAuthError(null)
    setSyncError(null)
    setFilter('all')
    setQuery('')
    setTeamTab('team')
    hideToast()
  }

  function retrySave() {
    if (!user) return
    setSyncError(null)
    queueSave(tasks)
  }

  function retryTeamSync() {
    if (!team) return
    setTeamSyncError(null)
    void loadTeam(team.id)
  }

  function selectPersonal() {
    setView({ kind: 'personal' })
    setFilter('all')
    setQuery('')
  }

  function selectTeam(teamId: string) {
    setFilter('all')
    setQuery('')
    setTeamTab('team')
    setView({ kind: 'team', teamId })
  }

  function updateTask(taskId: string, updater: (task: Task) => Task) {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? updater(task) : task)),
    )
  }

  function handleAdd(input: NewTask) {
    setTasks((current) => [...current, createTask(input)])
  }

  function handleToggle(id: string, done: boolean) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? { ...task, done, completedAt: done ? Date.now() : null }
          : task,
      ),
    )
  }

  function handleRename(id: string, title: string) {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, title } : task)),
    )
  }

  function handleDelete(id: string) {
    const index = tasks.findIndex((task) => task.id === id)
    if (index === -1) return

    const removed = tasks[index]
    setTasks((current) => current.filter((task) => task.id !== id))

    showToast('Task deleted', () => {
      setTasks((current) => {
        if (current.some((task) => task.id === removed.id)) return current
        const next = current.slice()
        next.splice(Math.min(index, next.length), 0, removed)
        return next
      })
    })
  }

  function handleAddSubtask(taskId: string, title: string) {
    updateTask(taskId, (task) => ({
      ...task,
      subtasks: [...task.subtasks, createSubtask(title)],
    }))
  }

  function handleToggleSubtask(taskId: string, subtaskId: string, done: boolean) {
    updateTask(taskId, (task) => ({
      ...task,
      subtasks: task.subtasks.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, done } : subtask,
      ),
    }))
  }

  function handleDeleteSubtask(taskId: string, subtaskId: string) {
    const task = tasks.find((item) => item.id === taskId)
    const index = task ? task.subtasks.findIndex((item) => item.id === subtaskId) : -1
    if (!task || index === -1) return

    const removed = task.subtasks[index]
    updateTask(taskId, (current) => ({
      ...current,
      subtasks: current.subtasks.filter((item) => item.id !== subtaskId),
    }))

    showToast('Part removed', () => {
      setTasks((current) =>
        current.map((item) => {
          if (item.id !== taskId || item.subtasks.some((subtask) => subtask.id === removed.id)) {
            return item
          }
          const next = item.subtasks.slice()
          next.splice(Math.min(index, next.length), 0, removed)
          return { ...item, subtasks: next }
        }),
      )
    })
  }

  function handleAddComment(taskId: string, text: string) {
    updateTask(taskId, (task) => ({
      ...task,
      comments: [createComment(text), ...task.comments],
    }))
  }

  function handleDeleteComment(taskId: string, commentId: string) {
    const task = tasks.find((item) => item.id === taskId)
    const index = task ? task.comments.findIndex((item) => item.id === commentId) : -1
    if (!task || index === -1) return

    const removed = task.comments[index]
    updateTask(taskId, (current) => ({
      ...current,
      comments: current.comments.filter((item) => item.id !== commentId),
    }))

    showToast('Note deleted', () => {
      setTasks((current) =>
        current.map((item) => {
          if (item.id !== taskId || item.comments.some((comment) => comment.id === removed.id)) {
            return item
          }
          const next = item.comments.slice()
          next.splice(Math.min(index, next.length), 0, removed)
          return { ...item, comments: next }
        }),
      )
    })
  }

  function handleClearCompleted() {
    const removed = tasks.filter((task) => task.done)
    if (removed.length === 0) return

    setTasks((current) => current.filter((task) => !task.done))

    const message =
      removed.length === 1
        ? '1 completed task cleared'
        : `${removed.length} completed tasks cleared`

    showToast(message, () => {
      setTasks((current) => {
        const existing = new Set(current.map((task) => task.id))
        return [...current, ...removed.filter((task) => !existing.has(task.id))]
      })
    })
  }

  function handleTeamAdd(input: NewTask) {
    const current = teamRef.current
    if (!current || !user) return

    const task = taskWithAuthor(createTask(input), current.id, user)
    const next = { ...current, teamTasks: [...current.teamTasks, task] }
    teamRef.current = next
    setTeam(next)

    const version = sessionVersionRef.current
    teamPendingRef.current += 1
    void (async () => {
      try {
        const saved = await api.createTeamTask(current.id, task)
        if (version !== sessionVersionRef.current) return
        const latest = teamRef.current
        if (!latest || latest.id !== current.id) return
        const updated = {
          ...latest,
          teamTasks: latest.teamTasks.map((item) =>
            item.id === task.id ? saved : item,
          ),
        }
        teamRef.current = updated
        setTeam(updated)
        setTeamSyncError(null)
      } catch (error) {
        if (version !== sessionVersionRef.current) return
        const latest = teamRef.current
        if (latest?.id === current.id) {
          const rolledBack = {
            ...latest,
            teamTasks: latest.teamTasks.filter((item) => item.id !== task.id),
          }
          teamRef.current = rolledBack
          setTeam(rolledBack)
        }
        handleTeamOpError(error)
      } finally {
        teamPendingRef.current = Math.max(0, teamPendingRef.current - 1)
      }
    })()
  }

  function handleTeamToggle(id: string, done: boolean) {
    updateTeamTaskLocal(id, (task) => ({
      ...task,
      done,
      completedAt: done ? Date.now() : null,
    }))
  }

  function handleTeamRename(id: string, title: string) {
    updateTeamTaskLocal(id, (task) => ({ ...task, title }))
  }

  function handleTeamAddSubtask(taskId: string, title: string) {
    updateTeamTaskLocal(taskId, (task) => ({
      ...task,
      subtasks: [...task.subtasks, createSubtask(title)],
    }))
  }

  function handleTeamToggleSubtask(
    taskId: string,
    subtaskId: string,
    done: boolean,
  ) {
    updateTeamTaskLocal(taskId, (task) => ({
      ...task,
      subtasks: task.subtasks.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, done } : subtask,
      ),
    }))
  }

  function handleTeamAddComment(taskId: string, text: string) {
    updateTeamTaskLocal(taskId, (task) => ({
      ...task,
      comments: [createComment(text), ...task.comments],
    }))
  }

  function handleTeamDeleteSubtask(taskId: string, subtaskId: string) {
    const current = teamRef.current
    const task = current?.teamTasks.find((item) => item.id === taskId)
    const index = task
      ? task.subtasks.findIndex((item) => item.id === subtaskId)
      : -1
    if (!task || index === -1) return

    const removed = task.subtasks[index]
    updateTeamTaskLocal(taskId, (item) => ({
      ...item,
      subtasks: item.subtasks.filter((subtask) => subtask.id !== subtaskId),
    }))

    showToast('Part removed', () => {
      updateTeamTaskLocal(taskId, (item) => {
        if (item.subtasks.some((subtask) => subtask.id === removed.id)) return item
        const next = item.subtasks.slice()
        next.splice(Math.min(index, next.length), 0, removed)
        return { ...item, subtasks: next }
      })
    })
  }

  function handleTeamDeleteComment(taskId: string, commentId: string) {
    const current = teamRef.current
    const task = current?.teamTasks.find((item) => item.id === taskId)
    const index = task
      ? task.comments.findIndex((item) => item.id === commentId)
      : -1
    if (!task || index === -1) return

    const removed = task.comments[index]
    updateTeamTaskLocal(taskId, (item) => ({
      ...item,
      comments: item.comments.filter((comment) => comment.id !== commentId),
    }))

    showToast('Note deleted', () => {
      updateTeamTaskLocal(taskId, (item) => {
        if (item.comments.some((comment) => comment.id === removed.id)) return item
        const next = item.comments.slice()
        next.splice(Math.min(index, next.length), 0, removed)
        return { ...item, comments: next }
      })
    })
  }

  function handleTeamDelete(id: string) {
    const current = teamRef.current
    if (!current) return

    const index = current.teamTasks.findIndex((task) => task.id === id)
    if (index === -1) return

    const removed = current.teamTasks[index]
    const next = {
      ...current,
      teamTasks: current.teamTasks.filter((task) => task.id !== id),
    }
    teamRef.current = next
    setTeam(next)

    const teamId = current.id
    const version = sessionVersionRef.current
    teamPendingRef.current += 1
    void (async () => {
      try {
        await api.deleteTeamTask(teamId, id)
        if (version === sessionVersionRef.current) setTeamSyncError(null)
      } catch (error) {
        if (version !== sessionVersionRef.current) return
        const latest = teamRef.current
        if (latest?.id === teamId && !latest.teamTasks.some((task) => task.id === id)) {
          const restored = latest.teamTasks.slice()
          restored.splice(Math.min(index, restored.length), 0, removed)
          const fixed = { ...latest, teamTasks: restored }
          teamRef.current = fixed
          setTeam(fixed)
        }
        handleTeamOpError(error)
        return
      } finally {
        teamPendingRef.current = Math.max(0, teamPendingRef.current - 1)
      }

      showToast('Team task deleted', () => {
        teamPendingRef.current += 1
        void (async () => {
          try {
            const saved = await api.createTeamTask(teamId, removed)
            const latest = teamRef.current
            if (
              version === sessionVersionRef.current &&
              latest?.id === teamId &&
              !latest.teamTasks.some((task) => task.id === saved.id)
            ) {
              const list = latest.teamTasks.slice()
              list.splice(Math.min(index, list.length), 0, saved)
              const fixed = { ...latest, teamTasks: list }
              teamRef.current = fixed
              setTeam(fixed)
            }
          } catch (error) {
            handleTeamOpError(error)
          } finally {
            teamPendingRef.current = Math.max(0, teamPendingRef.current - 1)
          }
        })()
      })
    })()
  }

  function handleClearTeamCompleted() {
    const current = teamRef.current
    if (!current) return

    const removed = current.teamTasks.filter((task) => task.done)
    if (removed.length === 0) return

    const next = {
      ...current,
      teamTasks: current.teamTasks.filter((task) => !task.done),
    }
    teamRef.current = next
    setTeam(next)

    const teamId = current.id
    const version = sessionVersionRef.current
    teamPendingRef.current += 1
    void (async () => {
      try {
        await Promise.all(
          removed.map((task) => api.deleteTeamTask(teamId, task.id)),
        )
      } catch (error) {
        handleTeamOpError(error)
        void loadTeam(teamId, true)
      } finally {
        teamPendingRef.current = Math.max(0, teamPendingRef.current - 1)
      }
    })()

    const message =
      removed.length === 1
        ? '1 completed team task cleared'
        : `${removed.length} completed team tasks cleared`

    showToast(message, () => {
      teamPendingRef.current += 1
      void (async () => {
        try {
          const saved = await Promise.all(
            removed.map((task) => api.createTeamTask(teamId, task)),
          )
          const latest = teamRef.current
          if (version === sessionVersionRef.current && latest?.id === teamId) {
            const existing = new Set(latest.teamTasks.map((task) => task.id))
            const fixed = {
              ...latest,
              teamTasks: [
                ...latest.teamTasks,
                ...saved.filter((task) => !existing.has(task.id)),
              ],
            }
            teamRef.current = fixed
            setTeam(fixed)
          }
        } catch (error) {
          handleTeamOpError(error)
          void loadTeam(teamId, true)
        } finally {
          teamPendingRef.current = Math.max(0, teamPendingRef.current - 1)
        }
      })()
    })
  }

  function handleDialogFailure(error: unknown): boolean {
    if (error instanceof ApiError && error.status === 401) {
      handleSessionExpired()
      return false
    }
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      void refreshTeams()
    }
    setDialogError(errorMessage(error))
    return false
  }

  async function handleCreateTeam(name: string, emails: string[]) {
    setDialogBusy(true)
    setDialogError(null)

    try {
      const result = await api.createTeam(name, emails)
      await refreshTeams()
      setDialog(null)
      selectTeam(result.id)
      const pieces: string[] = []
      if (result.invited.joined > 0) {
        pieces.push(
          `${result.invited.joined} member${result.invited.joined === 1 ? '' : 's'} joined`,
        )
      }
      if (result.invited.pending > 0) {
        pieces.push(
          `${result.invited.pending} invite${result.invited.pending === 1 ? '' : 's'} pending`,
        )
      }
      showToast(
        pieces.length > 0
          ? `Team created. ${pieces.join(' · ')}.`
          : 'Team created.',
      )
    } catch (error) {
      handleDialogFailure(error)
    } finally {
      setDialogBusy(false)
    }
  }

  async function handleAddMember(email: string): Promise<boolean> {
    const current = teamRef.current
    if (!current) return false

    setDialogBusy(true)
    setDialogError(null)
    try {
      const detail = await api.addTeamMember(current.id, email)
      applyTeam(detail)
      await refreshTeams()
      showToast('Team member added.')
      return true
    } catch (error) {
      return handleDialogFailure(error)
    } finally {
      setDialogBusy(false)
    }
  }

  async function handleRemoveMember(memberId: string): Promise<boolean> {
    const current = teamRef.current
    if (!current) return false

    setDialogBusy(true)
    setDialogError(null)
    try {
      const result = await api.removeTeamMember(current.id, memberId)
      await refreshTeams()
      if (result.removedSelf) {
        setDialog(null)
        selectPersonal()
        showToast('You left the team.')
      } else {
        const detail = await api.getTeam(current.id)
        applyTeam(detail)
        showToast('Team member removed.')
      }
      return true
    } catch (error) {
      return handleDialogFailure(error)
    } finally {
      setDialogBusy(false)
    }
  }

  async function handleRemoveInvite(email: string): Promise<boolean> {
    const current = teamRef.current
    if (!current) return false

    setDialogBusy(true)
    setDialogError(null)
    try {
      const detail = await api.removeTeamInvite(current.id, email)
      applyTeam(detail)
      showToast('Invite cancelled.')
      return true
    } catch (error) {
      return handleDialogFailure(error)
    } finally {
      setDialogBusy(false)
    }
  }

  async function handleRenameTeam(name: string): Promise<boolean> {
    const current = teamRef.current
    if (!current) return false

    setDialogBusy(true)
    setDialogError(null)
    try {
      const detail = await api.renameTeam(current.id, name)
      applyTeam(detail)
      await refreshTeams()
      showToast('Team renamed.')
      return true
    } catch (error) {
      return handleDialogFailure(error)
    } finally {
      setDialogBusy(false)
    }
  }

  async function handleDeleteTeam(): Promise<boolean> {
    const current = teamRef.current
    if (!current) return false

    setDialogBusy(true)
    setDialogError(null)
    try {
      await api.deleteTeam(current.id)
      setDialog(null)
      selectPersonal()
      await refreshTeams()
      showToast('Team deleted.')
      return true
    } catch (error) {
      return handleDialogFailure(error)
    } finally {
      setDialogBusy(false)
    }
  }

  function handleUndo() {
    const action = toast?.action
    hideToast()
    action?.()
  }

  if (authLoading) return <AuthLoading />

  if (!user) {
    return (
      <AuthScreen
        busy={authBusy}
        error={authError}
        onSubmit={handleAuth}
        onClearError={() => setAuthError(null)}
      />
    )
  }

  const emptyReason = getEmptyReason(tasks.length, visibleTasks.length, filter, query)
  const isTeamView = view.kind === 'team'
  const title = isTeamView ? (team?.name ?? 'Team') : 'My Tasks'
  const subtitle = isTeamView
    ? team
      ? `${team.members.length} member${
          team.members.length === 1 ? '' : 's'
        } · ${teamCounts.pending} open team task${
          teamCounts.pending === 1 ? '' : 's'
        }`
      : 'Loading team…'
    : `${formatToday()} · ${counts.pending} open`

  return (
    <div className="workspace">
      <Sidebar
        teams={teams}
        teamsLoading={teamsLoading}
        active={view}
        personalPending={counts.pending}
        onSelectPersonal={selectPersonal}
        onSelectTeam={selectTeam}
        onCreateTeam={() => {
          setDialogError(null)
          setDialog('create')
        }}
      />

      <main className="app" aria-labelledby="app-title">
        <Header
          title={title}
          subtitle={subtitle}
          email={user.email}
          onSignOut={handleSignOut}
        />

        {syncError && (
          <div className="sync-banner" role="alert">
            <span>{syncError}</span>
            <button type="button" className="btn-small" onClick={retrySave}>
              Retry
            </button>
          </div>
        )}

        {legacyImport && (
          <div className="sync-banner" role={legacyImport.error ? 'alert' : 'status'}>
            <span>
              {legacyImport.error
                ? `Found ${legacyImport.count} older task${legacyImport.count === 1 ? '' : 's'} in this browser, but importing them failed. ${legacyImport.error}`
                : `Importing ${legacyImport.count} older task${legacyImport.count === 1 ? '' : 's'} from this browser…`}
            </span>
            {legacyImport.error && (
              <button
                type="button"
                className="btn-small"
                onClick={() => void importLegacyTasks(true)}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {isTeamView ? (
          <TeamView
            team={team}
            loading={teamLoading}
            error={teamError}
            syncError={teamSyncError}
            tab={teamTab}
            filter={filter}
            query={query}
            currentUserId={user.id}
            onTabChange={setTeamTab}
            onFilterChange={setFilter}
            onQueryChange={setQuery}
            onAdd={handleTeamAdd}
            onToggle={handleTeamToggle}
            onRename={handleTeamRename}
            onDelete={handleTeamDelete}
            onAddSubtask={handleTeamAddSubtask}
            onToggleSubtask={handleTeamToggleSubtask}
            onDeleteSubtask={handleTeamDeleteSubtask}
            onAddComment={handleTeamAddComment}
            onDeleteComment={handleTeamDeleteComment}
            onRefresh={retryTeamSync}
            onManage={() => {
              setDialogError(null)
              setDialog('manage')
            }}
            onRetryLoad={() => {
              if (view.kind === 'team') void loadTeam(view.teamId)
            }}
          />
        ) : (
          <>
            <AddTaskForm onAdd={handleAdd} />

            <Toolbar
              filter={filter}
              counts={counts}
              query={query}
              onFilterChange={setFilter}
              onQueryChange={setQuery}
            />

            {emptyReason ? (
              <EmptyState reason={emptyReason} query={query} />
            ) : (
              <TaskList
                tasks={visibleTasks}
                currentUserId={user.id}
                onToggle={handleToggle}
                onRename={handleRename}
                onDelete={handleDelete}
                onAddSubtask={handleAddSubtask}
                onToggleSubtask={handleToggleSubtask}
                onDeleteSubtask={handleDeleteSubtask}
                onAddComment={handleAddComment}
                onDeleteComment={handleDeleteComment}
              />
            )}

            <footer className="app-footer">
              <span aria-live="polite">
                {tasks.length === 0
                  ? 'No tasks yet'
                  : `${counts.pending} pending · ${counts.overdue} overdue · ${counts.done} completed`}
              </span>
              <button
                type="button"
                className="link-btn"
                onClick={handleClearCompleted}
                disabled={counts.done === 0}
              >
                Clear completed
              </button>
            </footer>
          </>
        )}

        {isTeamView && team?.teamTasks.some((task) => task.done) && (
          <footer className="app-footer">
            <span>
              {team.teamTasks.length} team task
              {team.teamTasks.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="link-btn"
              onClick={handleClearTeamCompleted}
            >
              Clear completed
            </button>
          </footer>
        )}

        <Toast toast={toast} onUndo={handleUndo} />
      </main>

      {dialog === 'create' && (
        <CreateTeamDialog
          busy={dialogBusy}
          error={dialogError}
          userEmail={user.email}
          onClose={() => {
            if (dialogBusy) return
            setDialog(null)
            setDialogError(null)
          }}
          onSubmit={handleCreateTeam}
        />
      )}

      {dialog === 'manage' && team && (
        <ManageTeamDialog
          team={team}
          currentUserId={user.id}
          busy={dialogBusy}
          error={dialogError}
          onClose={() => {
            if (dialogBusy) return
            setDialog(null)
            setDialogError(null)
          }}
          onAddMember={handleAddMember}
          onRemoveMember={handleRemoveMember}
          onRemoveInvite={handleRemoveInvite}
          onRename={handleRenameTeam}
          onDelete={handleDeleteTeam}
        />
      )}
    </div>
  )
}

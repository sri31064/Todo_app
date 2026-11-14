import { useMemo } from 'react'
import type { TeamDetail } from '../lib/api'
import { getCounts, getVisibleTasks } from '../lib/tasks'
import type { Filter, NewTask, TeamTab } from '../types'
import { AddTaskForm } from './AddTaskForm'
import { EmptyState, type EmptyReason } from './EmptyState'
import { RefreshIcon, UsersIcon } from './icons'
import { TaskList } from './TaskList'
import { Toolbar } from './Toolbar'

interface TeamViewProps {
  team: TeamDetail | null
  loading: boolean
  error: string | null
  syncError: string | null
  tab: TeamTab
  filter: Filter
  query: string
  currentUserId: string
  onTabChange: (tab: TeamTab) => void
  onFilterChange: (filter: Filter) => void
  onQueryChange: (query: string) => void
  onAdd: (task: NewTask) => void
  onToggle: (id: string, done: boolean) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onAddSubtask: (taskId: string, title: string) => void
  onToggleSubtask: (taskId: string, subtaskId: string, done: boolean) => void
  onDeleteSubtask: (taskId: string, subtaskId: string) => void
  onAddComment: (taskId: string, text: string) => void
  onDeleteComment: (taskId: string, commentId: string) => void
  onRefresh: () => void
  onManage: () => void
  onRetryLoad: () => void
}

function memberInitial(email: string): string {
  return email.trim().charAt(0).toUpperCase() || '?'
}

function emptyReason(
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

const noop = () => undefined

export function TeamView({
  team,
  loading,
  error,
  syncError,
  tab,
  filter,
  query,
  currentUserId,
  onTabChange,
  onFilterChange,
  onQueryChange,
  onAdd,
  onToggle,
  onRename,
  onDelete,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onAddComment,
  onDeleteComment,
  onRefresh,
  onManage,
  onRetryLoad,
}: TeamViewProps) {
  const teamCounts = useMemo(
    () => getCounts(team?.teamTasks ?? []),
    [team?.teamTasks],
  )
  const visibleTeamTasks = useMemo(
    () => getVisibleTasks(team?.teamTasks ?? [], filter, query),
    [team?.teamTasks, filter, query],
  )
  const memberGroups = useMemo(
    () =>
      (team?.memberTasks ?? []).map((group) => ({
        ...group,
        counts: getCounts(group.tasks),
        visible: getVisibleTasks(group.tasks, filter, query),
      })),
    [team?.memberTasks, filter, query],
  )
  const memberTaskCount = useMemo(
    () => (team?.memberTasks ?? []).reduce((total, group) => total + group.tasks.length, 0),
    [team?.memberTasks],
  )
  const visibleMemberCount = memberGroups.reduce(
    (total, group) => total + group.visible.length,
    0,
  )

  if (!team) {
    if (loading) {
      return (
        <section className="team-state" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Loading team…</p>
        </section>
      )
    }

    return (
      <section className="team-state" role="alert">
        <p>{error ?? 'This team could not be loaded.'}</p>
        <button type="button" className="btn-small" onClick={onRetryLoad}>
          Try again
        </button>
      </section>
    )
  }

  const reason =
    tab === 'team'
      ? emptyReason(team.teamTasks.length, visibleTeamTasks.length, filter, query)
      : null
  const peopleReason =
    tab === 'people' && memberTaskCount > 0 && visibleMemberCount === 0
      ? emptyReason(memberTaskCount, 0, filter, query)
      : null

  return (
    <div className="team-view">
      <div className="team-bar">
        <div className="team-tabs" role="tablist" aria-label="Team view">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'team'}
            className={tab === 'team' ? 'team-tab is-active' : 'team-tab'}
            onClick={() => onTabChange('team')}
          >
            Team tasks
            <span className="team-tab-count">{team.teamTasks.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'people'}
            className={tab === 'people' ? 'team-tab is-active' : 'team-tab'}
            onClick={() => onTabChange('people')}
          >
            People&apos;s tasks
            <span className="team-tab-count">{team.members.length}</span>
          </button>
        </div>

        <div className="team-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={onRefresh}
            title="Refresh team"
          >
            <RefreshIcon />
            Refresh
          </button>
          <button type="button" className="ghost-btn" onClick={onManage}>
            <UsersIcon />
            Members
          </button>
        </div>
      </div>

      {syncError && (
        <div className="sync-banner" role="alert">
          <span>{syncError}</span>
          <button type="button" className="btn-small" onClick={onRefresh}>
            Reload
          </button>
        </div>
      )}

      {loading && (
        <p className="team-refreshing" aria-live="polite">
          Refreshing team…
        </p>
      )}

      {tab === 'team' ? (
        <>
          <AddTaskForm onAdd={onAdd} />

          <Toolbar
            filter={filter}
            counts={teamCounts}
            query={query}
            onFilterChange={onFilterChange}
            onQueryChange={onQueryChange}
          />

          {reason ? (
            <EmptyState reason={reason} query={query} />
          ) : (
            <TaskList
              tasks={visibleTeamTasks}
              currentUserId={currentUserId}
              showAuthor
              onToggle={onToggle}
              onRename={onRename}
              onDelete={onDelete}
              onAddSubtask={onAddSubtask}
              onToggleSubtask={onToggleSubtask}
              onDeleteSubtask={onDeleteSubtask}
              onAddComment={onAddComment}
              onDeleteComment={onDeleteComment}
            />
          )}
        </>
      ) : (
        <>
          <Toolbar
            filter={filter}
            counts={getCounts(team.memberTasks.flatMap((group) => group.tasks))}
            query={query}
            onFilterChange={onFilterChange}
            onQueryChange={onQueryChange}
          />

          <p className="people-note">
            Everyone&apos;s My Tasks, collected here read-only. Teammates edit
            their own tasks from My Tasks.
          </p>

          {memberTaskCount === 0 ? (
            <div className="team-empty">
              <p className="empty-title">No personal tasks yet</p>
              <p className="empty-body">
                When teammates add tasks in My Tasks, they will appear here so
                the team can monitor progress.
              </p>
            </div>
          ) : peopleReason ? (
            <EmptyState reason={peopleReason} query={query} />
          ) : (
            <div className="member-groups">
              {memberGroups.map((group) => {
                const showEmpty =
                  group.visible.length === 0 &&
                  !query.trim() &&
                  filter === 'all'
                if (group.visible.length === 0 && !showEmpty) return null

                return (
                  <section className="member-group" key={group.user.id}>
                    <header className="member-head">
                      <span className="member-avatar" aria-hidden="true">
                        {memberInitial(group.user.email)}
                      </span>
                      <div className="member-title">
                        <h3>{group.user.email}</h3>
                        <p>
                          {group.counts.pending} open · {group.counts.done}{' '}
                          completed
                        </p>
                      </div>
                      <span className="member-badge">read-only</span>
                    </header>

                    {group.visible.length === 0 ? (
                      <p className="member-empty">No personal tasks yet.</p>
                    ) : (
                      <TaskList
                        tasks={group.visible}
                        currentUserId={currentUserId}
                        readOnly
                        onToggle={noop}
                        onRename={noop}
                        onDelete={noop}
                        onAddSubtask={noop}
                        onToggleSubtask={noop}
                        onDeleteSubtask={noop}
                        onAddComment={noop}
                        onDeleteComment={noop}
                      />
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

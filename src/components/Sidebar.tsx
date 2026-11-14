import type { TeamSummary } from '../lib/api'
import type { View } from '../types'
import { CheckCircleIcon, ListIcon, PlusIcon, UsersIcon } from './icons'

interface SidebarProps {
  teams: TeamSummary[]
  teamsLoading: boolean
  active: View
  personalPending: number
  onSelectPersonal: () => void
  onSelectTeam: (teamId: string) => void
  onCreateTeam: () => void
}

export function Sidebar({
  teams,
  teamsLoading,
  active,
  personalPending,
  onSelectPersonal,
  onSelectTeam,
  onCreateTeam,
}: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Workspace navigation">
      <div className="sidebar-brand">
        <span className="sidebar-logo" aria-hidden="true">
          <CheckCircleIcon />
        </span>
        <div>
          <strong>Taskspace</strong>
          <span>Personal + teams</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <p className="sidebar-label">Workspace</p>
        <button
          type="button"
          className={
            active.kind === 'personal' ? 'nav-item is-active' : 'nav-item'
          }
          aria-current={active.kind === 'personal' ? 'page' : undefined}
          onClick={onSelectPersonal}
        >
          <ListIcon />
          <span className="nav-name">My Tasks</span>
          <span className="nav-count">{personalPending}</span>
        </button>

        <p className="sidebar-label">
          Teams
          {teamsLoading && <span className="sidebar-loading">…</span>}
        </p>

        {teams.map((team) => (
          <button
            key={team.id}
            type="button"
            className={
              active.kind === 'team' && active.teamId === team.id
                ? 'nav-item is-active'
                : 'nav-item'
            }
            aria-current={
              active.kind === 'team' && active.teamId === team.id
                ? 'page'
                : undefined
            }
            onClick={() => onSelectTeam(team.id)}
            title={`${team.name} · ${team.memberCount} member${
              team.memberCount === 1 ? '' : 's'
            }`}
          >
            <UsersIcon />
            <span className="nav-name">{team.name}</span>
            <span className="nav-count">{team.memberCount}</span>
          </button>
        ))}

        {!teamsLoading && teams.length === 0 && (
          <p className="sidebar-empty">
            You are working solo. Create a team to share tasks and see each
            other&apos;s work.
          </p>
        )}

        <button type="button" className="sidebar-create" onClick={onCreateTeam}>
          <PlusIcon />
          Create a team
        </button>
      </nav>

      <p className="sidebar-hint">
        My Tasks stays private. Inside a team, everyone can see teammates&apos;
        tasks.
      </p>
    </aside>
  )
}

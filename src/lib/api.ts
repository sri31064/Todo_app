import type { Task } from '../types'

export interface User {
  id: string
  email: string
  createdAt: number
}

export type TeamRole = 'owner' | 'member'

export interface TeamSummary {
  id: string
  name: string
  ownerId: string
  ownerEmail: string
  createdAt: number
  role: TeamRole
  memberCount: number
}

export interface TeamMember {
  id: string
  email: string
  role: TeamRole
  joinedAt: number
}

export interface PendingInvite {
  email: string
  createdAt: number
  invitedByEmail: string
}

export interface MemberTaskGroup {
  user: { id: string; email: string }
  tasks: Task[]
}

export interface TeamDetail {
  id: string
  name: string
  ownerId: string
  ownerEmail: string
  createdAt: number
  role: TeamRole
  members: TeamMember[]
  pendingInvites: PendingInvite[]
  teamTasks: Task[]
  memberTasks: MemberTaskGroup[]
}

export interface TeamCreateResult extends TeamDetail {
  invited: { joined: number; pending: number }
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError(
      0,
      'Could not reach the server. Make sure it is running and try again.',
    )
  }

  if (response.status === 204) return undefined as T

  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    // Ignore non-JSON error pages; fall back to a generic message.
  }

  if (!response.ok) {
    const message =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed (${response.status}).`
    throw new ApiError(response.status, message)
  }

  return data as T
}

function teamPath(teamId: string, suffix = ''): string {
  return `/api/teams/${encodeURIComponent(teamId)}${suffix}`
}

export const api = {
  me(): Promise<{ user: User | null; joinedTeams: number }> {
    return request<{ user: User | null; joinedTeams: number }>('/api/auth/me')
  },

  signUp(
    email: string,
    password: string,
  ): Promise<{ user: User; joinedTeams: number }> {
    return request<{ user: User; joinedTeams: number }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },

  signIn(
    email: string,
    password: string,
  ): Promise<{ user: User; joinedTeams: number }> {
    return request<{ user: User; joinedTeams: number }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },

  signOut(): Promise<{ ok: true }> {
    return request<{ ok: true }>('/api/auth/logout', { method: 'POST' })
  },

  listTasks(): Promise<Task[]> {
    return request<{ tasks: Task[] }>('/api/tasks').then((data) => data.tasks)
  },

  saveTasks(tasks: Task[]): Promise<Task[]> {
    return request<{ tasks: Task[] }>('/api/tasks', {
      method: 'PUT',
      body: JSON.stringify({ tasks }),
    }).then((data) => data.tasks)
  },

  listTeams(): Promise<{ teams: TeamSummary[]; joinedTeams: number }> {
    return request<{ teams: TeamSummary[]; joinedTeams: number }>('/api/teams')
  },

  createTeam(name: string, emails: string[]): Promise<TeamCreateResult> {
    return request<TeamCreateResult>('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name, emails }),
    })
  },

  getTeam(teamId: string): Promise<TeamDetail> {
    return request<TeamDetail>(teamPath(teamId))
  },

  renameTeam(teamId: string, name: string): Promise<TeamDetail> {
    return request<TeamDetail>(teamPath(teamId), {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
  },

  deleteTeam(teamId: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(teamPath(teamId), { method: 'DELETE' })
  },

  addTeamMember(teamId: string, email: string): Promise<TeamDetail> {
    return request<TeamDetail>(teamPath(teamId, '/members'), {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },

  removeTeamMember(
    teamId: string,
    userId: string,
  ): Promise<{ ok: true; removedSelf: boolean }> {
    return request<{ ok: true; removedSelf: boolean }>(
      teamPath(teamId, `/members/${encodeURIComponent(userId)}`),
      { method: 'DELETE' },
    )
  },

  removeTeamInvite(teamId: string, email: string): Promise<TeamDetail> {
    return request<TeamDetail>(
      teamPath(teamId, `/invites/${encodeURIComponent(email)}`),
      { method: 'DELETE' },
    )
  },

  createTeamTask(teamId: string, task: Task): Promise<Task> {
    return request<{ task: Task }>(teamPath(teamId, '/tasks'), {
      method: 'POST',
      body: JSON.stringify({ task }),
    }).then((data) => data.task)
  },

  updateTeamTask(teamId: string, task: Task): Promise<Task> {
    return request<{ task: Task }>(
      teamPath(teamId, `/tasks/${encodeURIComponent(task.id)}`),
      {
        method: 'PATCH',
        body: JSON.stringify({ task }),
      },
    ).then((data) => data.task)
  },

  deleteTeamTask(teamId: string, taskId: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(
      teamPath(teamId, `/tasks/${encodeURIComponent(taskId)}`),
      { method: 'DELETE' },
    )
  },
}

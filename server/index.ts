import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const DIST_DIR = join(ROOT, 'dist')
const DB_PATH = process.env.DB_PATH ?? join(ROOT, 'server', 'data', 'todo.sqlite')
const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '127.0.0.1'

const SESSION_COOKIE = 'todo_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MAX_BODY_BYTES = 2 * 1024 * 1024
const MAX_TASKS = 1000
const MAX_TITLE_LENGTH = 200
const MAX_SUBTASK_LENGTH = 120
const MAX_COMMENT_LENGTH = 500
const MAX_COMPLETION_REASON_LENGTH = 500
const MAX_SUBTASKS = 200
const MAX_COMMENTS = 500
const MAX_TEAM_NAME = 80
const MAX_TEAM_MEMBERS = 100
const PRIORITIES = ['low', 'medium', 'high'] as const
const CATEGORIES = ['recreation', 'household', 'field', 'manual'] as const
const DEFAULT_CATEGORY = 'recreation'
const SUBCATEGORIES = ['level1', 'level2', 'level3', 'level4'] as const
const DEFAULT_SUBCATEGORY = 'level1'
const SCRYPT = { N: 16_384, r: 8, p: 1, keylen: 64 }

type Priority = (typeof PRIORITIES)[number]
type Category = (typeof CATEGORIES)[number]
type Subcategory = (typeof SUBCATEGORIES)[number]

interface TaskFields {
  id: string
  title: string
  done: boolean
  due: string | null
  priority: Priority
  category: Category
  subcategory: Subcategory
  createdAt: number
  completedAt: number | null
  completionReason: string | null
  subtasks: Array<{ id: string; title: string; done: boolean }>
  comments: Array<{ id: string; text: string; createdAt: number }>
}

interface StoredTask extends TaskFields {
  teamId: string | null
  ownerId: string
  ownerEmail: string
}

interface TaskRow {
  id: string
  user_id: string
  team_id: string | null
  title: string
  done: number
  due: string | null
  priority: string
  category: string
  subcategory: string
  created_at: number
  completed_at: number | null
  completion_reason: string | null
  subtasks: string
  comments: string
  owner_email: string
}

interface UserRow {
  id: string
  email: string
  created_at: number
}

interface TeamRow {
  id: string
  name: string
  owner_id: string
  created_at: number
  owner_email: string
}

interface MemberRow {
  user_id: string
  email: string
  role: string
  joined_at: number
}

interface InviteRow {
  email: string
  created_at: number
  invited_by_email: string
}

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

mkdirSync(dirname(DB_PATH), { recursive: true })
const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS team_members (
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (team_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS team_invites (
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (team_id, email)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    due TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    category TEXT NOT NULL DEFAULT 'recreation',
    subcategory TEXT NOT NULL DEFAULT 'level1',
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    completion_reason TEXT,
    subtasks TEXT NOT NULL DEFAULT '[]',
    comments TEXT NOT NULL DEFAULT '[]'
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_team_invites_email ON team_invites(email);
`)

// Older databases predate team tasks. Add the nullable column in place before
// creating any index that references it.
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all() as Array<{
  name: string
}>
if (!taskColumns.some((column) => column.name === 'team_id')) {
  db.exec('ALTER TABLE tasks ADD COLUMN team_id TEXT REFERENCES teams(id) ON DELETE CASCADE')
}
if (!taskColumns.some((column) => column.name === 'category')) {
  db.exec("ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT 'recreation'")
}
if (!taskColumns.some((column) => column.name === 'subcategory')) {
  db.exec("ALTER TABLE tasks ADD COLUMN subcategory TEXT NOT NULL DEFAULT 'level1'")
}
if (!taskColumns.some((column) => column.name === 'completion_reason')) {
  db.exec('ALTER TABLE tasks ADD COLUMN completion_reason TEXT')
}
db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id, created_at)')

const insertUser = db.prepare(
  'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
)
const findUserByEmail = db.prepare(
  'SELECT id, email, password_hash, created_at FROM users WHERE email = ?',
)
const findUserById = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?')
const insertSession = db.prepare(
  'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
)
const findSession = db.prepare(`
  SELECT u.id, u.email, u.created_at
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = ? AND s.expires_at > ?
`)
const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?')
const deleteExpiredSessions = db.prepare('DELETE FROM sessions WHERE expires_at <= ?')

const insertTask = db.prepare(`
  INSERT INTO tasks
    (id, user_id, team_id, title, done, due, priority, category, subcategory, created_at, completed_at, completion_reason, subtasks, comments)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
const deletePersonalTasks = db.prepare(
  'DELETE FROM tasks WHERE user_id = ? AND team_id IS NULL',
)
const listPersonalTasks = db.prepare(`
  SELECT t.*, u.email AS owner_email
  FROM tasks t
  JOIN users u ON u.id = t.user_id
  WHERE t.user_id = ? AND t.team_id IS NULL
  ORDER BY t.created_at ASC
`)
const listTeamTasks = db.prepare(`
  SELECT t.*, u.email AS owner_email
  FROM tasks t
  JOIN users u ON u.id = t.user_id
  WHERE t.team_id = ?
  ORDER BY t.created_at ASC
`)
const findTeamTask = db.prepare(`
  SELECT t.*, u.email AS owner_email
  FROM tasks t
  JOIN users u ON u.id = t.user_id
  WHERE t.id = ? AND t.team_id = ?
`)
const updateTeamTask = db.prepare(`
  UPDATE tasks
  SET title = ?, done = ?, due = ?, priority = ?, category = ?, subcategory = ?, completed_at = ?, completion_reason = ?, subtasks = ?, comments = ?
  WHERE id = ? AND team_id = ?
`)
const deleteTeamTask = db.prepare('DELETE FROM tasks WHERE id = ? AND team_id = ?')

const insertTeam = db.prepare(
  'INSERT INTO teams (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)',
)
const findTeam = db.prepare(`
  SELECT t.id, t.name, t.owner_id, t.created_at, u.email AS owner_email
  FROM teams t
  JOIN users u ON u.id = t.owner_id
  WHERE t.id = ?
`)
const listTeamsForUser = db.prepare(`
  SELECT
    t.id,
    t.name,
    t.owner_id,
    t.created_at,
    u.email AS owner_email,
    mine.role AS role,
    (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) AS member_count
  FROM teams t
  JOIN team_members mine ON mine.team_id = t.id AND mine.user_id = ?
  JOIN users u ON u.id = t.owner_id
  ORDER BY t.created_at ASC, t.name ASC
`)
const updateTeamName = db.prepare('UPDATE teams SET name = ? WHERE id = ?')
const deleteTeam = db.prepare('DELETE FROM teams WHERE id = ?')

const insertMember = db.prepare(
  `INSERT OR IGNORE INTO team_members (team_id, user_id, role, joined_at)
   VALUES (?, ?, ?, ?)`,
)
const findMembership = db.prepare(
  'SELECT role, joined_at FROM team_members WHERE team_id = ? AND user_id = ?',
)
const listMembers = db.prepare(`
  SELECT tm.user_id, u.email, tm.role, tm.joined_at
  FROM team_members tm
  JOIN users u ON u.id = tm.user_id
  WHERE tm.team_id = ?
  ORDER BY tm.joined_at ASC, u.email ASC
`)
const deleteMember = db.prepare(
  'DELETE FROM team_members WHERE team_id = ? AND user_id = ?',
)

const insertInvite = db.prepare(
  `INSERT OR IGNORE INTO team_invites (team_id, email, invited_by, created_at)
   VALUES (?, ?, ?, ?)`,
)
const findInvite = db.prepare(
  'SELECT email FROM team_invites WHERE team_id = ? AND email = ?',
)
const listInvites = db.prepare(`
  SELECT ti.email, ti.created_at, u.email AS invited_by_email
  FROM team_invites ti
  JOIN users u ON u.id = ti.invited_by
  WHERE ti.team_id = ?
  ORDER BY ti.created_at ASC
`)
const listInvitesForEmail = db.prepare(
  'SELECT team_id FROM team_invites WHERE email = ?',
)
const deleteInvite = db.prepare(
  'DELETE FROM team_invites WHERE team_id = ? AND email = ?',
)

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(JSON.stringify(data))
}

function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendJson(res, error.status, { error: error.message })
    return
  }

  console.error('Unexpected API error:', error)
  sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let size = 0

    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Request is too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw.trim()) {
        reject(new HttpError(400, 'A JSON body is required.'))
        return
      }
      try {
        resolveBody(JSON.parse(raw))
      } catch {
        reject(new HttpError(400, 'Invalid JSON body.'))
      }
    })
    req.on('error', reject)
  })
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies

  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (name) cookies[name] = decodeURIComponent(value)
  }

  return cookies
}

function sessionCookie(token: string, maxAgeSeconds: number): string {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function currentUser(req: IncomingMessage): UserRow | null {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (!token) return null

  const row = findSession.get(hashToken(token), Date.now())
  return (row as UserRow | undefined) ?? null
}

function requireUser(req: IncomingMessage): UserRow {
  const user = currentUser(req)
  if (!user) throw new HttpError(401, 'Please sign in to continue.')
  return user
}

function scryptKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolveKey, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT.keylen,
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error)
        else resolveKey(key)
      },
    )
  })
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptKey(password, salt)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${key.toString('hex')}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const salt = Buffer.from(parts[4], 'hex')
  const expected = Buffer.from(parts[5], 'hex')

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false

  const key = await new Promise<Buffer>((resolveKey, reject) => {
    scrypt(
      password,
      salt,
      expected.length,
      { N, r, p, maxmem: 64 * 1024 * 1024 },
      (error, derived) => {
        if (error) reject(error)
        else resolveKey(derived)
      },
    )
  })

  return key.length === expected.length && timingSafeEqual(key, expected)
}

// A real hash to compare against when an email is unknown, so login timing
// doesn't reveal whether an account exists.
const DUMMY_PASSWORD_HASH = await hashPassword('this-is-not-a-real-password')

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'Email is required.')
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.')
  }
  return email
}

function parsePassword(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'Password is required.')
  if (value.length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters.')
  }
  if (value.length > 200) {
    throw new HttpError(400, 'Password must be 200 characters or fewer.')
  }
  return value
}

function parseTeamName(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'Team name is required.')
  const name = value.trim().replace(/\s+/g, ' ').slice(0, MAX_TEAM_NAME)
  if (!name) throw new HttpError(400, 'Team name is required.')
  return name
}

function parseEmailList(value: unknown): string[] {
  const parts: string[] = []

  if (typeof value === 'string') {
    parts.push(...value.split(/[\s,;]+/))
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') parts.push(...item.split(/[\s,;]+/))
    }
  }

  const emails = new Set<string>()
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    emails.add(normalizeEmail(trimmed))
    if (emails.size > MAX_TEAM_MEMBERS) {
      throw new HttpError(400, `You can add up to ${MAX_TEAM_MEMBERS} people at a time.`)
    }
  }

  return [...emails]
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value)
}

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function parseSubtask(value: unknown): TaskFields['subtasks'][number] | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (typeof item.title !== 'string') return null

  const title = item.title.trim().slice(0, MAX_SUBTASK_LENGTH)
  if (!title) return null

  return {
    id: isSafeId(item.id) ? item.id : randomUUID(),
    title,
    done: Boolean(item.done),
  }
}

function parseComment(value: unknown): TaskFields['comments'][number] | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (typeof item.text !== 'string') return null

  const text = item.text.trim().slice(0, MAX_COMMENT_LENGTH)
  if (!text) return null

  return {
    id: isSafeId(item.id) ? item.id : randomUUID(),
    text,
    createdAt:
      typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) && item.createdAt > 0
        ? item.createdAt
        : Date.now(),
  }
}

function parseTask(value: unknown): TaskFields {
  if (!value || typeof value !== 'object') {
    throw new HttpError(400, 'Task data is invalid.')
  }

  const item = value as Record<string, unknown>
  if (typeof item.title !== 'string') {
    throw new HttpError(400, 'Every task needs a title.')
  }

  const title = item.title.trim().slice(0, MAX_TITLE_LENGTH)
  if (!title) throw new HttpError(400, 'Every task needs a title.')

  const priority = PRIORITIES.includes(item.priority as Priority)
    ? (item.priority as Priority)
    : 'medium'
  const category = CATEGORIES.includes(item.category as Category)
    ? (item.category as Category)
    : DEFAULT_CATEGORY
  const subcategory = SUBCATEGORIES.includes(item.subcategory as Subcategory)
    ? (item.subcategory as Subcategory)
    : DEFAULT_SUBCATEGORY
  const done = Boolean(item.done)

  return {
    id: isSafeId(item.id) ? item.id : randomUUID(),
    title,
    done,
    due:
      typeof item.due === 'string' && isValidISODate(item.due) ? item.due : null,
    priority,
    category,
    subcategory,
    createdAt:
      typeof item.createdAt === 'number' &&
      Number.isFinite(item.createdAt) &&
      item.createdAt > 0
        ? item.createdAt
        : Date.now(),
    completedAt:
      done &&
      typeof item.completedAt === 'number' &&
      Number.isFinite(item.completedAt) &&
      item.completedAt > 0
        ? item.completedAt
        : null,
    completionReason:
      typeof item.completionReason === 'string'
        ? item.completionReason.trim().slice(0, MAX_COMPLETION_REASON_LENGTH) || null
        : null,
    subtasks: Array.isArray(item.subtasks)
      ? item.subtasks
          .slice(0, MAX_SUBTASKS)
          .map(parseSubtask)
          .filter(
            (subtask): subtask is TaskFields['subtasks'][number] => subtask !== null,
          )
      : [],
    comments: Array.isArray(item.comments)
      ? item.comments
          .slice(0, MAX_COMMENTS)
          .map(parseComment)
          .filter(
            (comment): comment is TaskFields['comments'][number] => comment !== null,
          )
      : [],
  }
}

function parseTaskList(value: unknown): TaskFields[] {
  if (!Array.isArray(value)) throw new HttpError(400, 'Tasks must be an array.')
  if (value.length > MAX_TASKS) {
    throw new HttpError(400, `You can store up to ${MAX_TASKS} tasks.`)
  }

  const seen = new Set<string>()
  return value.map((item) => {
    const task = parseTask(item)
    if (seen.has(task.id)) task.id = randomUUID()
    seen.add(task.id)
    return task
  })
}

function taskFromRow(row: TaskRow): StoredTask {
  return {
    id: row.id,
    title: row.title,
    done: row.done === 1,
    due: row.due,
    priority: PRIORITIES.includes(row.priority as Priority)
      ? (row.priority as Priority)
      : 'medium',
    category: CATEGORIES.includes(row.category as Category)
      ? (row.category as Category)
      : DEFAULT_CATEGORY,
    subcategory: SUBCATEGORIES.includes(row.subcategory as Subcategory)
      ? (row.subcategory as Subcategory)
      : DEFAULT_SUBCATEGORY,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    completionReason: row.completion_reason,
    subtasks: JSON.parse(row.subtasks) as TaskFields['subtasks'],
    comments: JSON.parse(row.comments) as TaskFields['comments'],
    teamId: row.team_id,
    ownerId: row.user_id,
    ownerEmail: row.owner_email,
  }
}

function insertTaskRow(
  task: TaskFields,
  userId: string,
  teamId: string | null,
): void {
  insertTask.run(
    task.id,
    userId,
    teamId,
    task.title,
    task.done ? 1 : 0,
    task.due,
    task.priority,
    task.category,
    task.subcategory,
    task.createdAt,
    task.completedAt,
    task.completionReason,
    JSON.stringify(task.subtasks),
    JSON.stringify(task.comments),
  )
}

function saveTasksForUser(userId: string, tasks: TaskFields[]): StoredTask[] {
  db.exec('BEGIN IMMEDIATE')
  try {
    deletePersonalTasks.run(userId)
    for (const task of tasks) insertTaskRow(task, userId, null)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return (listPersonalTasks.all(userId) as unknown as TaskRow[]).map(taskFromRow)
}

function startSession(userId: string): string {
  deleteExpiredSessions.run(Date.now())
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  insertSession.run(hashToken(token), userId, now, now + SESSION_TTL_MS)
  return token
}

function publicUser(user: UserRow): { id: string; email: string; createdAt: number } {
  return { id: user.id, email: user.email, createdAt: user.created_at }
}

function claimPendingInvites(user: UserRow): number {
  const invites = listInvitesForEmail.all(user.email) as Array<{ team_id: string }>
  if (invites.length === 0) return 0

  let joined = 0
  db.exec('BEGIN IMMEDIATE')
  try {
    const now = Date.now()
    for (const invite of invites) {
      const existing = findMembership.get(invite.team_id, user.id)
      insertMember.run(invite.team_id, user.id, 'member', now)
      deleteInvite.run(invite.team_id, user.email)
      if (!existing) joined += 1
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return joined
}

interface TeamSummary {
  id: string
  name: string
  ownerId: string
  ownerEmail: string
  createdAt: number
  role: 'owner' | 'member'
  memberCount: number
}

function listTeams(userId: string): TeamSummary[] {
  const rows = listTeamsForUser.all(userId) as unknown as Array<{
    id: string
    name: string
    owner_id: string
    owner_email: string
    created_at: number
    role: string
    member_count: number
  }>

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    ownerEmail: row.owner_email,
    createdAt: row.created_at,
    role: row.role === 'owner' ? 'owner' : 'member',
    memberCount: row.member_count,
  }))
}

interface TeamDetail {
  id: string
  name: string
  ownerId: string
  ownerEmail: string
  createdAt: number
  role: 'owner' | 'member'
  members: Array<{
    id: string
    email: string
    role: 'owner' | 'member'
    joinedAt: number
  }>
  pendingInvites: Array<{
    email: string
    createdAt: number
    invitedByEmail: string
  }>
  teamTasks: StoredTask[]
  memberTasks: Array<{
    user: { id: string; email: string }
    tasks: StoredTask[]
  }>
}

function requireMembership(teamId: string, userId: string): string {
  const membership = findMembership.get(teamId, userId) as
    | { role: string }
    | undefined
  if (!membership) throw new HttpError(403, 'You are not a member of this team.')
  return membership.role
}

function teamDetail(teamId: string, viewer: UserRow): TeamDetail {
  const team = findTeam.get(teamId) as TeamRow | undefined
  if (!team) throw new HttpError(404, 'Team not found.')

  const role = requireMembership(teamId, viewer.id)
  const members = listMembers.all(teamId) as unknown as MemberRow[]
  const pendingInvites =
    role === 'owner'
      ? (listInvites.all(teamId) as unknown as InviteRow[]).map((invite) => ({
          email: invite.email,
          createdAt: invite.created_at,
          invitedByEmail: invite.invited_by_email,
        }))
      : []

  return {
    id: team.id,
    name: team.name,
    ownerId: team.owner_id,
    ownerEmail: team.owner_email,
    createdAt: team.created_at,
    role: role === 'owner' ? 'owner' : 'member',
    members: members.map((member) => ({
      id: member.user_id,
      email: member.email,
      role: member.role === 'owner' ? 'owner' : 'member',
      joinedAt: member.joined_at,
    })),
    pendingInvites,
    teamTasks: (listTeamTasks.all(teamId) as unknown as TaskRow[]).map(taskFromRow),
    memberTasks: members.map((member) => ({
      user: { id: member.user_id, email: member.email },
      tasks: (listPersonalTasks.all(member.user_id) as unknown as TaskRow[]).map(
        taskFromRow,
      ),
    })),
  }
}

function requireOwner(teamId: string, viewer: UserRow): TeamRow {
  const team = findTeam.get(teamId) as TeamRow | undefined
  if (!team) throw new HttpError(404, 'Team not found.')
  const role = requireMembership(teamId, viewer.id)
  if (role !== 'owner' && team.owner_id !== viewer.id) {
    throw new HttpError(403, 'Only the team owner can do that.')
  }
  return team
}

function teamTaskFromBody(value: unknown): TaskFields {
  if (!value || typeof value !== 'object') {
    throw new HttpError(400, 'Task data is invalid.')
  }

  const body = value as Record<string, unknown>
  return parseTask(body.task ?? body)
}

async function handleTeams(
  req: IncomingMessage,
  res: ServerResponse,
  segments: string[],
): Promise<void> {
  const user = requireUser(req)
  const joined = claimPendingInvites(user)

  if (segments.length === 2) {
    if (req.method === 'GET') {
      sendJson(res, 200, { teams: listTeams(user.id), joinedTeams: joined })
      return
    }

    if (req.method === 'POST') {
      const body = (await readJsonBody(req)) as Record<string, unknown>
      const name = parseTeamName(body.name)
      const emails = parseEmailList(body.emails).filter(
        (email) => email !== user.email,
      )

      const teamId = randomUUID()
      const createdAt = Date.now()
      let joinedCount = 0
      let pendingCount = 0

      db.exec('BEGIN IMMEDIATE')
      try {
        insertTeam.run(teamId, name, user.id, createdAt)
        insertMember.run(teamId, user.id, 'owner', createdAt)
        for (const email of emails) {
          const target = findUserByEmail.get(email) as UserRow | undefined
          if (target) {
            const result = insertMember.run(teamId, target.id, 'member', createdAt)
            if (result.changes > 0) joinedCount += 1
          } else {
            const result = insertInvite.run(teamId, email, user.id, createdAt)
            if (result.changes > 0) pendingCount += 1
          }
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }

      sendJson(res, 201, {
        ...teamDetail(teamId, user),
        invited: { joined: joinedCount, pending: pendingCount },
      })
      return
    }

    throw new HttpError(405, 'Method not allowed.')
  }

  const teamId = segments[2]
  if (!isSafeId(teamId)) throw new HttpError(404, 'Team not found.')

  if (segments.length === 3) {
    if (req.method === 'GET') {
      sendJson(res, 200, teamDetail(teamId, user))
      return
    }

    if (req.method === 'PATCH') {
      requireOwner(teamId, user)
      const body = (await readJsonBody(req)) as Record<string, unknown>
      const name = parseTeamName(body.name)
      updateTeamName.run(name, teamId)
      sendJson(res, 200, teamDetail(teamId, user))
      return
    }

    if (req.method === 'DELETE') {
      requireOwner(teamId, user)
      deleteTeam.run(teamId)
      sendJson(res, 200, { ok: true })
      return
    }

    throw new HttpError(405, 'Method not allowed.')
  }

  if (segments[3] === 'tasks') {
    requireMembership(teamId, user.id)

    if (segments.length === 4 && req.method === 'POST') {
      const body = (await readJsonBody(req)) as Record<string, unknown>
      const task = teamTaskFromBody(body)
      try {
        insertTaskRow(task, user.id, teamId)
      } catch (error) {
        if (String(error).includes('UNIQUE constraint failed')) {
          throw new HttpError(409, 'That task id is already in use.')
        }
        throw error
      }
      const row = findTeamTask.get(task.id, teamId) as TaskRow | undefined
      if (!row) throw new HttpError(500, 'Could not create the task.')
      sendJson(res, 201, { task: taskFromRow(row) })
      return
    }

    const taskId = segments[4]
    if (segments.length !== 5 || !isSafeId(taskId)) {
      throw new HttpError(404, 'Task not found.')
    }

    const existing = findTeamTask.get(taskId, teamId) as TaskRow | undefined
    if (!existing) throw new HttpError(404, 'Task not found.')

    if (req.method === 'PATCH') {
      const body = (await readJsonBody(req)) as Record<string, unknown>
      const task = teamTaskFromBody(body)
      task.id = taskId
      updateTeamTask.run(
        task.title,
        task.done ? 1 : 0,
        task.due,
        task.priority,
        task.category,
        task.subcategory,
        task.completedAt,
        task.completionReason,
        JSON.stringify(task.subtasks),
        JSON.stringify(task.comments),
        taskId,
        teamId,
      )
      const row = findTeamTask.get(taskId, teamId) as TaskRow | undefined
      if (!row) throw new HttpError(500, 'Could not update the task.')
      sendJson(res, 200, { task: taskFromRow(row) })
      return
    }

    if (req.method === 'DELETE') {
      deleteTeamTask.run(taskId, teamId)
      sendJson(res, 200, { ok: true })
      return
    }

    throw new HttpError(405, 'Method not allowed.')
  }

  if (segments[3] === 'members') {
    if (segments.length === 4 && req.method === 'POST') {
      requireOwner(teamId, user)
      const body = (await readJsonBody(req)) as Record<string, unknown>
      const email = normalizeEmail(body.email)
      if (email === user.email) {
        throw new HttpError(400, 'You are already on this team.')
      }

      const target = findUserByEmail.get(email) as UserRow | undefined
      if (target) {
        if (findMembership.get(teamId, target.id)) {
          throw new HttpError(409, 'That person is already on the team.')
        }
        insertMember.run(teamId, target.id, 'member', Date.now())
      } else {
        if (findInvite.get(teamId, email)) {
          throw new HttpError(409, 'That email is already invited.')
        }
        insertInvite.run(teamId, email, user.id, Date.now())
      }

      sendJson(res, 200, teamDetail(teamId, user))
      return
    }

    const memberId = segments[4]
    if (segments.length === 5 && req.method === 'DELETE' && isSafeId(memberId)) {
      const team = findTeam.get(teamId) as TeamRow | undefined
      if (!team) throw new HttpError(404, 'Team not found.')
      const role = requireMembership(teamId, user.id)

      if (memberId === team.owner_id) {
        throw new HttpError(400, 'The team owner must delete the team instead of leaving.')
      }
      if (memberId !== user.id && role !== 'owner') {
        throw new HttpError(403, 'Only the team owner can remove other members.')
      }

      deleteMember.run(teamId, memberId)
      sendJson(res, 200, { ok: true, removedSelf: memberId === user.id })
      return
    }

    throw new HttpError(404, 'Member not found.')
  }

  if (segments[3] === 'invites') {
    if (segments.length === 5 && req.method === 'DELETE') {
      requireOwner(teamId, user)
      let email: string
      try {
        email = normalizeEmail(decodeURIComponent(segments[4] ?? ''))
      } catch {
        throw new HttpError(400, 'Enter a valid email address.')
      }
      deleteInvite.run(teamId, email)
      sendJson(res, 200, teamDetail(teamId, user))
      return
    }

    throw new HttpError(404, 'Invite not found.')
  }

  throw new HttpError(404, 'Not found.')
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = currentUser(req)
    const joinedTeams = user ? claimPendingInvites(user) : 0
    sendJson(res, 200, {
      user: user ? publicUser(user) : null,
      joinedTeams,
    })
    return
  }

  if (pathname === '/api/auth/signup' && req.method === 'POST') {
    const body = (await readJsonBody(req)) as Record<string, unknown>
    const email = normalizeEmail(body.email)
    const password = parsePassword(body.password)

    if (findUserByEmail.get(email)) {
      throw new HttpError(409, 'An account with this email already exists.')
    }

    const id = randomUUID()
    const createdAt = Date.now()
    try {
      insertUser.run(id, email, await hashPassword(password), createdAt)
    } catch (error) {
      if (String(error).includes('UNIQUE constraint failed')) {
        throw new HttpError(409, 'An account with this email already exists.')
      }
      throw error
    }

    const user = findUserById.get(id) as UserRow | undefined
    if (!user) throw new HttpError(500, 'Could not create the account.')

    const joinedTeams = claimPendingInvites(user)
    const token = startSession(id)
    res.setHeader('Set-Cookie', sessionCookie(token, SESSION_TTL_MS / 1000))
    sendJson(res, 201, { user: publicUser(user), joinedTeams })
    return
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = (await readJsonBody(req)) as Record<string, unknown>
    const email = normalizeEmail(body.email)
    if (typeof body.password !== 'string') {
      throw new HttpError(400, 'Password is required.')
    }

    const record = findUserByEmail.get(email) as
      | (UserRow & { password_hash: string })
      | undefined
    const valid = await verifyPassword(
      body.password,
      record?.password_hash ?? DUMMY_PASSWORD_HASH,
    )

    if (!record || !valid) {
      throw new HttpError(401, 'Incorrect email or password.')
    }

    const joinedTeams = claimPendingInvites({
      id: record.id,
      email: record.email,
      created_at: record.created_at,
    })
    const token = startSession(record.id)
    res.setHeader('Set-Cookie', sessionCookie(token, SESSION_TTL_MS / 1000))
    sendJson(res, 200, {
      user: publicUser({
        id: record.id,
        email: record.email,
        created_at: record.created_at,
      }),
      joinedTeams,
    })
    return
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    if (token) deleteSession.run(hashToken(token))
    res.setHeader('Set-Cookie', sessionCookie('', 0))
    sendJson(res, 200, { ok: true })
    return
  }

  const segments = pathname.split('/').filter(Boolean)

  if (segments[0] === 'api' && segments[1] === 'teams') {
    await handleTeams(req, res, segments)
    return
  }

  if (pathname === '/api/tasks') {
    const user = requireUser(req)

    if (req.method === 'GET') {
      const rows = listPersonalTasks.all(user.id) as unknown as TaskRow[]
      sendJson(res, 200, { tasks: rows.map(taskFromRow) })
      return
    }

    if (req.method === 'PUT') {
      const body = (await readJsonBody(req)) as Record<string, unknown>
      const tasks = parseTaskList(body.tasks)
      sendJson(res, 200, { tasks: saveTasksForUser(user.id, tasks) })
      return
    }

    throw new HttpError(405, 'Method not allowed.')
  }

  throw new HttpError(404, 'Not found.')
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
}

function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Method not allowed')
    return
  }

  if (!existsSync(DIST_DIR)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('The app has not been built yet. Run "npm run build".')
    return
  }

  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Bad request')
    return
  }

  const requested = normalize(join(DIST_DIR, decoded === '/' ? 'index.html' : decoded))
  if (requested !== DIST_DIR && !requested.startsWith(DIST_DIR + sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Forbidden')
    return
  }

  let filePath = requested
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(DIST_DIR, 'index.html')
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  const isHashedAsset = pathname.startsWith('/assets/')
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(filePath).pipe(res)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (url.pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, url.pathname)
    } catch (error) {
      if (!res.headersSent) sendError(res, error)
      else res.end()
    }
    return
  }

  serveStatic(req, res, url.pathname)
})

server.listen(PORT, HOST, () => {
  console.log(`To-do API listening on http://${HOST}:${PORT}`)
  console.log(`Database: ${DB_PATH}`)
})

function shutdown(): void {
  server.close(() => {
    db.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 3000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

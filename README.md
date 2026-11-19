# My Tasks

A multi-user to-do app built with **React 19**, **TypeScript**, and **Vite 8**, backed by a small **Node.js HTTP API** and **SQLite**.

Every task belongs to the account that created it. Sign up with an email and password, and your personal task list, deadlines, parts, and notes follow that account across sign-ins and devices. Create a **team** to share a common task list and see what everyone else is working on.

## Teams

- **My Tasks** is private. Personal tasks are only editable by their owner.
- The sidebar lists **My Tasks** and every team you belong to.
- The host creates a team and invites people by **email address**. Existing accounts join immediately; emails without an account stay as pending invites and join automatically when that person signs up.
- Inside a team, the **Team tasks** tab is a shared list: any member can add, edit, complete, and delete tasks there.
- The **People's tasks** tab shows every member's personal tasks read-only so the team can monitor progress. Teammates still edit their own personal tasks from **My Tasks**.
- Any member can leave a team. The host can rename the team, add or remove members, cancel pending invites, or delete the team (which deletes its shared tasks but never anyone's personal tasks).
- Team views refresh every 20 seconds and whenever the window regains focus, while skipping refreshes during pending saves.


## Requirements

- **Node.js 24 or newer** — the server uses the built-in `node:sqlite` module.
- npm (bundled with Node).

## Getting started

```sh
npm install
npm run dev
```

`npm run dev` starts both processes:

- the API on <http://127.0.0.1:8787>
- the Vite dev server on <http://localhost:5173> (opens automatically)

Vite proxies `/api` requests to the API, so open <http://localhost:5173>. Running plain `vite` is not enough — the auth endpoints would be missing.

## Production

```sh
npm run build
npm start
```

`npm run build` type-checks the app and the server, then writes the client bundle to `dist/`. `npm start` serves both the built client and the API from the same Node process on port `8787` (override with `PORT`).

## Scripts

| Script              | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | Start the API and Vite together with hot module replacement  |
| `npm run dev:web`   | Start only Vite (needs `npm run dev:api` separately)         |
| `npm run dev:api`   | Start only the API with `--watch`                            |
| `npm run typecheck` | Type-check the app, Vite config, and server                  |
| `npm run build`     | Type-check, then produce a production client build           |
| `npm start`         | Serve the production build and API from one Node process     |
| `npm run preview`   | Alias for `npm start`                                        |

## Accounts and security

- **Sign up / sign in** with email and password on a dedicated auth screen.
- Passwords are hashed with **scrypt** using a random 16-byte salt per account. Plaintext passwords are never stored.
- Sessions use a random 32-byte token. Only its **SHA-256 hash** is stored in SQLite.
- The session token travels in an **HttpOnly**, `SameSite=Lax` cookie (`todo_session`) and lasts 30 days.
- API routes reject unauthenticated requests with `401`; task queries are always filtered by the signed-in user's id.
- Signing out deletes the server session and clears the cookie.
- Login compares against a dummy hash for unknown emails, so response timing does not reveal whether an account exists.
- Emails are trimmed and lowercased; duplicate sign-ups are rejected with `409`, including concurrent races.
- Password rules: 8–200 characters. Email must be a valid address (max 254 characters).

**Before exposing the app publicly:** serve it over HTTPS and set `COOKIE_SECURE=1` so the session cookie is marked `Secure`. Password reset, email verification, and login rate limiting are not implemented yet.

## How tasks are stored

- Tasks live in SQLite in `server/data/todo.sqlite` and are scoped by `user_id`.
- Personal tasks have `team_id IS NULL`; shared team tasks point at a team.
- The client saves personal changes with a 250 ms debounce and serializes requests, sending the current personal list to `PUT /api/tasks`. This endpoint only replaces personal tasks, so it can never overwrite shared team tasks.
- Team tasks use per-task `POST` / `PATCH` / `DELETE` requests, with one serialized save queue per task, so one teammate's edit cannot replace the whole shared list.
- If a save fails, a banner appears with **Retry**. A `401` means the session expired, so the app returns to the sign-in screen.
- Auth state stays on the server; nothing except legacy task data is kept in `localStorage`.

### Existing local tasks

When a signed-in user opens the app, it scans the current browser for task lists left by the earlier localStorage-only version (including `todo-app-v1` and renamed keys). Any tasks found are merged into the account without duplicating existing ones. The local copy is cleared only after the merged list has been saved successfully, and a toast reports how many were imported. If the save fails, a banner offers **Retry** and the browser data is kept.

Because browser storage is per browser and per origin, open the app in the browser and at the URL where the old tasks were created (for example, `http://localhost:5173`). Tasks added to one account are never imported into a different account.

## API

| Method   | Path                                  | Description                                           |
| -------- | ------------------------------------- | ----------------------------------------------------- |
| `GET`    | `/api/auth/me`                        | Current user, or `{ user: null }`                     |
| `POST`   | `/api/auth/signup`                    | Create an account and start a session                 |
| `POST`   | `/api/auth/login`                     | Sign in and start a session                           |
| `POST`   | `/api/auth/logout`                    | End the session and clear the cookie                  |
| `GET`    | `/api/tasks`                          | List the signed-in user's personal tasks              |
| `PUT`    | `/api/tasks`                          | Replace the signed-in user's personal task list       |
| `GET`    | `/api/teams`                          | List teams the signed-in user belongs to              |
| `POST`   | `/api/teams`                          | Create a team and invite emails                       |
| `GET`    | `/api/teams/:id`                      | Team detail, shared tasks, and members' personal tasks |
| `PATCH`  | `/api/teams/:id`                      | Rename a team (host only)                             |
| `DELETE` | `/api/teams/:id`                      | Delete a team and its shared tasks (host only)        |
| `POST`   | `/api/teams/:id/members`              | Add a member or pending invite by email (host only)   |
| `DELETE` | `/api/teams/:id/members/:userId`      | Remove a member, or leave the team                    |
| `DELETE` | `/api/teams/:id/invites/:email`       | Cancel a pending invite (host only)                   |
| `POST`   | `/api/teams/:id/tasks`                | Create a shared team task (members)                   |
| `PATCH`  | `/api/teams/:id/tasks/:taskId`        | Update a shared team task (members)                   |
| `DELETE` | `/api/teams/:id/tasks/:taskId`        | Delete a shared team task (members)                   |

JSON bodies use `{ "email", "password" }` for auth, `{ "tasks": [...] }` for personal task saves, `{ "name", "emails": [...] }` for team creation, and `{ "task": {...} }` for team task writes. Team and invite operations return the refreshed team detail.

### Environment variables

| Variable        | Default                        | Purpose                                  |
| --------------- | ------------------------------ | ---------------------------------------- |
| `PORT`          | `8787`                         | API / production server port             |
| `HOST`          | `127.0.0.1`                    | Bind address                             |
| `DB_PATH`       | `server/data/todo.sqlite`      | SQLite database file                     |
| `COOKIE_SECURE` | unset                          | Set to `1` to add `Secure` to the cookie |

## Features

- Private multi-user accounts with server-side sessions
- **My Tasks** and a sidebar listing every team you belong to
- Create teams and invite people by email, with automatic joining for pending invites
- Shared **team tasks** that any member can add, edit, complete, or delete
- Read-only **People's tasks** view for monitoring teammates' personal progress
- Host controls for renaming a team, managing members and invites, and deleting the team
- Add tasks with an optional **deadline**, Low / Medium / High priority, a category (Recreation, Household work, Field work, or Manual work), and a sub category (Level 1, Level 2, or Level 3)
- Smart deadline labels: “Due today”, “Due in 3 days”, or “Overdue by 2 days”
- Break a task into **checklist parts** with automatic progress (count, percent, and bar)
- Log timestamped **progress notes** on each task, with undo when deleting notes or parts
- Complete, edit in place (double-click a title), and delete with undo
- Filter by **All / Pending / Overdue / Completed**, with live counts and instant search
- Completed tasks keep their full history: deadline, priority, category, sub category, added/completed times, parts, and notes
- Open any task — including completed ones — to see every detail and keep editing its parts or notes
- Clear completed tasks in bulk, with undo
- Light theme throughout, with no dark-mode switch
- Responsive layout and keyboard-friendly controls (`/` focuses search)
- Session survives page reloads; signing out hides all tasks immediately

## Project structure

```
src/
  App.tsx                 Session restore, personal + team state, save queues
  main.tsx                React entry point
  components/
    AuthScreen            Sign-in / sign-up screen and loading state
    Sidebar               My Tasks and team navigation
    TeamView              Shared team tasks and read-only people's tasks
    TeamDialogs           Create/manage team, invites, rename, delete, leave
    Header, AddTaskForm, Toolbar, TaskList, TaskItem
    TaskDetails           Per-task parts and progress notes
    EmptyState, Toast, icons
  hooks/                  useToast
  lib/
    api.ts                Typed client for auth, personal tasks, and teams
    date.ts               Date helpers
    tasks.ts              Task logic and validation limits
    storage.ts            Legacy localStorage read/clear for migration
  styles/global.css       Design tokens and all styles
  types.ts                Task, Subtask, TaskComment, team, and shared types

server/
  index.ts                HTTP API, SQLite schema, scrypt auth, sessions,
                          personal + team tasks, and static serving of dist/
  dev.ts                  Runs the API and Vite together for npm run dev
  data/todo.sqlite        Runtime database (gitignored)

public/favicon.svg
vite.config.ts            React plugin, @ alias, /api proxy, build options
tsconfig.server.json      TypeScript config for server/
```

## Notes

- The database directory is created automatically and `server/data` is gitignored. Existing databases are migrated in place by adding the nullable `tasks.team_id` column.
- `PUT /api/tasks` replaces only the user's personal tasks inside a transaction, so a failed save cannot leave a half-written list or touch shared team tasks.
- Server limits: up to 1,000 tasks per account, 200 parts and 500 notes per task, 100 emails per invite batch, and 2 MB request bodies.

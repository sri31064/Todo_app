import { spawn } from 'node:child_process'

const api = spawn(process.execPath, ['--watch', 'server/index.ts'], {
  stdio: 'inherit',
})

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
  stdio: 'inherit',
})

let shuttingDown = false

function shutdown(code = 0): void {
  if (shuttingDown) return
  shuttingDown = true
  api.kill('SIGTERM')
  vite.kill('SIGTERM')
  setTimeout(() => process.exit(code), 200).unref()
}

api.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`API server stopped (exit code ${code ?? 0}).`)
    shutdown(code ?? 1)
  }
})

vite.on('exit', (code) => {
  if (!shuttingDown) shutdown(code ?? 0)
})

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

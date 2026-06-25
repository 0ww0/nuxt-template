// server/utils/logger.ts
import { appendFile, readdir, unlink } from 'fs/promises'
import { mkdirSync } from 'fs'
import { resolve } from 'path'

const logDir = resolve('./logs')

// Synchronous mkdir at module init — runs once on startup, acceptable.
mkdirSync(logDir, { recursive: true })

// Retention: keep this many days of date-stamped log files. Without this the
// ./logs directory grows without bound and eventually fills the disk (an
// availability risk an attacker can accelerate with cheap request volume).
const RETENTION_DAYS = 14
const LOG_FILE_RE = /^\d{4}-\d{2}-\d{2}\.log$/

let lastPruneDay = ''

// Delete log files older than RETENTION_DAYS. Fire-and-forget, triggered at
// most once per process per calendar day (on the first write of a new day), so
// total log disk usage stays bounded to ~RETENTION_DAYS files.
async function pruneOldLogs(today: string): Promise<void> {
  const cutoff =
    new Date(`${today}T00:00:00.000Z`).getTime() - RETENTION_DAYS * 86_400_000
  const files = await readdir(logDir)
  await Promise.all(
    files
      .filter((f) => LOG_FILE_RE.test(f))
      .filter((f) => {
        const t = new Date(`${f.slice(0, 10)}T00:00:00.000Z`).getTime()
        return Number.isFinite(t) && t < cutoff
      })
      .map((f) => unlink(resolve(logDir, f)).catch(() => {})),
  )
}

/**
 * Append a structured log line to a date-stamped file.
 *
 * Uses async I/O (fire-and-forget) so the event loop is never blocked.
 * Trade-off: a hard crash may lose the last in-flight write.
 *
 * NOTE: this bounds the NUMBER of daily files (retention), not the size of a
 * single day's file. Under very high traffic, ship logs off-box or rely on the
 * proxy's access log + sampling rather than per-request app logging.
 */
export function writeLog(level: string, message: string) {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const logFile = resolve(logDir, `${today}.log`)
  const line = `[${now.toISOString()}] [${level.toUpperCase()}] ${message}\n`

  // Run retention once per day per process (cheap, fire-and-forget).
  if (today !== lastPruneDay) {
    lastPruneDay = today
    pruneOldLogs(today).catch((err) => console.error('[logger] prune failed:', err))
  }

  // Fire-and-forget — intentionally not awaited.
  // eslint-disable-next-line no-console
  appendFile(logFile, line).catch((err) => console.error('[logger] write failed:', err))
}

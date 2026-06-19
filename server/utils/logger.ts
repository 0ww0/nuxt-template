// server/utils/logger.ts
import { appendFile } from 'fs/promises'
import { mkdirSync } from 'fs'
import { resolve } from 'path'

const logDir = resolve('./logs')

// Synchronous mkdir at module init — runs once on startup, acceptable.
mkdirSync(logDir, { recursive: true })

/**
 * Append a structured log line to a date-stamped file.
 *
 * Uses async I/O (fire-and-forget) so the event loop is never blocked.
 * Trade-off: a hard crash may lose the last in-flight write.
 */
export function writeLog(level: string, message: string) {
  const now = new Date()
  const logFile = resolve(logDir, `${now.toISOString().slice(0, 10)}.log`)
  const line = `[${now.toISOString()}] [${level.toUpperCase()}] ${message}\n`

  // Fire-and-forget — intentionally not awaited.
  // eslint-disable-next-line no-console
  appendFile(logFile, line).catch((err) => console.error('[logger] write failed:', err))
}
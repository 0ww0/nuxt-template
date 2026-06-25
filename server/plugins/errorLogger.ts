// server/plugins/errorLogger.ts
// Catches truly unhandled errors (uncaught throws, middleware crashes, etc.)
// that bypass normal H3 error handling.
import { writeLog } from '../utils/logger'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    const url = event ? getRequestURL(event).toString() : 'unknown'
    const statusCode = (error as any)?.statusCode ?? 500
    const statusMessage = (error as any)?.statusMessage ?? error.message

    writeLog('error', `[UNHANDLED] ${statusCode} ${statusMessage} — ${url}`)

    // Also log the stack trace for debugging
    if (error.stack) {
      writeLog('error', `  Stack: ${error.stack.split('\n').slice(0, 3).join(' | ')}`)
    }
  })
})
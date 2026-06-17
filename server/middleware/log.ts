// server/middleware/log.ts
import { writeLog } from '../utils/logger'

export default defineEventHandler((event) => {
  const start = Date.now()

  // Hook into the response to capture the status code after it's sent
  event.node.res.on('finish', () => {
    const duration = Date.now() - start
    const status = event.node.res.statusCode
    const url = getRequestURL(event)
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'

    writeLog(level, `${event.method} ${status} ${url} (${duration}ms)`)
  })
})
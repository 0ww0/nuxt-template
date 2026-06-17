// server/utils/logger.ts
import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'

const logDir = resolve('./logs')
const logFile = resolve(logDir, `${new Date().toISOString().slice(0, 10)}.log`)

// Make sure the logs/ folder exists
if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
}

export function writeLog(level: string, message: string) {
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`
    appendFileSync(logFile, line)
}
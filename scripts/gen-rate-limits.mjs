#!/usr/bin/env node
/**
 * scripts/gen-rate-limits.mjs
 *
 * Scans every TypeScript file under server/api/ for checkRateLimit() calls,
 * parses the action key and policy arguments, then writes the rate-limit
 * table between the <!-- BEGIN:rate-table --> / <!-- END:rate-table --> fences
 * in RATE_LIMITS.md.
 *
 * CI runs this and fails if the output differs from the committed file:
 *
 *   node scripts/gen-rate-limits.mjs
 *   git diff --exit-code RATE_LIMITS.md
 *
 * Add a new checkRateLimit() call → re-run this script → commit both files.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'   // add this line

const ROOT = fileURLToPath(new URL('..', import.meta.url))   // change this line
const API_DIR = join(ROOT, 'server/api')
const OUT_FILE = join(ROOT, 'RATE_LIMITS.md')

// ── Helpers ────────────────────────────────────────────────────────────────

/** Recursively collect all .ts files under a directory, skipping dev/. */
async function collectTs(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'dev') continue // excluded: dev seeders are never rate-limited
      files.push(...(await collectTs(full)))
    } else if (e.isFile() && e.name.endsWith('.ts')) {
      files.push(full)
    }
  }
  return files
}

/**
 * Derive the HTTP method + route path from the file path, e.g.:
 *   server/api/v1/auth/login.post.ts   →  POST /api/v1/auth/login
 *   server/api/v1/auth/mfa/send.post.ts →  POST /api/v1/auth/mfa/send
 */
function fileToEndpoint(filePath) {
  // Normalise to forward slashes before any string operations.
  // path.relative() uses OS separators (backslash on Windows), which breaks
  // the split('/') and prefix logic below.
  const rel = relative(join(ROOT, 'server'), filePath).replace(/\\/g, '/')
  // e.g. "api/v1/auth/login.post.ts"

  const parts = rel.replace(/\.ts$/, '').split('/')
  // e.g. ['api', 'v1', 'auth', 'login.post']

  const last = parts[parts.length - 1]
  const methodMatch = last.match(/^(.+)\.(get|post|put|patch|delete)$/)
  if (!methodMatch) return null

  const method = methodMatch[2].toUpperCase()
  const base = methodMatch[1] === 'index' ? '' : `/${methodMatch[1]}`
  // Fix: slice(0, -1) then join with '/' and prepend a single slash.
  // Previously '/' + parts.slice(0, -1).join('/') produced '//api/...'
  // when parts[0] was already 'api' (no leading empty string).
  const prefix = '/' + parts.slice(0, -1).join('/')
  // e.g. '/api/v1/auth'

  return `${method} ${prefix}${base}`
}

/**
 * Parse checkRateLimit calls from source text.
 *
 * Handles the two call signatures:
 *   checkRateLimit(event, 'action', { maxAttempts, windowMs, lockoutMs })
 *   checkRateLimit(event, 'action', { ... }, accountKey)
 *
 * Uses a simple regex — robust enough for our consistent code style.
 */
function parseRateLimitCalls(source) {
  const results = []

  // Match: checkRateLimit(event, '<action>', { ... }, optionalKey)
  // We allow the object to span multiple lines by using [\s\S]*? up to the closing }).
  const re = /checkRateLimit\(\s*event\s*,\s*'([^']+)'\s*,\s*\{([\s\S]*?)\}(?:\s*,\s*([^)]+))?\s*\)/g
  let m
  while ((m = re.exec(source)) !== null) {
    const action = m[1]
    const body = m[2]
    const accountKeyExpr = m[3]?.trim() ?? null

    const maxAttempts = extractNum(body, 'maxAttempts') ?? 10
    const windowMs = extractNum(body, 'windowMs') ?? 15 * 60_000
    const lockoutMs = extractNum(body, 'lockoutMs') ?? 15 * 60_000

    results.push({ action, maxAttempts, windowMs, lockoutMs, accountKeyExpr })
  }
  return results
}

/** Pull a numeric literal (including expressions like `60 * 60_000`) from a key. */
function extractNum(body, key) {
  const re = new RegExp(`${key}\\s*:\\s*([\\d\\s*_]+)`)
  const m = body.match(re)
  if (!m) return null
  // Evaluate the expression safely (digits, spaces, * and _)
  const expr = m[1].replace(/_/g, '').trim()
  try {
    // biome-ignore lint/security/noEval: controlled input, digits/operators only
    return Function(`"use strict"; return (${expr})`)()
  } catch {
    return null
  }
}

/**
 * Always express in minutes — keeps the doc stable and matches the policy
 * values developers write in handler files (e.g. 60 * 60_000 → 60 min).
 */
function msToHuman(ms) {
  const minutes = ms / 60_000
  return `${minutes} min`
}

function formatPolicy(maxAttempts, windowMs, lockoutMs) {
  return `${maxAttempts} / ${msToHuman(windowMs)}, ${msToHuman(lockoutMs)} lockout`
}

function formatAccountBucket(accountKeyExpr, maxAttempts, windowMs) {
  if (!accountKeyExpr) return '—'
  // Derive a human-readable label from the key expression.
  // Mirror the labels used in the committed RATE_LIMITS.md:
  //   email / String(user.id) / String(userId) / String(user_id) → userId / email
  let label = 'key'
  if (/email/.test(accountKeyExpr)) {
    label = 'email'
  } else if (/userId|user_id|user\.id/.test(accountKeyExpr)) {
    label = 'userId'
  } else if (/String\(/.test(accountKeyExpr)) {
    // e.g. String(someOtherKey) — strip the wrapper
    label = accountKeyExpr.replace(/String\(|\)/g, '').trim()
  }
  // checkRateLimit uses Math.ceil(maxAttempts / 2) for the account bucket
  const halfMax = Math.ceil(maxAttempts / 2)
  return `${label} (${halfMax} / ${msToHuman(windowMs)})`
}

// ── Main ───────────────────────────────────────────────────────────────────

const files = await collectTs(API_DIR)

/** @type {Map<string, { action: string, maxAttempts: number, windowMs: number, lockoutMs: number, accountKeyExpr: string|null }>} */
const rows = new Map() // action → first-seen entry (dedup by action key)
/** @type {Map<string, string>} */
const actionToEndpoint = new Map()

for (const file of files) {
  const endpoint = fileToEndpoint(file)
  if (!endpoint) continue

  const source = await readFile(file, 'utf8')
  const calls = parseRateLimitCalls(source)

  for (const call of calls) {
    if (!rows.has(call.action)) {
      rows.set(call.action, call)
      actionToEndpoint.set(call.action, endpoint)
    }
  }
}

if (rows.size === 0) {
  console.error('No checkRateLimit() calls found — check API_DIR path.')
  process.exit(1)
}

// Sort by endpoint path (method secondary)
const sorted = [...rows.entries()].sort(([, a], [, b]) => {
  const ea = actionToEndpoint.get(a.action) ?? ''
  const eb = actionToEndpoint.get(b.action) ?? ''
  return ea.localeCompare(eb)
})

// Build table rows
const tableLines = [
  '| Endpoint | Action key | IP policy | Account bucket |',
  '|---|---|---|---|',
]
for (const [action, entry] of sorted) {
  const endpoint = actionToEndpoint.get(action) ?? '?'
  const ip = formatPolicy(entry.maxAttempts, entry.windowMs, entry.lockoutMs)
  const acct = formatAccountBucket(entry.accountKeyExpr, entry.maxAttempts, entry.windowMs)
  tableLines.push(`| \`${endpoint}\` | \`${action}\` | ${ip} | ${acct} |`)
}

const tableBlock = tableLines.join('\n')

// Read existing file and replace fenced section
const existing = await readFile(OUT_FILE, 'utf8')
const begin = '<!-- BEGIN:rate-table -->'
const end = '<!-- END:rate-table -->'
const startIdx = existing.indexOf(begin)
const endIdx = existing.indexOf(end)
if (startIdx === -1 || endIdx === -1) {
  console.error(`Could not find ${begin} / ${end} fences in ${OUT_FILE}`)
  process.exit(1)
}

const updated =
  existing.slice(0, startIdx) +
  begin +
  '\n' +
  tableBlock +
  '\n' +
  existing.slice(endIdx)

await writeFile(OUT_FILE, updated)
console.log(`Wrote ${rows.size} rate-limit rows to RATE_LIMITS.md`)

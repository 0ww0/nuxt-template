import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core'

// DB-backed rate-limit buckets. Each row is one logical window keyed by
// `bucket` (e.g. "login:ip:1.2.3.4" or "login:account:user@x.com").
//
// `count`     — attempts within the current window.
// `blockedUntil` — when non-null, all requests to that bucket are rejected
//                  until this timestamp (set after lockout threshold is hit).
// `windowStart`  — start of the current fixed window; reset count when
//                  now() >= windowStart + window_duration.
//
// Using a DB table keeps this consistent across Nitro instances/restarts with
// no external dependency. For very high throughput, swap to Redis later without
// touching the callers (rate-limit logic is isolated in the repository + service).
export const rateLimitAttempts = pgTable('rate_limit_attempts', {
  id: serial('id').primaryKey(),
  bucket: text('bucket').notNull().unique(),
  count: integer('count').notNull().default(1),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type RateLimitAttempt = typeof rateLimitAttempts.$inferSelect
export type NewRateLimitAttempt = typeof rateLimitAttempts.$inferInsert

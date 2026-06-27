// server/tasks/auth/cleanup.ts
import { db, schema } from '@nuxthub/db'
import { lt, and, isNull, or } from 'drizzle-orm'

// Nitro scheduled task — runs hourly to prune expired rows.
// Scheduled in nuxt.config.ts:
//
//   nitro: {
//     scheduledTasks: {
//       '0 * * * *': ['auth:cleanup'],  // hourly
//     },
//   }
//
// Ad-hoc in dev:  npx nuxt task run auth:cleanup
//
// This task cleans up:
//  1. Expired sessions
//  2. Expired password-reset tokens
//  3. Expired email-verification tokens
//  4. Expired MFA OTP codes
//  5. Expired MFA pre-auth tokens (short-lived cookie-binding rows)
//  6. Stale rate-limit buckets (window closed AND not currently locked)
//
// ⚠ ARCHITECTURAL EXCEPTION: This file imports @nuxthub/db directly, which
// violates the "only repositories import @nuxthub/db" rule in AGENTS.md.
// This is an ACCEPTED ONE-OFF exception because scheduled cleanup tasks are
// maintenance-only, never called from routes/services, and bulk-deleting
// expired rows across six tables doesn't warrant six repository methods
// that exist solely for this task.
//
// DO NOT use this as precedent. Route handlers and services MUST go through
// the repository layer. If you need DB access elsewhere, add a repository
// method instead.

// Longest rate-limit window in use across all checkRateLimit() call sites
// (currently forgot-password / verify-email at 60 min). A rate-limit row is
// only safe to prune once it's older than this — otherwise an active window
// could be deleted mid-count. If you add a longer window anywhere, raise this.
const MAX_RATE_LIMIT_WINDOW_MS = 60 * 60_000

export default defineTask({
  meta: {
    name: 'auth:cleanup',
    description: 'Prune expired auth tokens, sessions, and stale rate-limit buckets',
  },
  async run() {
    const now = new Date()

    const [sessions, resetTokens, verifyTokens, mfaCodes, mfaPreAuthTokens, rateLimitRows] =
      await Promise.all([
        db
          .delete(schema.sessions)
          .where(lt(schema.sessions.expiresAt, now))
          .returning({ id: schema.sessions.id }),

        db
          .delete(schema.passwordResetTokens)
          .where(lt(schema.passwordResetTokens.expiresAt, now))
          .returning({ id: schema.passwordResetTokens.id }),

        db
          .delete(schema.emailVerificationTokens)
          .where(lt(schema.emailVerificationTokens.expiresAt, now))
          .returning({ id: schema.emailVerificationTokens.id }),

        db
          .delete(schema.mfaCodes)
          .where(lt(schema.mfaCodes.expiresAt, now))
          .returning({ id: schema.mfaCodes.id }),

        // MFA pre-auth tokens — 10-minute TTL; expired rows mean the login
        // flow was abandoned or the OTP was already consumed.
        db
          .delete(schema.mfaPreAuthTokens)
          .where(lt(schema.mfaPreAuthTokens.expiresAt, now))
          .returning({ id: schema.mfaPreAuthTokens.id }),

        // Rate-limit rows: delete only when the window is closed AND the bucket
        // is not currently locked (blockedUntil is null or in the past).
        db
          .delete(schema.rateLimitAttempts)
          .where(
            and(
              // Stale once last updated longer ago than the longest window.
              lt(
                schema.rateLimitAttempts.updatedAt,
                new Date(now.getTime() - MAX_RATE_LIMIT_WINDOW_MS),
              ),
              // Not currently locked (either never locked, or lock has expired).
              or(
                isNull(schema.rateLimitAttempts.blockedUntil),
                lt(schema.rateLimitAttempts.blockedUntil, now),
              ),
            ),
          )
          .returning({ id: schema.rateLimitAttempts.id }),
      ])

    const result = {
      sessions: sessions.length,
      resetTokens: resetTokens.length,
      verifyTokens: verifyTokens.length,
      mfaCodes: mfaCodes.length,
      mfaPreAuthTokens: mfaPreAuthTokens.length,
      rateLimitRows: rateLimitRows.length,
    }
    console.info('[auth:cleanup]', result)
    return { result }
  },
})

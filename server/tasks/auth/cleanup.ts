// server/tasks/auth/cleanup.ts
// ARCHITECTURAL EXCEPTION: scheduled maintenance task.
// May import @nuxthub/db directly — this is the only permitted non-repository use.
// Do NOT copy this import into services, handlers, or plugins. See AGENTS.md §1.
//
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
import { db, schema } from '@nuxthub/db'
import { lt, and, isNull, or } from 'drizzle-orm'

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

        // Rate-limit rows — only prune when the fixed window has closed AND
        // the bucket is not currently locked. An active lockout (blockedUntil
        // in the future) must survive so later requests still receive 429.
        db
          .delete(schema.rateLimitAttempts)
          .where(
            and(
              lt(
                schema.rateLimitAttempts.windowStart,
                new Date(now.getTime() - MAX_RATE_LIMIT_WINDOW_MS),
              ),
              or(
                isNull(schema.rateLimitAttempts.blockedUntil),
                lt(schema.rateLimitAttempts.blockedUntil, now),
              ),
            ),
          )
          .returning({ id: schema.rateLimitAttempts.id }),
      ])

    return {
      result: {
        sessions: sessions.length,
        resetTokens: resetTokens.length,
        verifyTokens: verifyTokens.length,
        mfaCodes: mfaCodes.length,
        mfaPreAuthTokens: mfaPreAuthTokens.length,
        rateLimitRows: rateLimitRows.length,
      },
    }
  },
})

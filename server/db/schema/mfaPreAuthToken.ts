// server/db/schema/mfaPreAuthToken.ts
// Short-lived server-side proof that the caller passed the password check for a
// given userId. Issued by login.post.ts on the MFA branch; consumed (and burned)
// by mfa/send.post.ts and mfa/verify.post.ts. The raw token travels as an
// httpOnly cookie scoped to /api/v1/auth/mfa; the DB stores only the SHA-256
// hash (same primitive as passwordResetToken / emailVerificationToken).
//
// TTL: 10 minutes — same as the OTP. Both expire together, so a stale pre-auth
// cookie can't be reused to trigger a fresh OTP send for a different session.
import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './user'

export const mfaPreAuthTokens = pgTable('mfa_preauth_tokens', {
  id: serial('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type MfaPreAuthToken = typeof mfaPreAuthTokens.$inferSelect
export type NewMfaPreAuthToken = typeof mfaPreAuthTokens.$inferInsert

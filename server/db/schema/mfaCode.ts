import { pgTable, serial, text, integer, smallint, timestamp } from 'drizzle-orm/pg-core'
import { users } from './user'

// Short-lived email OTP codes for MFA. Same hardening as password-reset tokens:
// only the SHA-256 hash is persisted; the raw 6-digit code is emailednp.
//
// `attempts` tracks failed submissions so we can burn the code after
// MAX_ATTEMPTS wrong guesses (default 5), preventing brute-force of the small
// OTP space even within the 10-minute window.
export const mfaCodes = pgTable('mfa_codes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull().unique(),
  attempts: smallint('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type MfaCode = typeof mfaCodes.$inferSelect
export type NewMfaCode = typeof mfaCodes.$inferInsert

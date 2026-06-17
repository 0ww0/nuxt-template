import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { users } from './user'

// One-time email-verification tokens. Same hardening as password resets: only
// the SHA-256 HASH is stored, the raw token is emailed once, single-use is
// enforced by deleting the row, and `expiresAt` bounds the lifetime (24h).
export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect
export type NewEmailVerificationToken = typeof emailVerificationTokens.$inferInsert

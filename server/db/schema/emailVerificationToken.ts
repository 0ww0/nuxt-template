import { pgTable, serial, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { users } from './user'

// One-time email-verification tokens. Same hardening as password resets: only
// the SHA-256 HASH is stored, the raw token is emailed once, single-use is
// enforced by deleting the row, and `expiresAt` bounds the lifetime (24h).
export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Index the FK: deleteByUserId (re-issue on resend) and the user-delete
  // cascade would otherwise sequentially scan this table.
  (t) => [index('email_verification_tokens_user_id_idx').on(t.userId)],
)

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect
export type NewEmailVerificationToken = typeof emailVerificationTokens.$inferInsert

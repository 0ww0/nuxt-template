import { pgTable, serial, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { users } from './user'

// One-time password-reset tokens. We persist ONLY the SHA-256 hash of the token,
// never the raw value — so a DB leak can't be replayed to reset anyone's
// password (the same hardening you'd apply to session tokens). The raw token is
// emailed exactly once and never stored.
//
// Single-use is enforced by deleting the row (and any siblings) on a successful
// reset; expiry is enforced by `expiresAt`.
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
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
  // Index the FK: deleteByUserId ("burn siblings" on every reset request) and
  // the user-delete cascade would otherwise sequentially scan this table.
  (t) => [index('password_reset_tokens_user_id_idx').on(t.userId)],
)

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert

import { pgTable, serial, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { users } from './user'

// Server-side sessions. The opaque `token` is what lives in the httpOnly cookie;
// it is looked up here on every authenticated request. Deleting a row (logout /
// revoke) instantly invalidates the session — the win over stateless JWTs.
export const sessions = pgTable(
  'sessions',
  {
    id: serial('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Postgres does NOT auto-index FK columns. Without this, deleteByUserId
  // (revokeAllForUser on every password reset / "sign out everywhere") and the
  // user-delete cascade do a sequential scan of sessions.
  (t) => [index('sessions_user_id_idx').on(t.userId)],
)

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert

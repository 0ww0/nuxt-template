import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

// Postgres table. One file per table; the barrel (server/db/schema.ts)
// re-exports everything, and that barrel is what NuxtHub reads.
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

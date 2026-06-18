import { pgTable, serial, text, boolean, timestamp } from 'drizzle-orm/pg-core'
import type { UserRole } from '../../../shared/auth/roles'

// Postgres table. One file per table; the barrel (server/db/schema.ts)
// re-exports everything, and that barrel is what NuxtHub reads.
//
// CHANGED: added `role` (NOT NULL, defaults to 'user' so existing rows backfill)
// and `passwordHash` (nullable — existing rows have none until they set one).
// CHANGED (Step 3): added `emailVerifiedAt` (nullable; null = unverified).
// CHANGED (Step 4): added `mfaEnabled` boolean (default false).
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').$type<UserRole>().notNull().default('user'),
  passwordHash: text('password_hash'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

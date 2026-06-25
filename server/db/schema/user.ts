import { pgTable, serial, text, boolean, timestamp, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { ROLES, type UserRole } from '../../../shared/auth/roles'

// Postgres table. One file per table; the barrel (server/db/schema.ts)
// re-exports everything, and that barrel is what NuxtHub reads.
//
// Step 5 — DB-level security hardening:
//
//  CHECK constraint on `role`
//    Built at module-load time from the shared ROLES constant — one source of
//    truth drives the Drizzle type, Zod schemas, RBAC guards, AND this DB
//    constraint. A direct DB write (rogue script, SQL injection that bypasses
//    the ORM, manual psql) cannot store an arbitrary role string.
//    Drizzle 0.31+ supports check() from pg-core — this project is on 0.45.2.
//    Trade-off: adding a new role requires a ROLES update AND a migration
//    (Drizzle detects the changed CHECK expression and emits an ALTER TABLE).
//    Acceptable for a system whose role set changes rarely.
//
//  UNIQUE INDEX on lower(email) — see migration addendum:
//    server/db/migrations/postgresql/step5_manual_addendum.sql
//    Drizzle pg-core cannot express a functional index in schema notation;
//    it must be written as raw SQL appended to the generated migration.

// Interpolated at module load so Drizzle sees a stable SQL fragment.
const roleInList = sql.raw(ROLES.map((r) => `'${r}'`).join(', '))

export const users = pgTable(
  'users',
  {
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
  },
  (table) => [
    // Drizzle emits:
    //   CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'super_admin'))
    // When you add a role to ROLES, re-run db:generate — Drizzle will diff the
    // expression and emit the necessary ALTER TABLE … DROP / ADD CONSTRAINT.
    check('users_role_check', sql`${table.role} IN (${roleInList})`),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

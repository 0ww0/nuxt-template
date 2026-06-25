import { db, schema } from '@nuxthub/db'
import { eq, notInArray } from 'drizzle-orm'
import type { NewUser, User } from '../db/schema'
import type { UserRole } from '../../shared/auth/roles'
import { conflict } from '../utils/errors'

// REPOSITORY LAYER — the ONLY layer that talks to the database.
// No HTTP, no business rules. Just data access.

// Postgres error code for a unique-constraint violation.
// Step 5 TOCTOU fix: two concurrent registrations can both pass the
// findByEmail pre-check, then one INSERT hits the DB unique constraint.
// Catching 23505 here converts the raw driver error into a clean conflict()
// so the service never surfaces an unhandled 500.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  )
}

export const userRepository = {
  findAll(): Promise<User[]> {
    return db.query.users.findMany({
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    })
  },

  // Like findAll, but excludes rows whose role is in `roles`. An EMPTY array
  // means "exclude nothing" → list everyone: we pass `where: undefined` rather
  // than notInArray(col, []), whose match-all behavior is a footgun if a caller
  // ever passes a dynamically-built empty list.
  findAllExcludingRoles(roles: UserRole[]): Promise<User[]> {
    return db.query.users.findMany({
      where: roles.length ? notInArray(schema.users.role, roles) : undefined,
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    })
  },

  findById(id: number): Promise<User | undefined> {
    return db.query.users.findFirst({ where: eq(schema.users.id, id) })
  },

  findByEmail(email: string): Promise<User | undefined> {
    return db.query.users.findFirst({ where: eq(schema.users.email, email) })
  },

  // Count users holding a specific role. Used by the service to protect the
  // last super_admin from being demoted/removed.
  countByRole(role: UserRole): Promise<number> {
    return db.$count(schema.users, eq(schema.users.role, role))
  },

  async create(data: NewUser): Promise<User> {
    try {
      const [created] = await db.insert(schema.users).values(data).returning()
      return created! // INSERT ... RETURNING always yields exactly one row
    } catch (err) {
      // Convert a DB-level unique violation (race / direct-SQL bypass) into
      // the same 409 the pre-check would have produced, so the caller always
      // sees a domain error, never a raw driver exception.
      if (isUniqueViolation(err)) throw conflict('Email already in use')
      throw err
    }
  },

  async update(id: number, data: Partial<NewUser>): Promise<User | undefined> {
    // Same 23505 → conflict() guard as create(): a concurrent rename to a taken
    // email (or any path that slips past the service's pre-check) must surface
    // as a clean 409, not an unhandled 500.
    try {
      const [updated] = await db
        .update(schema.users)
        .set(data)
        .where(eq(schema.users.id, id))
        .returning()
      return updated
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('Email already in use')
      throw err
    }
  },

  // Focused role write — keeps "where role is mutated" greppable in one place,
  // and never touches email/name so it can't collide on the unique constraint.
  async setRole(id: number, role: UserRole): Promise<User | undefined> {
    const [updated] = await db
      .update(schema.users)
      .set({ role })
      .where(eq(schema.users.id, id))
      .returning()
    return updated
  },

  async delete(id: number): Promise<boolean> {
    const deleted = await db
      .delete(schema.users)
      .where(eq(schema.users.id, id))
      .returning({ id: schema.users.id })
    return deleted.length > 0
  },
}

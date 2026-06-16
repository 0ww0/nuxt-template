import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { NewUser, User } from '../db/schema'

// REPOSITORY LAYER — the ONLY layer that talks to the database.
// No HTTP, no business rules. Just data access.
export const userRepository = {
  findAll(): Promise<User[]> {
    return db.query.users.findMany({
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    })
  },

  findById(id: number): Promise<User | undefined> {
    return db.query.users.findFirst({ where: eq(schema.users.id, id) })
  },

  findByEmail(email: string): Promise<User | undefined> {
    return db.query.users.findFirst({ where: eq(schema.users.email, email) })
  },

  async create(data: NewUser): Promise<User> {
    const [created] = await db.insert(schema.users).values(data).returning()
    return created! // INSERT ... RETURNING always yields exactly one row
  },

  async update(id: number, data: Partial<NewUser>): Promise<User | undefined> {
    const [updated] = await db
      .update(schema.users)
      .set(data)
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

import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { NewSession, Session } from '../db/schema'

// REPOSITORY LAYER — the ONLY layer that talks to the database.
// No HTTP, no business rules. Just data access.
export const sessionRepository = {
  findByToken(token: string): Promise<Session | undefined> {
    return db.query.sessions.findFirst({ where: eq(schema.sessions.token, token) })
  },

  async create(data: NewSession): Promise<Session> {
    const [created] = await db.insert(schema.sessions).values(data).returning()
    return created! // INSERT ... RETURNING always yields exactly one row
  },

  async deleteByToken(token: string): Promise<boolean> {
    const deleted = await db
      .delete(schema.sessions)
      .where(eq(schema.sessions.token, token))
      .returning({ id: schema.sessions.id })
    return deleted.length > 0
  },

  async deleteByUserId(userId: number): Promise<void> {
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId))
  },
}

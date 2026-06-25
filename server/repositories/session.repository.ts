import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { NewSession, Session, User } from '../db/schema'

// REPOSITORY LAYER — the ONLY layer that talks to the database.
// No HTTP, no business rules. Just data access.
export const sessionRepository = {
  findByToken(token: string): Promise<Session | undefined> {
    return db.query.sessions.findFirst({ where: eq(schema.sessions.token, token) })
  },

  // Resolve a session AND its user in ONE round-trip. This is the per-request
  // hot path (every authenticated route), so we join instead of doing
  // findByToken + findById sequentially. leftJoin (not inner) so an orphaned
  // session — user row gone without the FK cascade firing — still returns the
  // session with user=null, letting the service self-heal by deleting it.
  async findByTokenWithUser(
    token: string,
  ): Promise<{ session: Session; user: User | null } | undefined> {
    const [row] = await db
      .select({ session: schema.sessions, user: schema.users })
      .from(schema.sessions)
      .leftJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(eq(schema.sessions.token, token))
      .limit(1)
    return row
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

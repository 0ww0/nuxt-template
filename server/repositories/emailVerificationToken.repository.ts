import { db, schema } from '@nuxthub/db'
import { and, eq, gt } from 'drizzle-orm'
import type { EmailVerificationToken, NewEmailVerificationToken } from '../db/schema'

// REPOSITORY LAYER — the ONLY layer that talks to the database.
// No HTTP, no business rules. Just data access. Mirrors the reset-token repo.
export const emailVerificationTokenRepository = {
  async create(data: NewEmailVerificationToken): Promise<EmailVerificationToken> {
    const [row] = await db.insert(schema.emailVerificationTokens).values(data).returning()
    return row! // INSERT ... RETURNING always yields exactly one row
  },

  findUsableByHash(tokenHash: string): Promise<EmailVerificationToken | undefined> {
    return db.query.emailVerificationTokens.findFirst({
      where: and(
        eq(schema.emailVerificationTokens.tokenHash, tokenHash),
        gt(schema.emailVerificationTokens.expiresAt, new Date()),
      ),
    })
  },

  async deleteByUserId(userId: number): Promise<void> {
    await db
      .delete(schema.emailVerificationTokens)
      .where(eq(schema.emailVerificationTokens.userId, userId))
  },
}

// server/repositories/mfaPreAuthToken.repository.ts
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { NewMfaPreAuthToken } from '../db/schema/mfaPreAuthToken'

export const mfaPreAuthTokenRepository = {
  async create(data: NewMfaPreAuthToken) {
    const [row] = await db
      .insert(schema.mfaPreAuthTokens)
      .values(data)
      .returning()
    return row! // INSERT … RETURNING always yields exactly one row
  },

  // Looks up a token that is not yet expired. Returns undefined for missing,
  // already-burned, or expired tokens — caller gets a generic 401 for all cases.
  findUsableByHash(tokenHash: string) {
    return db.query.mfaPreAuthTokens.findFirst({
      where: (t, { and, eq, gt }) =>
        and(eq(t.tokenHash, tokenHash), gt(t.expiresAt, new Date())),
    })
  },

  // Burn all outstanding tokens for a user before issuing a new one (newest-only
  // policy). Also called on verify success so the cookie can't be reused.
  async deleteByUserId(userId: number) {
    await db
      .delete(schema.mfaPreAuthTokens)
      .where(eq(schema.mfaPreAuthTokens.userId, userId))
  },

  // Burn a single token by its hash (used on verify success).
  async deleteByHash(tokenHash: string) {
    await db
      .delete(schema.mfaPreAuthTokens)
      .where(eq(schema.mfaPreAuthTokens.tokenHash, tokenHash))
  },
}

import { db, schema } from '@nuxthub/db'
import { and, eq, gt } from 'drizzle-orm'
import type { NewPasswordResetToken, PasswordResetToken } from '../db/schema'

// REPOSITORY LAYER — the ONLY layer that talks to the database.
// No HTTP, no business rules. Just data access.
export const passwordResetTokenRepository = {
  async create(data: NewPasswordResetToken): Promise<PasswordResetToken> {
    const [row] = await db.insert(schema.passwordResetTokens).values(data).returning()
    return row! // INSERT ... RETURNING always yields exactly one row
  },

  // Usable = hash matches AND not yet expired. (Single-use is enforced by the
  // service deleting the row after a successful reset, so a consumed token will
  // simply not be found here.)
  findUsableByHash(tokenHash: string): Promise<PasswordResetToken | undefined> {
    return db.query.passwordResetTokens.findFirst({
      where: and(
        eq(schema.passwordResetTokens.tokenHash, tokenHash),
        gt(schema.passwordResetTokens.expiresAt, new Date()),
      ),
    })
  },

  // Invalidate every outstanding token for a user. Called when issuing a new one
  // (only the newest link stays live) and after a successful reset (burn them all).
  async deleteByUserId(userId: number): Promise<void> {
    await db
      .delete(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.userId, userId))
  },
}

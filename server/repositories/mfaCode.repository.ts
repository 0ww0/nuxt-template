import { db, schema } from '@nuxthub/db'
import { and, eq, gt, sql } from 'drizzle-orm'
import type { MfaCode, NewMfaCode } from '../db/schema'

// REPOSITORY LAYER — the ONLY layer that talks to the database.
export const mfaCodeRepository = {
  async create(data: NewMfaCode): Promise<MfaCode> {
    const [row] = await db.insert(schema.mfaCodes).values(data).returning()
    return row! // INSERT ... RETURNING always yields exactly one row
  },

  // Find a code that matches the hash AND hasn't expired.
  findUsableByHash(codeHash: string): Promise<MfaCode | undefined> {
    return db.query.mfaCodes.findFirst({
      where: and(
        eq(schema.mfaCodes.codeHash, codeHash),
        gt(schema.mfaCodes.expiresAt, new Date()),
      ),
    })
  },

  // Atomically increment the attempt counter. Returns the updated row so the
  // service can check whether MAX_ATTEMPTS has been hit. Uses raw sql() for
  // the atomic increment — kept inside the repository per the layer rule.
  async incrementAttempts(id: number): Promise<MfaCode | undefined> {
    const [row] = await db
      .update(schema.mfaCodes)
      .set({ attempts: sql`${schema.mfaCodes.attempts} + 1` })
      .where(eq(schema.mfaCodes.id, id))
      .returning()
    return row
  },

  // Burn all outstanding OTP codes for a user (on successful verify OR on
  // issuing a new code so only the newest is live).
  async deleteByUserId(userId: number): Promise<void> {
    await db.delete(schema.mfaCodes).where(eq(schema.mfaCodes.userId, userId))
  },
}

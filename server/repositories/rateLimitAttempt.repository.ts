import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'
import type { RateLimitAttempt } from '../db/schema'

// REPOSITORY LAYER — the ONLY layer that talks to the database.
// All rate-limit state lives here; the service layer owns the policy decisions.
export const rateLimitAttemptRepository = {
  findByBucket(bucket: string): Promise<RateLimitAttempt | undefined> {
    return db.query.rateLimitAttempts.findFirst({
      where: eq(schema.rateLimitAttempts.bucket, bucket),
    })
  },

  // Upsert a bucket. On first hit, creates the row with count=1 and the current
  // window start. On subsequent hits within the same window, atomically
  // increments the counter. The service resets the window when it expires
  // by calling resetBucket before recording the next hit.
  async increment(bucket: string, windowStart: Date): Promise<RateLimitAttempt> {
    const [row] = await db
      .insert(schema.rateLimitAttempts)
      .values({ bucket, count: 1, windowStart })
      .onConflictDoUpdate({
        target: schema.rateLimitAttempts.bucket,
        set: { count: sql`${schema.rateLimitAttempts.count} + 1` },
      })
      .returning()
    return row! // upsert always yields one row
  },

  // Wipe and restart the window (called when windowStart has expired).
  async resetBucket(bucket: string, windowStart: Date): Promise<RateLimitAttempt> {
    const [row] = await db
      .insert(schema.rateLimitAttempts)
      .values({ bucket, count: 1, windowStart, blockedUntil: null })
      .onConflictDoUpdate({
        target: schema.rateLimitAttempts.bucket,
        set: { count: 1, windowStart, blockedUntil: null },
      })
      .returning()
    return row! // upsert always yields one row
  },

  // Lock a bucket until `until`. Called after the lockout threshold is crossed.
  async lockBucket(bucket: string, until: Date): Promise<void> {
    await db
      .update(schema.rateLimitAttempts)
      .set({ blockedUntil: until })
      .where(eq(schema.rateLimitAttempts.bucket, bucket))
  },

  // Hard delete — used by the cleanup task and tests.
  async deleteBucket(bucket: string): Promise<void> {
    await db
      .delete(schema.rateLimitAttempts)
      .where(eq(schema.rateLimitAttempts.bucket, bucket))
  },
}

import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'
import type { RateLimitAttempt } from '../db/schema'

// REPOSITORY LAYER — the ONLY layer that talks to the database.
// All rate-limit state lives here; the service layer owns the policy decisions.
//
// ATOMICITY: `hit()` collapses read-decide-write into a single
// INSERT ... ON CONFLICT DO UPDATE with a conditional CASE expression.
// This eliminates the TOCTOU race at window boundaries — two concurrent
// requests cannot both see the expired window and both reset to count=1.
export const rateLimitAttemptRepository = {
  findByBucket(bucket: string): Promise<RateLimitAttempt | undefined> {
    return db.query.rateLimitAttempts.findFirst({
      where: eq(schema.rateLimitAttempts.bucket, bucket),
    })
  },

  /**
   * Atomically record a hit against `bucket`.
   *
   * - If no row exists: inserts with count=1, windowStart=now.
   * - If the row's window has expired (windowStart + windowMs <= now):
   *   resets count to 1 and updates windowStart to now.
   * - Otherwise: increments count by 1.
   *
   * All of this happens in ONE upsert statement — no separate read step,
   * so concurrent requests cannot race past each other at window boundaries.
   *
   * @param bucket    The rate-limit bucket key.
   * @param windowMs  Duration of the fixed window in milliseconds.
   * @returns         The updated row with the new count.
   */
  async hit(bucket: string, windowMs: number): Promise<RateLimitAttempt> {
    const t = schema.rateLimitAttempts
    const now = new Date()

    const [row] = await db
      .insert(t)
      .values({ bucket, count: 1, windowStart: now, blockedUntil: null })
      .onConflictDoUpdate({
        target: t.bucket,
        set: {
          // If window expired → reset to 1; else → increment.
          count: sql`CASE
            WHEN ${t.windowStart} + make_interval(secs => ${windowMs}::double precision / 1000)
                 <= now()
            THEN 1
            ELSE ${t.count} + 1
          END`,
          // If window expired → new window starts now; else → keep existing.
          windowStart: sql`CASE
            WHEN ${t.windowStart} + make_interval(secs => ${windowMs}::double precision / 1000)
                 <= now()
            THEN now()
            ELSE ${t.windowStart}
          END`,
          // Always clear any previous lockout when recording a hit within a
          // (possibly new) window — the service will re-lock if count exceeds
          // the threshold.
          blockedUntil: sql`CASE
            WHEN ${t.windowStart} + make_interval(secs => ${windowMs}::double precision / 1000)
                 <= now()
            THEN NULL
            ELSE ${t.blockedUntil}
          END`,
        },
      })
      .returning()
    return row! // upsert always yields one row
  },

  /**
   * Atomically lock a bucket until `until`, but ONLY if the current count
   * still exceeds `threshold`. This prevents a stale lock when a concurrent
   * request already reset the window.
   */
  async lockBucket(
    bucket: string,
    until: Date,
    threshold: number,
  ): Promise<boolean> {
    const t = schema.rateLimitAttempts
    const rows = await db
      .update(t)
      .set({ blockedUntil: until })
      .where(
        sql`${t.bucket} = ${bucket} AND ${t.count} > ${threshold}`,
      )
      .returning({ id: t.id })
    return rows.length > 0
  },

  // Hard delete — used by the cleanup task and tests.
  async deleteBucket(bucket: string): Promise<void> {
    await db
      .delete(schema.rateLimitAttempts)
      .where(eq(schema.rateLimitAttempts.bucket, bucket))
  },
}


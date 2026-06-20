import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { AnalyticsSettings, NewAnalyticsSettings } from '../db/schema'

// REPOSITORY LAYER — the only place that talks to the database.
// `analytics_settings` is a TRUE SINGLETON: exactly one logical row, pinned to id=1.
const SINGLETON_ID = 1

// analyticsEnabled has a DB default(true), so no INSERT_DEFAULTS needed here
// (unlike info's NOT NULL text columns) — Postgres fills it on insert.
const INSERT_DEFAULTS = {} satisfies Partial<NewAnalyticsSettings>

export const analyticsRepository = {
  find() {
    return db.query.analyticsSettings.findFirst({
      where: eq(schema.analyticsSettings.id, SINGLETON_ID),
    })
  },

  async upsert(data: Partial<NewAnalyticsSettings>): Promise<AnalyticsSettings> {
    const [row] = await db
      .insert(schema.analyticsSettings)
      .values({ id: SINGLETON_ID, ...INSERT_DEFAULTS, ...data } as NewAnalyticsSettings)
      .onConflictDoUpdate({
        target: schema.analyticsSettings.id,
        set: { ...data, updatedAt: new Date() },
      })
      .returning()
    return row! // upsert always inserts or updates exactly one row
  },
}

import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { SeoSettings, NewSeoSettings } from '../db/schema'

// REPOSITORY LAYER — the only place that talks to the database.
// `seo_settings` is a TRUE SINGLETON: exactly one logical row, pinned to id=1.
const SINGLETON_ID = 1

// No NOT NULL text/url columns beyond id, so no defaults are required on
// first insert (unlike info's title/description/version).
const INSERT_DEFAULTS = {} satisfies Partial<NewSeoSettings>

export const seoRepository = {
  find() {
    return db.query.seoSettings.findFirst({ where: eq(schema.seoSettings.id, SINGLETON_ID) })
  },

  async upsert(data: Partial<NewSeoSettings>): Promise<SeoSettings> {
    const [row] = await db
      .insert(schema.seoSettings)
      .values({ id: SINGLETON_ID, ...INSERT_DEFAULTS, ...data } as NewSeoSettings)
      .onConflictDoUpdate({
        target: schema.seoSettings.id,
        set: { ...data, updatedAt: new Date() },
      })
      .returning()
    return row! // upsert always inserts or updates exactly one row
  },
}

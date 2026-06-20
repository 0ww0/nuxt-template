import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { GeneralSettings, NewGeneralSettings } from '../db/schema'

// REPOSITORY LAYER — the only place that talks to the database.
// `general_settings` is a TRUE SINGLETON: exactly one logical row, pinned to id=1.
const SINGLETON_ID = 1

// maintenanceMode has a DB default(false); nothing else is NOT NULL.
const INSERT_DEFAULTS = {} satisfies Partial<NewGeneralSettings>

export const generalRepository = {
  find() {
    return db.query.generalSettings.findFirst({
      where: eq(schema.generalSettings.id, SINGLETON_ID),
    })
  },

  async upsert(data: Partial<NewGeneralSettings>): Promise<GeneralSettings> {
    const [row] = await db
      .insert(schema.generalSettings)
      .values({ id: SINGLETON_ID, ...INSERT_DEFAULTS, ...data } as NewGeneralSettings)
      .onConflictDoUpdate({
        target: schema.generalSettings.id,
        set: { ...data, updatedAt: new Date() },
      })
      .returning()
    return row! // upsert always inserts or updates exactly one row
  },
}

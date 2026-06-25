import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { InfoSetting, NewInfoSetting } from '../db/schema'

// REPOSITORY LAYER — the only place that talks to the database.
// `info_settings` is a TRUE SINGLETON: exactly one logical row, pinned to id=1.
const SINGLETON_ID = 1

const INSERT_DEFAULTS = {
  title: 'Untitled',
  description: 'No description',
  version: '0.0.0',
} satisfies Partial<NewInfoSetting>

export const infoRepository = {
  find() {
    return db.query.infoSettings.findFirst({ where: eq(schema.infoSettings.id, SINGLETON_ID) })
  },

  async upsert(data: Partial<NewInfoSetting>): Promise<InfoSetting> {
    const [row] = await db
      .insert(schema.infoSettings)
      .values({ id: SINGLETON_ID, ...INSERT_DEFAULTS, ...data } as NewInfoSetting)
      .onConflictDoUpdate({
        target: schema.infoSettings.id,
        set: { ...data, updatedAt: new Date() },
      })
      .returning()
    return row! // upsert always inserts or updates exactly one row
  },
}

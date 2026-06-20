import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { ContactSettings, NewContactSettings } from '../db/schema'

// REPOSITORY LAYER — the only place that talks to the database.
// `contact_settings` is a TRUE SINGLETON: exactly one logical row, pinned to id=1.
const SINGLETON_ID = 1

const INSERT_DEFAULTS = {} satisfies Partial<NewContactSettings>

export const contactRepository = {
  find() {
    return db.query.contactSettings.findFirst({
      where: eq(schema.contactSettings.id, SINGLETON_ID),
    })
  },

  async upsert(data: Partial<NewContactSettings>): Promise<ContactSettings> {
    const [row] = await db
      .insert(schema.contactSettings)
      .values({ id: SINGLETON_ID, ...INSERT_DEFAULTS, ...data } as NewContactSettings)
      .onConflictDoUpdate({
        target: schema.contactSettings.id,
        set: { ...data, updatedAt: new Date() },
      })
      .returning()
    return row! // upsert always inserts or updates exactly one row
  },
}

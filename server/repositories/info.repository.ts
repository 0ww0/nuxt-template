import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { Info, NewInfo } from '../db/schema'

// REPOSITORY LAYER — the only place that talks to the database.
// `informations` is a TRUE SINGLETON: exactly one logical row, pinned to id=1.
const SINGLETON_ID = 1

const INSERT_DEFAULTS = {
  title: 'Untitled',
  description: 'No description',
  version: '0.0.0',
} satisfies Partial<NewInfo>

export const infoRepository = {
  find() {
    return db.query.infos.findFirst({ where: eq(schema.infos.id, SINGLETON_ID) })
  },

  async upsert(data: Partial<NewInfo>): Promise<Info> {
    const [row] = await db
      .insert(schema.infos)
      .values({ id: SINGLETON_ID, ...INSERT_DEFAULTS, ...data } as NewInfo)
      .onConflictDoUpdate({
        target: schema.infos.id,
        set: { ...data, updatedAt: new Date() },
      })
      .returning()
    return row! // upsert always inserts or updates exactly one row
  },
}

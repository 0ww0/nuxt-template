import { pgTable, serial, boolean, text, timestamp } from 'drizzle-orm/pg-core'

// DB table `analytics_settings`, exported as `analyticsSettings`.
// TRUE SINGLETON — exactly one row, pinned to id = 1.
//
// Only `analyticsEnabled` existed on the old `informations` table. The
// provider-ID columns are added now since this is exactly the kind of thing
// that grows — keeps future additions to a column migration, not another split.
export const analyticsSettings = pgTable('analytics_settings', {
  id: serial().primaryKey(),

  analyticsEnabled: boolean().notNull().default(true), // master on/off switch

  googleAnalyticsId: text(), // e.g. G-XXXXXXX
  googleTagManagerId: text(), // e.g. GTM-XXXXXXX
  metaPixelId: text(),

  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type AnalyticsSettings = typeof analyticsSettings.$inferSelect
export type NewAnalyticsSettings = typeof analyticsSettings.$inferInsert

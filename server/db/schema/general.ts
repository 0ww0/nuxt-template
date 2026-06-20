import { pgTable, serial, boolean, timestamp } from 'drizzle-orm/pg-core'

// DB table `general_settings`, exported as `generalSettings`.
// TRUE SINGLETON — exactly one row, pinned to id = 1.
// Catch-all for site-wide operational toggles that don't belong to a more
// specific concern (SEO / analytics / contact / branding).
export const generalSettings = pgTable('general_settings', {
  id: serial().primaryKey(),

  maintenanceMode: boolean().notNull().default(false),

  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type GeneralSettings = typeof generalSettings.$inferSelect
export type NewGeneralSettings = typeof generalSettings.$inferInsert

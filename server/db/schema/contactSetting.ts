import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

// DB table `contact_settings`, exported as `contactSettings`.
// TRUE SINGLETON — exactly one row, pinned to id = 1.
export const contactSettings = pgTable('contact_settings', {
  id: serial().primaryKey(),

  // Contact Information
  email: text(),
  phone: text(),
  address: text(),

  // Social Media Links
  twitter: text(),
  facebook: text(),
  instagram: text(),
  linkedin: text(),
  github: text(),

  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type ContactSettings = typeof contactSettings.$inferSelect
export type NewContactSettings = typeof contactSettings.$inferInsert

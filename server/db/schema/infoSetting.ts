import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

// DB table is `informations`, exported as `infos`.
// Columns use camelCase keys; hub.db `casing: 'snake_case'` maps them to
// snake_case columns automatically (e.g. ogImage -> og_image).
//
// SPLIT NOTICE: this table used to also hold SEO, analytics, contact, and
// maintenance-mode fields. Those now live in their own singleton tables
// (seo_settings, analytics_settings, contact_settings, general_settings) so
// each concern can be read/written/role-gated independently. This table is
// now scoped to core identity + branding only.
export const infoSettings = pgTable('info_settings', {
  // Primary Key
  id: serial().primaryKey(),

  // Basic Information
  title: text().notNull(),
  description: text().notNull(),
  version: text().notNull(),

  // Branding Assets
  logo: text(), // Main logo URL
  favicon: text(), // Favicon URL
  ogImage: text(), // Open Graph image for social sharing (kept here, not in SEO — brand asset)

  // Theme & Appearance
  primaryColor: text(), // Primary brand color (hex)
  accentColor: text(), // Accent color (hex)

  // Additional Metadata
  tagline: text(), // Short tagline/slogan
  copyrightText: text(), // Copyright notice

  // Timestamps
  // NOTE: .defaultNow() on both. Postgres needs an insert-time value for a
  // NOT NULL column, and $onUpdate only fires on UPDATE, not INSERT.
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type InfoSetting = typeof infoSettings.$inferSelect
export type NewInfoSetting = typeof infoSettings.$inferInsert

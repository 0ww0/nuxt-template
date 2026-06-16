import { pgTable, serial, text, boolean, timestamp } from 'drizzle-orm/pg-core'

// DB table is `informations`, exported as `infos`.
// Columns use camelCase keys; hub.db `casing: 'snake_case'` maps them to
// snake_case columns automatically (e.g. ogImage -> og_image).
export const infos = pgTable('informations', {
  // Primary Key
  id: serial().primaryKey(),

  // Basic Information
  title: text().notNull(),
  description: text().notNull(),
  version: text().notNull(),

  // Branding Assets
  logo: text(), // Main logo URL
  favicon: text(), // Favicon URL
  ogImage: text(), // Open Graph image for social sharing

  // SEO & Meta
  keywords: text(), // Comma-separated keywords for SEO
  author: text(), // Application author/company name
  siteUrl: text(), // Canonical site URL

  // Contact Information
  email: text(), // Contact email
  phone: text(), // Contact phone number
  address: text(), // Physical address

  // Social Media Links
  twitter: text(), // Twitter/X handle or URL
  facebook: text(), // Facebook page URL
  instagram: text(), // Instagram profile URL
  linkedin: text(), // LinkedIn profile/company URL
  github: text(), // GitHub organization/repo URL

  // Theme & Appearance
  primaryColor: text(), // Primary brand color (hex)
  accentColor: text(), // Accent color (hex)

  // Legal & Compliance
  privacyPolicyUrl: text(), // Privacy policy page URL
  termsOfServiceUrl: text(), // Terms of service page URL

  // Feature Flags
  maintenanceMode: boolean().default(false), // Enable/disable maintenance mode
  analyticsEnabled: boolean().default(true), // Enable/disable analytics

  // Additional Metadata
  tagline: text(), // Short tagline/slogan
  copyrightText: text(), // Copyright notice

  // Timestamps
  // NOTE: added .defaultNow() to both. Postgres needs an insert-time value for
  // a NOT NULL column, and $onUpdate only fires on UPDATE, not INSERT. Remove
  // the defaults if you pass these explicitly on every insert.
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type Info = typeof infos.$inferSelect
export type NewInfo = typeof infos.$inferInsert

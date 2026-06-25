import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

// DB table `seo_settings`, exported as `seoSettings`.
// TRUE SINGLETON — exactly one row, pinned to id = 1. See
// server/repositories/seo.repository.ts for the upsert pattern.
export const seoSettings = pgTable('seo_settings', {
  id: serial().primaryKey(),

  keywords: text(), // Comma-separated keywords for SEO
  author: text(), // Application author/company name
  siteUrl: text(), // Canonical site URL

  // Legal & Compliance (grouped here, not contact — these are SEO/indexing-adjacent
  // pages search engines and footers link to alongside canonical/author metadata)
  privacyPolicyUrl: text(),
  termsOfServiceUrl: text(),

  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type SeoSettings = typeof seoSettings.$inferSelect
export type NewSeoSettings = typeof seoSettings.$inferInsert

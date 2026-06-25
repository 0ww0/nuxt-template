import { z } from 'zod'

const hex = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex color')

// PATCH body contract. `.strict()` rejects unknown keys (id, createdAt, …),
// which prevents mass-assignment. All fields optional; require at least one.
//
// SPLIT NOTICE: SEO/analytics/contact/maintenance fields moved to their own
// v1 schemas (seo.schema.ts, analytics.schema.ts, contact.schema.ts,
// general.schema.ts). This contract is now identity + branding only.
export const updateInfoV1Schema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    version: z.string().min(1).optional(),

    logo: z.string().nullable().optional(),
    favicon: z.string().nullable().optional(),
    ogImage: z.string().nullable().optional(),

    primaryColor: hex.nullable().optional(),
    accentColor: hex.nullable().optional(),

    tagline: z.string().nullable().optional(),
    copyrightText: z.string().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })

export type UpdateInfoV1 = z.infer<typeof updateInfoV1Schema>

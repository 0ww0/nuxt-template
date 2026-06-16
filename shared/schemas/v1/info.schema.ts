import { z } from 'zod'

const hex = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex color')

// PATCH body contract. `.strict()` rejects unknown keys (id, createdAt, …),
// which prevents mass-assignment. All fields optional; require at least one.
// URL-ish fields are kept as plain strings for flexibility — add `.url()` if
// you want strict URL validation.
export const updateInfoV1Schema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    version: z.string().min(1).optional(),

    logo: z.string().nullable().optional(),
    favicon: z.string().nullable().optional(),
    ogImage: z.string().nullable().optional(),

    keywords: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    siteUrl: z.string().nullable().optional(),

    email: z.string().email().nullable().optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),

    twitter: z.string().nullable().optional(),
    facebook: z.string().nullable().optional(),
    instagram: z.string().nullable().optional(),
    linkedin: z.string().nullable().optional(),
    github: z.string().nullable().optional(),

    primaryColor: hex.nullable().optional(),
    accentColor: hex.nullable().optional(),

    privacyPolicyUrl: z.string().nullable().optional(),
    termsOfServiceUrl: z.string().nullable().optional(),

    maintenanceMode: z.boolean().optional(),
    analyticsEnabled: z.boolean().optional(),

    tagline: z.string().nullable().optional(),
    copyrightText: z.string().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })

export type UpdateInfoV1 = z.infer<typeof updateInfoV1Schema>

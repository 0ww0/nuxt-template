import { z } from 'zod'

// PATCH body contract for the `seo_settings` singleton. `.strict()` rejects
// unknown keys (id, createdAt, …); all fields optional, at least one required.
// URL-ish fields kept as plain strings for flexibility — add `.url()` if you
// want strict URL validation.
export const updateSeoV1Schema = z
  .object({
    keywords: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    siteUrl: z.string().nullable().optional(),
    privacyPolicyUrl: z.string().nullable().optional(),
    termsOfServiceUrl: z.string().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })

export type UpdateSeoV1 = z.infer<typeof updateSeoV1Schema>

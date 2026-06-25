import { z } from 'zod'

// PATCH body contract for the `analytics_settings` singleton. `.strict()`
// rejects unknown keys; all fields optional, at least one required.
export const updateAnalyticsV1Schema = z
  .object({
    analyticsEnabled: z.boolean().optional(),
    googleAnalyticsId: z.string().nullable().optional(),
    googleTagManagerId: z.string().nullable().optional(),
    metaPixelId: z.string().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })

export type UpdateAnalyticsV1 = z.infer<typeof updateAnalyticsV1Schema>

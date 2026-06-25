import { z } from 'zod'

// PATCH body contract for the `general_settings` singleton. `.strict()`
// rejects unknown keys; all fields optional, at least one required.
export const updateGeneralV1Schema = z
  .object({
    maintenanceMode: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })

export type UpdateGeneralV1 = z.infer<typeof updateGeneralV1Schema>

import { z } from 'zod'

// PATCH body contract for the `contact_settings` singleton. `.strict()`
// rejects unknown keys; all fields optional, at least one required.
export const updateContactV1Schema = z
  .object({
    email: z.string().email().nullable().optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    twitter: z.string().nullable().optional(),
    facebook: z.string().nullable().optional(),
    instagram: z.string().nullable().optional(),
    linkedin: z.string().nullable().optional(),
    github: z.string().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })

export type UpdateContactV1 = z.infer<typeof updateContactV1Schema>

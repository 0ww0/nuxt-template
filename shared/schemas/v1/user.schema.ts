import { z } from 'zod'

// v1 INPUT CONTRACTS — shared by client (form validation) and server (handlers).
export const createUserV1Schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
})

// Partial for updates; require at least one field.
export const updateUserV1Schema = createUserV1Schema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Provide at least one field to update' },
)

export type CreateUserV1 = z.infer<typeof createUserV1Schema>
export type UpdateUserV1 = z.infer<typeof updateUserV1Schema>

import { z } from 'zod'
import { ROLES } from '~~/shared/auth/roles'

// v1 INPUT CONTRACTS — shared by client (form validation) and server (handlers).
//
// createUserV1Schema is for admin-only provisioning (POST /api/v1/users).
// It requires a password so every admin-created user has valid credentials and
// can log in. The public self-registration path is /api/v1/auth/register
// (auth.schema.ts → registerV1Schema), which never accepts `role`.
//
// `role` here is optional and admin-assignable. The requireMinRole('admin')
// guard on the handler is the enforcement mechanism — never trust role from a
// public body.
export const createUserV1Schema = z.object({
  email: z.string().email().toLowerCase().trim(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
  role: z.enum(ROLES).optional(),
})

// Partial for updates; require at least one field.
// Password changes go through /api/v1/auth/reset-password, not this PATCH.
export const updateUserV1Schema = createUserV1Schema
  .omit({ password: true })
  .partial()
  .strict()
  .refine(
    (v) => Object.keys(v).length > 0,
    { message: 'Provide at least one field to update' },
  )

export type CreateUserV1 = z.infer<typeof createUserV1Schema>
export type UpdateUserV1 = z.infer<typeof updateUserV1Schema>
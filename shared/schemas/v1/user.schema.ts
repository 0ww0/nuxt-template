import { z } from 'zod'
import { ROLES } from '~~/shared/auth/roles'

// v1 INPUT CONTRACTS — shared by client (form validation) and server (handlers).
//
// createUserV1Schema is for admin-only provisioning (POST /api/v1/users). It
// requires a password so every admin-created user can log in. `role` is optional
// here, but the CALLER's rank caps it: the handler runs assertCanAssignRole, so
// an admin cannot mint a super_admin even though the field is accepted.
//
// The public self-registration path is /api/v1/auth/register (registerV1Schema),
// which never accepts `role`.
export const createUserV1Schema = z.object({
  email: z.string().email().toLowerCase().trim(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
  role: z.enum(ROLES).optional(),
})

// Generic profile update. Deliberately OMITS both `password` and `role`:
//  - password changes go through /api/v1/auth/reset-password
//  - role changes go through PATCH /api/v1/users/:id/role (super_admin only)
// With `.strict()`, a `role` (or `password`, `id`, timestamp) key in the body is
// REJECTED — role can never be mass-assigned through the profile PATCH.
export const updateUserV1Schema = createUserV1Schema
  .omit({ password: true, role: true })
  .partial()
  .strict()
  .refine(
    (v) => Object.keys(v).length > 0,
    { message: 'Provide at least one field to update' },
  )

// Dedicated, single-purpose contract for the role-change endpoint. `.strict()`
// so nothing else can tag along; `role` is required (no partial).
export const setRoleV1Schema = z
  .object({
    role: z.enum(ROLES),
  })
  .strict()

export type CreateUserV1 = z.infer<typeof createUserV1Schema>
export type UpdateUserV1 = z.infer<typeof updateUserV1Schema>
export type SetRoleV1 = z.infer<typeof setRoleV1Schema>

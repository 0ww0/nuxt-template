import { createUserV1Schema } from '~~/shared/schemas/v1/user.schema'
import { authService } from '../../../services/auth.service'
import { presentUserV1 } from '../../../utils/presenters/user.v1'
import { requireMinRole, assertCanAssignRole } from '../../../utils/auth'

// POST /api/v1/users — admin-only direct user creation.
// Routes through authService.register so the password is always hashed. The
// assignable role is capped at the actor's own rank, so an admin cannot mint a
// super_admin even though createUserV1Schema accepts an optional `role`.
export default defineEventHandler(async (event) => {
  const actor = await requireMinRole(event, 'admin')
  const body = await readValidatedBody(event, createUserV1Schema.parse)
  assertCanAssignRole(actor, body.role ?? 'user')
  const user = await authService.register(body)
  setResponseStatus(event, 201)
  return presentUserV1(user)
})

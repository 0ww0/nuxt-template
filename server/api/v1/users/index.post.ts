import { createUserV1Schema } from '~~/shared/schemas/v1/user.schema'
import { authService } from '../../../services/auth.service'
import { presentUserV1 } from '../../../utils/presenters/user.v1'
import { requireMinRole } from '../../../utils/auth'

// POST /api/v1/users — admin-only direct user creation.
// Routes through authService.register so the password is always hashed and
// every provisioned user can log in. Public self-sign-up uses
// /api/v1/auth/register (registerV1Schema, no role field).
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'admin')
  const body = await readValidatedBody(event, createUserV1Schema.parse)
  const user = await authService.register(body)
  setResponseStatus(event, 201)
  return presentUserV1(user)
})
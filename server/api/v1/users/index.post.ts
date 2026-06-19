import { createUserV1Schema } from '~~/shared/schemas/v1/user.schema'
import { userService } from '../../../services/user.service'
import { presentUserV1 } from '../../../utils/presenters/user.v1'
import { requireMinRole } from '../../../utils/auth'

// POST /api/v1/users — admin-only direct user creation.
// Public sign-up goes through /api/v1/auth/register (hashes password, sends
// email verification, creates session). This route is for admin provisioning.
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'admin')
  const body = await readValidatedBody(event, createUserV1Schema.parse)
  const user = await userService.register(body)
  setResponseStatus(event, 201)
  return presentUserV1(user)
})

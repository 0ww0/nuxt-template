import { createUserV1Schema } from '~~/shared/schemas/v1/user.schema'
import { userService } from '../../../services/user.service'
import { presentUserV1 } from '../../../utils/presenters/user.v1'

// POST /api/v1/users
// Validate input against the v1 contract, delegate to the shared service,
// shape the response with the v1 presenter. Zod errors auto-map to a 400.
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, createUserV1Schema.parse)
  const user = await userService.register(body)
  setResponseStatus(event, 201)
  return presentUserV1(user)
})

import { z } from 'zod'
import { userService } from '../../../services/user.service'
import { presentUserV1 } from '../../../utils/presenters/user.v1'
import { requireUser } from '../../../utils/auth'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

// GET /api/v1/users/:id — requires login.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const user = await userService.getById(id) // throws 404 if missing
  return presentUserV1(user)
})

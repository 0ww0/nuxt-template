import { z } from 'zod'
import { userService } from '../../../services/user.service'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

// DELETE /api/v1/users/:id
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  await userService.remove(id) // 404 if missing
  setResponseStatus(event, 204)
  return null
})

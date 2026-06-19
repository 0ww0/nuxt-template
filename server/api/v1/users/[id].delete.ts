import { z } from 'zod'
import { userService } from '../../../services/user.service'
import { requireMinRole } from '../../../utils/auth'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

// DELETE /api/v1/users/:id — admin-only.
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'admin')
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  await userService.remove(id) // 404 if missing
  setResponseStatus(event, 204)
  return null
})

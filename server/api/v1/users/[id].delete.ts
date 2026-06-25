import { z } from 'zod'
import { userService } from '../../../services/user.service'
import { requireMinRole } from '../../../utils/auth'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

// DELETE /api/v1/users/:id — admin-or-higher, but the service enforces that the
// actor may only delete accounts they STRICTLY outrank (and never themselves),
// so an admin can't delete a peer admin or a super_admin.
export default defineEventHandler(async (event) => {
  const actor = await requireMinRole(event, 'admin')
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  await userService.remove(actor, id) // 404 if missing; 403 on rank violation
  setResponseStatus(event, 204)
  return null
})

import { z } from 'zod'
import { setRoleV1Schema } from '~~/shared/schemas/v1/user.schema'
import { userService } from '../../../../services/user.service'
import { presentUserV1 } from '../../../../utils/presenters/user.v1'
import { requireMinRole } from '../../../../utils/auth'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

// PATCH /api/v1/users/:id/role — super_admin only.
// Role mutation is isolated on its own route so `role` can never ride along in
// the generic profile PATCH. The super_admin gate plus the service's rank checks
// (no self-change, can't exceed your rank, can't strand the last super_admin)
// close the admin-to-super_admin escalation path.
export default defineEventHandler(async (event) => {
  const actor = await requireMinRole(event, 'super_admin')
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { role } = await readValidatedBody(event, setRoleV1Schema.parse)
  const user = await userService.setRole(actor, id, role)
  return presentUserV1(user!)
})

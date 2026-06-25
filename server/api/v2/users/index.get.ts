import { userService } from '../../../services/user.service'
import { presentUserListV2 } from '../../../utils/presenters/user.v2'
import { requireUser } from '../../../utils/auth'

// GET /api/v2/users
// Same service layer as v1, but the v2 contract hides privileged accounts:
// admin/super_admin rows are excluded at the DB level. Only the presenter and
// the chosen service method differ from v1.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const users = await userService.listExcludingRoles(['admin', 'super_admin'])
  return presentUserListV2(users)
})
import { userService } from '../../../services/user.service'
import { presentUserListV2 } from '../../../utils/presenters/user.v2'
import { requireUser } from '../../../utils/auth'

// GET /api/v2/users
// Calls the exact same userService.list() as v1 — only the presenter differs.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const users = await userService.list()
  return presentUserListV2(users)
})

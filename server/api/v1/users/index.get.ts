import { userService } from '../../../services/user.service'
import { presentUserListV1 } from '../../../utils/presenters/user.v1'
import { requireUser } from '../../../utils/auth'

// GET /api/v1/users — requires login.
// Thin handler: delegate to the service, shape with the v1 presenter.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const users = await userService.list()
  return presentUserListV1(users)
})

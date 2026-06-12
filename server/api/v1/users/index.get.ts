import { userService } from '../../../services/user.service'
import { presentUserListV1 } from '../../../utils/presenters/user.v1'

// GET /api/v1/users
// Thin handler: delegate to the service, shape with the v1 presenter.
export default defineEventHandler(async () => {
  const users = await userService.list()
  return presentUserListV1(users)
})

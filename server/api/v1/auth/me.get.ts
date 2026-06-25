import { requireUser } from '../../../utils/auth'
import { presentAuthUserV1 } from '../../../utils/presenters/auth.v1'

// GET /api/v1/auth/me — the current user; 401 if not authenticated.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return presentAuthUserV1(user)
})

import { registerV1Schema } from '~~/shared/schemas/v1/auth.schema'
import { authService } from '../../../services/auth.service'
import { sessionService } from '../../../services/session.service'
import { setSessionCookie } from '../../../utils/auth'
import { presentAuthUserV1 } from '../../../utils/presenters/auth.v1'

// POST /api/v1/auth/register — create an account (role 'user') and sign in.
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, registerV1Schema.parse)
  const user = await authService.register(body) // 409 if email taken
  const session = await sessionService.create(user.id)
  setSessionCookie(event, session.token, session.expiresAt)
  setResponseStatus(event, 201)
  return presentAuthUserV1(user)
})

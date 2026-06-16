import { loginV1Schema } from '~~/shared/schemas/v1/auth.schema'
import { authService } from '../../../services/auth.service'
import { sessionService } from '../../../services/session.service'
import { setSessionCookie } from '../../../utils/auth'
import { presentAuthUserV1 } from '../../../utils/presenters/auth.v1'

// POST /api/v1/auth/login — verify credentials, start a session.
export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, loginV1Schema.parse)
  const user = await authService.login(email, password) // 401 on bad creds
  const session = await sessionService.create(user.id)
  setSessionCookie(event, session.token, session.expiresAt)
  return presentAuthUserV1(user)
})

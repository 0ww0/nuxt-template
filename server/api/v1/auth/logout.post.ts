import { sessionService } from '../../../services/session.service'
import { SESSION_COOKIE, clearSessionCookie } from '../../../utils/auth'

// POST /api/v1/auth/logout — revoke the current session and clear the cookie.
export default defineEventHandler(async (event) => {
  const token = getCookie(event, SESSION_COOKIE)
  if (token) await sessionService.revoke(token)
  clearSessionCookie(event)
  setResponseStatus(event, 204)
  return null
})

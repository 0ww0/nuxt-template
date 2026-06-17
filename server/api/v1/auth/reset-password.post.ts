import { resetPasswordV1Schema } from '~~/shared/schemas/v1/auth.schema'
import { authService } from '../../../services/auth.service'

// POST /api/v1/auth/reset-password — set a new password using a valid token.
// 401 on an invalid/expired token; 204 on success. All of the user's sessions
// are revoked by the service, so they must log in again afterwards.
export default defineEventHandler(async (event) => {
  const { token, password } = await readValidatedBody(event, resetPasswordV1Schema.parse)
  await authService.resetPassword(token, password)
  setResponseStatus(event, 204)
  return null
})

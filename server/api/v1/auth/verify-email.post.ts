import { verifyEmailV1Schema } from '~~/shared/schemas/v1/auth.schema'
import { authService } from '../../../services/auth.service'
import { checkRateLimit } from '../../../utils/rateLimit'

// POST /api/v1/auth/verify-email — confirm an address with the emailed token.
// 401 on an invalid/expired token; 204 on success. The email link should point
// at a client page (/verify-email?token=…) that POSTs here — mirroring reset.
export default defineEventHandler(async (event) => {
  await checkRateLimit(event, 'verify-email', { maxAttempts: 20, windowMs: 60 * 60_000, lockoutMs: 60 * 60_000 })
  const { token } = await readValidatedBody(event, verifyEmailV1Schema.parse)
  await authService.verifyEmail(token)
  setResponseStatus(event, 204)
  return null
})

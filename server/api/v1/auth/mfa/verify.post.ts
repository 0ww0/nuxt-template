import { mfaVerifyV1Schema } from '~~/shared/schemas/v1/auth.schema'
import { mfaService } from '../../../../services/mfa.service'
import { setSessionCookie } from '../../../../utils/auth'
import { checkRateLimit } from '../../../../utils/rateLimit'
import { presentAuthUserV1 } from '../../../../utils/presenters/auth.v1'

// POST /api/v1/auth/mfa/verify — complete the MFA login step.
// Body: { userId, code }. On success: session cookie is set and user returned.
// 401 on wrong/expired code. Rate limited to complement the MAX_ATTEMPTS
// attempt counter in the service (both must pass).
export default defineEventHandler(async (event) => {
  const { userId, code } = await readValidatedBody(event, mfaVerifyV1Schema.parse)

  // Per-user bucket so rotating IPs can't dodge the attempt counter.
  await checkRateLimit(event, 'mfa-verify', { maxAttempts: 10, windowMs: 10 * 60_000, lockoutMs: 30 * 60_000 }, String(userId))

  const { user, session } = await mfaService.verifyCode(userId, code)
  setSessionCookie(event, session.token, session.expiresAt)
  return presentAuthUserV1(user)
})

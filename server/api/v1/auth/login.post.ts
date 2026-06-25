import { loginV1Schema } from '~~/shared/schemas/v1/auth.schema'
import { authService } from '../../../services/auth.service'
import { sessionService } from '../../../services/session.service'
import { setSessionCookie } from '../../../utils/auth'
import { checkRateLimit } from '../../../utils/rateLimit'
import { presentAuthUserV1 } from '../../../utils/presenters/auth.v1'

// POST /api/v1/auth/login — verify credentials, start a session (or prompt MFA).
//
// Rate limiting: 10 attempts / 15 min per IP; 5 per account (half of IP limit).
// Lockout: 15 min after threshold is crossed (handled by checkRateLimit).
//
// Two outcomes:
//   • MFA disabled → session created, user returned (existing behaviour).
//   • MFA enabled  → no session yet; { mfa_required: true, user_id } returned.
//     Client must POST the OTP to /api/v1/auth/mfa/verify to get the session.
export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, loginV1Schema.parse)

  // Rate limit BEFORE touching the DB to avoid using scrypt as an amplifier.
  await checkRateLimit(event, 'login', { maxAttempts: 10, windowMs: 15 * 60_000, lockoutMs: 15 * 60_000 }, email)

  const result = await authService.login(email, password) // 401 on bad creds

  // MFA path — no session yet.
  if ('mfaRequired' in result) {
    return { mfa_required: true, user_id: result.userId }
  }

  // Non-MFA path — create session immediately.
  const session = await sessionService.create(result.id)
  setSessionCookie(event, session.token, session.expiresAt)
  return presentAuthUserV1(result)
})

// server/api/v1/auth/login.post.ts
import { loginV1Schema } from '~~/shared/schemas/v1/auth.schema'
import { authService } from '../../../services/auth.service'
import { sessionService } from '../../../services/session.service'
import { mfaPreAuthService } from '../../../services/mfaPreAuth.service'
import { setSessionCookie } from '../../../utils/auth'
import { checkRateLimit } from '../../../utils/rateLimit'
import { presentAuthUserV1 } from '../../../utils/presenters/auth.v1'

const MFA_PREAUTH_COOKIE = 'mfa_preauth'
const MFA_PREAUTH_TTL_SECONDS = 10 * 60 // 10 min — must match service TTL

// POST /api/v1/auth/login — verify credentials, start a session (or prompt MFA).
//
// Rate limiting: 10 attempts / 15 min per IP; 5 per account (half of IP limit).
// Lockout: 15 min after threshold is crossed (handled by checkRateLimit).
//
// Two outcomes:
//   • MFA disabled → session created, user returned.
//   • MFA enabled  → a short-lived httpOnly pre-auth cookie is issued that binds
//     the userId to this server-confirmed password check. The client calls
//     /mfa/send and /mfa/verify using ONLY that cookie — userId is never sent
//     again in the body. Response: { mfa_required: true } (no userId).
export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, loginV1Schema.parse)

  // Rate limit BEFORE touching the DB to avoid using scrypt as an amplifier.
  await checkRateLimit(event, 'login', { maxAttempts: 10, windowMs: 15 * 60_000, lockoutMs: 15 * 60_000 }, email)

  const result = await authService.login(email, password) // 401 on bad creds

  // MFA path — issue pre-auth cookie, no session yet.
  if ('mfaRequired' in result) {
    const rawToken = await mfaPreAuthService.issueToken(result.userId)
    setCookie(event, MFA_PREAUTH_COOKIE, rawToken, {
      httpOnly: true,
      secure: !import.meta.dev,
      sameSite: 'lax',
      maxAge: MFA_PREAUTH_TTL_SECONDS,
      path: '/api/v1/auth/mfa', // scoped — not sent to other routes
    })
    // userId deliberately omitted from the response — the cookie carries the binding.
    return { mfa_required: true }
  }

  // Non-MFA path — create session immediately.
  const session = await sessionService.create(result.id)
  setSessionCookie(event, session.token, session.expiresAt)
  return presentAuthUserV1(result)
})

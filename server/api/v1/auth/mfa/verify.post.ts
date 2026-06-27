// server/api/v1/auth/mfa/verify.post.ts
import { z } from 'zod'
import { mfaPreAuthService } from '../../../../services/mfaPreAuth.service'
import { mfaService } from '../../../../services/mfa.service'
import { setSessionCookie } from '../../../../utils/auth'
import { checkRateLimit } from '../../../../utils/rateLimit'
import { presentAuthUserV1 } from '../../../../utils/presenters/auth.v1'

// Body: only the OTP code. userId comes from the pre-auth cookie, not the body.
const mfaVerifyBodySchema = z.object({
  code: z.string().min(6).max(6),
})

// POST /api/v1/auth/mfa/verify — complete the MFA login step.
//
// Reads userId from the httpOnly `mfa_preauth` cookie (issued by login.post.ts
// after a successful password check). The cookie is single-use — it is burned
// on success so it cannot be replayed for a second verify attempt.
//
// On success: pre-auth cookie is cleared, session cookie is set, user returned.
// On failure: 401 (generic — never distinguishes wrong code from expired session).
export default defineEventHandler(async (event) => {
  const rawToken = getCookie(event, 'mfa_preauth')

  // consumeToken validates + burns in one step (atomic: even if verify fails
  // below, the token is already consumed — caller must log in again to retry).
  // This prevents using one pre-auth token for unlimited verify attempts.
  const userId = await mfaPreAuthService.consumeToken(rawToken) // 401 if missing/expired

  // Per-user bucket so rotating IPs can't dodge the attempt counter.
  await checkRateLimit(event, 'mfa-verify', { maxAttempts: 10, windowMs: 10 * 60_000, lockoutMs: 30 * 60_000 }, String(userId))

  const { code } = await readValidatedBody(event, mfaVerifyBodySchema.parse)

  const { user, session } = await mfaService.verifyCode(userId, code)

  // Clear the pre-auth cookie now that a full session is established.
  deleteCookie(event, 'mfa_preauth', { path: '/api/v1/auth/mfa' })
  setSessionCookie(event, session.token, session.expiresAt)
  return presentAuthUserV1(user)
})

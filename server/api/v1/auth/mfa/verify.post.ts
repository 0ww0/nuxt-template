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
// after a successful password check).
//
// Pre-auth token lifecycle (Option B):
//   - validateToken on entry — does NOT burn the token. A wrong OTP code leaves
//     the pre-auth cookie intact so the user can correct their code and retry
//     without going back to the login page.
//   - consumeToken on success — burns the token after a verified OTP so it
//     cannot be reused for a second session.
//
// The OTP itself is the brute-force gate: mfaService.verifyCode enforces a
// 5-attempt cap via atomic incrementAttempts + the per-user rate-limit bucket
// (10 attempts / 10 min). Burning the pre-auth token on a wrong OTP is
// unnecessary defence-in-depth that costs real usability.
//
// On success: pre-auth cookie is cleared, session cookie is set, user returned.
// On failure: 401 (generic — never distinguishes wrong code from expired session).
export default defineEventHandler(async (event) => {
  const rawToken = getCookie(event, 'mfa_preauth')

  // Validate without burning — a wrong OTP should not force a full re-login.
  // 401 if the cookie is missing, expired, or tampered.
  const userId = await mfaPreAuthService.validateToken(rawToken)

  // Per-user bucket so rotating IPs can't dodge the OTP attempt counter.
  await checkRateLimit(event, 'mfa-verify', { maxAttempts: 10, windowMs: 10 * 60_000, lockoutMs: 30 * 60_000 }, String(userId))

  const { code } = await readValidatedBody(event, mfaVerifyBodySchema.parse)

  // verifyCode enforces a 5-attempt cap (atomic incrementAttempts). A 401 here
  // leaves the pre-auth cookie alive so the user can retry with the correct code.
  const { user, session } = await mfaService.verifyCode(userId, code)

  // OTP verified — burn the pre-auth token now so it cannot be replayed.
  await mfaPreAuthService.consumeToken(rawToken)
  deleteCookie(event, 'mfa_preauth', { path: '/api/v1/auth/mfa' })
  setSessionCookie(event, session.token, session.expiresAt)
  return presentAuthUserV1(user)
})
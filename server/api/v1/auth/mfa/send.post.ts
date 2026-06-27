// server/api/v1/auth/mfa/send.post.ts
import { mfaPreAuthService } from '../../../../services/mfaPreAuth.service'
import { mfaService } from '../../../../services/mfa.service'
import { userRepository } from '../../../../repositories/user.repository'
import { checkRateLimit } from '../../../../utils/rateLimit'

// POST /api/v1/auth/mfa/send — (re-)send an OTP during the MFA login step.
//
// No body required. The caller's identity is bound to the httpOnly `mfa_preauth`
// cookie issued by login.post.ts after a successful password check. This means
// an attacker who knows a victim's userId CANNOT trigger OTP emails for them —
// they would need the cookie, which requires having already passed the password
// check for that account.
//
// Anti-enumeration: the response is IDENTICAL whether or not the account exists
// or has MFA enabled. The pre-auth cookie is validated first; if it's missing or
// expired the caller gets a generic 401 before any userId resolution happens.
//
// Rate limited (per-account + per-IP) to bound OTP-email flooding.
export default defineEventHandler(async (event) => {
  // Resolve userId from the server-side pre-auth binding — no body needed.
  const rawToken = getCookie(event, 'mfa_preauth')
  const userId = await mfaPreAuthService.validateToken(rawToken) // 401 if missing/expired

  // Rate-limit per user — if a client hammers the send endpoint the per-user
  // bucket kicks in. The IP bucket still covers distributed abuse.
  await checkRateLimit(event, 'mfa-send', { maxAttempts: 3, windowMs: 10 * 60_000, lockoutMs: 30 * 60_000 }, String(userId))

  const user = await userRepository.findById(userId)
  if (user && user.mfaEnabled) {
    await mfaService.sendCode(user)
  }

  // Generic response regardless of outcome (anti-enumeration).
  return { message: 'If a code is required, it has been sent.' }
})

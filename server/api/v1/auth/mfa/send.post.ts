import { z } from 'zod'
import { mfaService } from '../../../../services/mfa.service'
import { userRepository } from '../../../../repositories/user.repository'
import { checkRateLimit } from '../../../../utils/rateLimit'

// POST /api/v1/auth/mfa/send — (re-)send an OTP during the MFA login step.
// Body: { userId }. The legitimate client reaches this only after a login that
// returned { mfa_required: true, userId }, so a valid account always gets a code.
//
// Anti-enumeration: the response is IDENTICAL whether or not the account exists
// or has MFA enabled. Previously this returned 401 "MFA not enabled" for a
// missing/non-MFA user, which let an attacker probe sequential userIds for
// account existence + MFA status. Now we silently no-op on those cases.
//
// Rate limited (per-account + per-IP) to bound OTP-email flooding to a victim.
const sendBodySchema = z.object({ userId: z.number().int().positive() })

export default defineEventHandler(async (event) => {
  const { userId } = await readValidatedBody(event, sendBodySchema.parse)

  await checkRateLimit(event, 'mfa-send', { maxAttempts: 3, windowMs: 10 * 60_000, lockoutMs: 30 * 60_000 }, String(userId))

  const user = await userRepository.findById(userId)
  if (user && user.mfaEnabled) {
    await mfaService.sendCode(user)
  }

  // Generic response regardless of outcome.
  return { message: 'If a code is required, it has been sent.' }
})

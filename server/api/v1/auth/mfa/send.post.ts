import { mfaVerifyV1Schema } from '~~/shared/schemas/v1/auth.schema'
import { z } from 'zod'
import { mfaService } from '../../../../services/mfa.service'
import { userRepository } from '../../../../repositories/user.repository'
import { checkRateLimit } from '../../../../utils/rateLimit'
import { notFound, unauthorized } from '../../../../utils/errors'

// POST /api/v1/auth/mfa/send — (re-)send an OTP to the user during the MFA
// login step. Body: { user_id }. Only valid when the account has MFA enabled
// and the user just passed the password check (they have user_id from the login
// response). No session cookie is required at this stage.
//
// Rate limited tightly to prevent OTP flooding / email-bomb.
const sendBodySchema = z.object({ userId: z.number().int().positive() })

export default defineEventHandler(async (event) => {
  const { userId } = await readValidatedBody(event, sendBodySchema.parse)

  await checkRateLimit(event, 'mfa-send', { maxAttempts: 3, windowMs: 10 * 60_000, lockoutMs: 30 * 60_000 })

  const user = await userRepository.findById(userId)
  if (!user || !user.mfaEnabled) throw unauthorized('MFA not enabled for this account')

  await mfaService.sendCode(user)
  return { message: 'Code sent.' }
})

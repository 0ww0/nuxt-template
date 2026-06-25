import { mfaToggleV1Schema } from '~~/shared/schemas/v1/auth.schema'
import { requireUser } from '../../../../utils/auth'
import { mfaService } from '../../../../services/mfa.service'
import { authService } from '../../../../services/auth.service'

// POST /api/v1/auth/mfa/disable — opt the logged-in user out of MFA.
// Same step-up pattern as /enable: requires the current password so a session
// hijacker can't silently weaken the account's security posture.
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const { password } = await readValidatedBody(event, mfaToggleV1Schema.parse)

  // Step-up: throws 401 on wrong password.
  await authService.login(actor.email, password)

  await mfaService.disable(actor.id)
  return { message: 'MFA disabled.' }
})

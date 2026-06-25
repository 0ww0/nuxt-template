import { mfaToggleV1Schema } from '~~/shared/schemas/v1/auth.schema'
import { requireUser } from '../../../../utils/auth'
import { mfaService } from '../../../../services/mfa.service'
import { authService } from '../../../../services/auth.service'

// POST /api/v1/auth/mfa/enable — opt the logged-in user into MFA.
// Re-confirms the current password (step-up auth) before toggling, so a
// stranger who finds an unlocked browser can't silently enroll MFA and then
// lock the real owner out of future logins.
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const { password } = await readValidatedBody(event, mfaToggleV1Schema.parse)

  // Re-use login() for step-up: it verifies the hash and returns the user (or
  // throws 401). MFA flag is already false here so it won't recurse into the
  // MFA branch.
  await authService.login(actor.email, password)

  await mfaService.enable(actor.id)
  return { message: 'MFA enabled.' }
})

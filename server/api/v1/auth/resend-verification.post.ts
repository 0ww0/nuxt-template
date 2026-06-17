import { requireUser } from '../../../utils/auth'
import { authService } from '../../../services/auth.service'

// POST /api/v1/auth/resend-verification — re-send the link to the logged-in
// user's own address. requireUser → 401 if not signed in. Operates on the
// actor's id only (no body), so there's nothing to enumerate. Generic 200.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  await authService.resendEmailVerification(user.id)
  return { message: 'Verification email sent.' }
})

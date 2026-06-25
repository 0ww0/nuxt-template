import { requireUser } from '../../../utils/auth'
import { authService } from '../../../services/auth.service'
import { checkRateLimit } from '../../../utils/rateLimit'

// POST /api/v1/auth/resend-verification — re-send the verification link.
// Logged-in user only; rate limited to prevent email flooding.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  await checkRateLimit(event, 'resend-verify', { maxAttempts: 3, windowMs: 60 * 60_000, lockoutMs: 60 * 60_000 }, String(user.id))
  await authService.resendEmailVerification(user.id)
  return { message: 'Verification email sent.' }
})

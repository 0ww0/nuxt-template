import { forgotPasswordV1Schema } from '~~/shared/schemas/v1/auth.schema'
import { authService } from '../../../services/auth.service'
import { checkRateLimit } from '../../../utils/rateLimit'

// POST /api/v1/auth/forgot-password — issue a reset link if the account exists.
// Always returns the SAME generic 200 so it can't enumerate registered emails.
// Rate limited to prevent flooding / email-bomb abuse.
export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, forgotPasswordV1Schema.parse)
  await checkRateLimit(event, 'forgot-password', { maxAttempts: 5, windowMs: 60 * 60_000, lockoutMs: 60 * 60_000 }, email)
  await authService.requestPasswordReset(email)
  return { message: 'If that email is registered, a reset link has been sent.' }
})

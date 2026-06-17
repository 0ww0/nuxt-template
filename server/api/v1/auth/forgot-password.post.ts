import { forgotPasswordV1Schema } from '~~/shared/schemas/v1/auth.schema'
import { authService } from '../../../services/auth.service'

// POST /api/v1/auth/forgot-password — issue a reset link if the account exists.
// Always returns the SAME generic 200 so it can't be used to discover which
// emails are registered. No presenter: the client controls this fixed shape.
export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, forgotPasswordV1Schema.parse)
  await authService.requestPasswordReset(email)
  return { message: 'If that email is registered, a reset link has been sent.' }
})

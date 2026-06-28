// server/services/mfa.service.ts
// Business rules for email-OTP MFA. HTTP-agnostic — never import `event` or status codes.
// DB access via mfaCode.repository.ts and user.repository.ts only.
// Throws: unauthorized from server/utils/errors.ts.
// See also: mfaPreAuth.service.ts (pre-auth cookie that binds send/verify to a
//           password check), session.service.ts (session issued after verifyCode).
//
// Flow when mfaEnabled=true:
//   1. authService.login() verifies password → handler calls sendCode(user) and
//      returns { mfa_required: true }. NO session cookie is issued yet.
//   2. Client POSTs { code } to /api/v1/auth/mfa/verify (userId from cookie).
//   3. mfaService.verifyCode() validates → creates and returns the real session.
//
// The full session is never issued until BOTH factors succeed.
import { randomInt, createHash } from 'node:crypto'
import { mfaCodeRepository } from '../repositories/mfaCode.repository'
import { userRepository } from '../repositories/user.repository'
import { sessionService } from './session.service'
import { sendMail } from '../utils/mailer'
import { unauthorized, notFound } from '../utils/errors'
import type { Session, User } from '../db/schema'

const MFA_TTL_MS = 10 * 60 * 1000 // codes expire in 10 minutes
const MAX_ATTEMPTS = 5             // wrong OTPs before the code is burned

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function generateCode(): string {
  // Cryptographically secure 6-digit OTP; randomInt hi is exclusive.
  return String(randomInt(100_000, 1_000_000))
}

export const mfaService = {
  // Issue a fresh OTP. Burns any outstanding code first (newest-only policy).
  async sendCode(user: User): Promise<void> {
    await mfaCodeRepository.deleteByUserId(user.id)

    const code = generateCode()
    await mfaCodeRepository.create({
      userId: user.id,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + MFA_TTL_MS),
    })

    // A mail failure must NOT turn the /mfa/send handler into a 500. That
    // handler returns a generic 200 for non-MFA / missing accounts; if a real
    // MFA account's send threw here, the 500-vs-200 difference would re-leak
    // MFA-enabled status (the enumeration the handler deliberately hides). Log
    // and return normally — the user simply retries if the email never arrives.
    try {
      await sendMail({
        to: user.email,
        subject: 'Your sign-in code',
        text: `Your sign-in code is: ${code}\n\nIt expires in 10 minutes. Do not share it.`,
      })
    } catch (err) {
      console.error('[mfa] could not send sign-in code email', err) // intentional: mail errors must not bubble
    }
  },

  // Verify the OTP. The repository looks up by hash so the raw code is never
  // compared in application code (no timing differences between found/not-found
  // — both paths hash first then hit the DB).
  async verifyCode(userId: number, code: string): Promise<{ user: User; session: Session }> {
    // Hash first — the DB stores no raw code so this is the only comparison path.
    const record = await mfaCodeRepository.findUsableByHash(sha256(code))

    // No matching valid code, OR the code belongs to a different user (collision
    // is astronomically unlikely with CSPRNG 6-digit codes, but handled correctly).
    if (!record || record.userId !== userId) {
      throw unauthorized('Invalid or expired MFA code')
    }

    // Atomically increment and check before accepting.
    const updated = await mfaCodeRepository.incrementAttempts(record.id)
    if (!updated) {
      // Race: record was deleted between findUsableByHash and incrementAttempts.
      throw unauthorized('Invalid or expired MFA code')
    }

    if (updated.attempts > MAX_ATTEMPTS) {
      // Burn the code: too many wrong guesses. Attacker must request a new one,
      // which will hit the rate limit on /mfa/send.
      await mfaCodeRepository.deleteByUserId(userId)
      throw unauthorized('Too many incorrect attempts. Request a new code.')
    }

    const user = await userRepository.findById(userId)
    if (!user) throw notFound('User')

    // Burn before issuing the session — strictly single-use.
    await mfaCodeRepository.deleteByUserId(userId)
    const session = await sessionService.create(userId)

    return { user, session }
  },

  async enable(userId: number): Promise<void> {
    await userRepository.update(userId, { mfaEnabled: true })
  },

  async disable(userId: number): Promise<void> {
    await userRepository.update(userId, { mfaEnabled: false })
    await mfaCodeRepository.deleteByUserId(userId)
  },
}

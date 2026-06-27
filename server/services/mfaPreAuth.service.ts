// server/services/mfaPreAuth.service.ts
// HTTP-agnostic service for the MFA pre-auth token flow.
//
// The pre-auth token is issued by login.post.ts after a successful password
// check when the account has MFA enabled. It binds the MFA send/verify flow to
// a server-confirmed password verification, so neither endpoint needs (or
// accepts) a userId from the request body.
//
// All three handlers (login, mfa/send, mfa/verify) call into this service:
//   login    → issueToken(userId)
//   mfa/send → validateToken(rawToken)   // resolves userId, re-use allowed (send may be retried)
//   mfa/verify → consumeToken(rawToken)  // resolves userId + burns token (single-use on success)
import { randomBytes, createHash } from 'node:crypto'
import { mfaPreAuthTokenRepository } from '../repositories/mfaPreAuthToken.repository'
import { unauthorized } from '../utils/errors'

const PREAUTH_TTL_MS = 10 * 60 * 1000 // 10 min — same as OTP TTL

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export const mfaPreAuthService = {
  // Issue a fresh pre-auth token for the given userId.
  // Burns any existing token for the user first (newest-only policy).
  // Returns the RAW token — caller must put it in the httpOnly cookie.
  async issueToken(userId: number): Promise<string> {
    await mfaPreAuthTokenRepository.deleteByUserId(userId)
    const rawToken = randomBytes(32).toString('base64url')
    await mfaPreAuthTokenRepository.create({
      tokenHash: sha256(rawToken),
      userId,
      expiresAt: new Date(Date.now() + PREAUTH_TTL_MS),
    })
    return rawToken
  },

  // Validate the raw token from the cookie. Returns the bound userId.
  // Does NOT burn the token — mfa/send may be called multiple times (retries).
  // Throws 401 for missing, expired, or malformed tokens.
  async validateToken(rawToken: string | undefined): Promise<number> {
    if (!rawToken) throw unauthorized('MFA session expired or missing — please log in again')
    const record = await mfaPreAuthTokenRepository.findUsableByHash(sha256(rawToken))
    if (!record) throw unauthorized('MFA session expired or missing — please log in again')
    return record.userId
  },

  // Validate + burn in one call. Used by mfa/verify on success so the pre-auth
  // cookie can't be reused to trigger another verify attempt.
  async consumeToken(rawToken: string | undefined): Promise<number> {
    const userId = await this.validateToken(rawToken)
    await mfaPreAuthTokenRepository.deleteByUserId(userId)
    return userId
  },
}

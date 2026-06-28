// server/services/mfaPreAuth.service.ts
// Business rules for the MFA pre-auth token flow. HTTP-agnostic — never import `event` or status codes.
// DB access via mfaPreAuthToken.repository.ts only.
// Throws: unauthorized from server/utils/errors.ts.
// See also: mfa.service.ts (OTP send/verify), auth.service.ts (login that triggers this flow).
//
// The pre-auth token is issued by login.post.ts after a successful password
// check when the account has MFA enabled. It binds the MFA send/verify flow to
// a server-confirmed password verification, so neither endpoint needs (or
// accepts) a userId from the request body.
//
// All three handlers (login, mfa/send, mfa/verify) call into this service:
//   login      → issueToken(userId)      — issues token, puts raw value in httpOnly cookie
//   mfa/send   → validateToken(rawToken) — resolves userId; does NOT burn (send may be retried)
//   mfa/verify → validateToken(rawToken) — resolves userId on entry (does NOT burn)
//              → consumeToken(rawToken)  — burns token only AFTER verifyCode succeeds
//
// Burn-on-success (not burn-on-entry) is intentional:
//   A wrong OTP should not force a full re-login. The OTP's 5-attempt cap
//   (atomic incrementAttempts) and the mfa-verify rate-limit bucket are the
//   real brute-force gates. The pre-auth token only binds "who is trying" and
//   does not need to be single-use on a wrong OTP.
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
  // Does NOT burn the token — mfa/send may be called multiple times (retries),
  // and mfa/verify calls this on entry so a wrong OTP doesn't force a re-login.
  // Throws 401 for missing, expired, or malformed tokens.
  async validateToken(rawToken: string | undefined): Promise<number> {
    if (!rawToken) throw unauthorized('MFA session expired or missing — please log in again')
    const record = await mfaPreAuthTokenRepository.findUsableByHash(sha256(rawToken))
    if (!record) throw unauthorized('MFA session expired or missing — please log in again')
    return record.userId
  },

  // Validate + burn in one call. Called by mfa/verify AFTER verifyCode succeeds
  // so the pre-auth cookie can't be reused for a second session. Never call this
  // on a failed OTP attempt — use validateToken on entry instead.
  async consumeToken(rawToken: string | undefined): Promise<void> {
    if (!rawToken) throw unauthorized('MFA session expired or missing — please log in again')
    const record = await mfaPreAuthTokenRepository.findUsableByHash(sha256(rawToken))
    if (!record) throw unauthorized('MFA session expired or missing — please log in again')
    await mfaPreAuthTokenRepository.deleteByUserId(record.userId)
  },
}

import type { User } from '../../db/schema'

// v1 PRESENTER for the authenticated user. Hand-listed (not spread) so the
// `passwordHash` column can NEVER be serialized into a response. Exposes
// `email_verified` and `mfa_enabled` so the client can update its UI without
// a separate /me fetch.
export function presentAuthUserV1(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    email_verified: user.emailVerifiedAt !== null,
    mfa_enabled: user.mfaEnabled,
    created_at: user.createdAt.getTime(),
  }
}

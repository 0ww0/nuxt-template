import type { User } from '../../db/schema'

// v1 PRESENTER for the authenticated user. Hand-listed (not spread) so the
// `passwordHash` column can NEVER be serialized into a response. Includes
// `role` so the client can show/hide UI per role.
export function presentAuthUserV1(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.createdAt.getTime(),
  }
}

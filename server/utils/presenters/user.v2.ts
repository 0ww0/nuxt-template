import type { User } from '../../db/schema'

// v2 PRESENTER
// Same domain object as v1, DIFFERENT contract: profile is nested and the
// timestamp is an ISO string. Note we did NOT touch the service or repository
// to ship v2 — only the edge (route + presenter) changed.
//
// SECURITY — hand-listed (not spread) on purpose. The `User` row carries
// `passwordHash` (and `role`); listing fields explicitly means neither can ever
// be serialized into a response. Do NOT change this to `{ ...user }` — that
// would leak the hash. (Same rule as presentAuthUserV1; see the auth skill §4.)
export function presentUserV2(user: User) {
  return {
    id: user.id,
    profile: {
      name: user.name,
      email: user.email,
    },
    createdAt: user.createdAt.toISOString(),
  }
}

export function presentUserListV2(users: User[]) {
  return users.map(presentUserV2)
}
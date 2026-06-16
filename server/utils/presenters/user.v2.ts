import type { User } from '../../db/schema'

// v2 PRESENTER
// Same domain object as v1, DIFFERENT contract: profile is nested and the
// timestamp is an ISO string. Note we did NOT touch the service or repository
// to ship v2 — only the edge (route + presenter) changed.
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

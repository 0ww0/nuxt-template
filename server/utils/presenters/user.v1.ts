import type { User } from '../../db/schema'

// v1 PRESENTER (serializer)
// Maps the internal domain object to the v1 response shape. This is the piece
// that actually differs between versions — v1 returns flat fields and a unix
// timestamp; a v2 presenter might nest a `profile` object and use ISO dates.
// Keeping it here means route handlers stay thin and the contract is explicit.
//
// SECURITY — hand-listed (not spread) on purpose. The `User` row carries
// `passwordHash` (and `role`); `userService.list()` returns full rows. Listing
// fields explicitly means neither can ever be serialized into a response.
// Do NOT change this to `{ ...user }` — that would leak the hash. (Same rule as
// presentAuthUserV1; see the auth skill §4.)
export function presentUserV1(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    created_at: user.createdAt.getTime(),
  }
}

export function presentUserListV1(users: User[]) {
  return users.map(presentUserV1)
}
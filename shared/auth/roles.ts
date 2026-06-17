// Domain roles — shared by the DB schema ($type), Zod contracts, server guards,
// and the client. Add roles here and everything else stays in sync.
export const ROLES = ['user', 'admin', 'super_admin'] as const

export type UserRole = (typeof ROLES)[number]

// Privilege ladder. Higher number = more privilege. Drives "minimum role" checks
// so a higher role inherits everything below it — a super_admin can do anything
// an admin can, without listing both everywhere.
export const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  admin: 1,
  super_admin: 2,
}

// True if `role` is at least as privileged as `min`.
export function roleAtLeast(role: UserRole, min: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min]
}

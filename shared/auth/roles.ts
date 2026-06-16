// Domain roles — shared by the DB schema ($type), Zod contracts, server guards,
// and the client. Add roles here and everything else stays in sync.
export const ROLES = ['user', 'admin', 'super-admin'] as const

export type UserRole = (typeof ROLES)[number]

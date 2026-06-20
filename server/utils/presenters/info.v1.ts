import type { Info } from '../../db/schema'

// v1 PRESENTER for the singleton `informations` record (identity + branding
// only — see schema.ts split notice). Spread + convert timestamps, same as
// before; field count dropped from ~26 to ~10 but the shape rule is the same.
export function presentInfoV1(info: Info) {
  return {
    ...info,
    createdAt: info.createdAt.toISOString(),
    updatedAt: info.updatedAt.toISOString(),
  }
}

import type { Info } from '../../db/schema'

// v1 PRESENTER for the singleton `informations` record.
// Unlike user.v1 (which hand-lists a few fields), info has ~26 fields and the
// contract is "the whole config", so we spread and only convert the timestamps
// to ISO strings. Add/remove fields here to shape the public v1 response.
export function presentInfoV1(info: Info) {
  return {
    ...info,
    createdAt: info.createdAt.toISOString(),
    updatedAt: info.updatedAt.toISOString(),
  }
}

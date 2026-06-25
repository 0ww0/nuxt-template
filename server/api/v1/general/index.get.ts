import { generalService } from '../../../services/general.service'
import { presentGeneralV1 } from '../../../utils/presenters/general.v1'

export const GENERAL_CACHE_KEY = 'api:v1:general'

// The EXACT storage key Nitro uses for this cached handler, exported so the
// write handlers purge precisely the entry that's stored. Pattern is
// `nitro:handlers:<name>:<getKey>.json`. We pin getKey to a constant
// ('singleton') below — without it, Nitro appends a hash of the request URL and
// this key would never match the purge, leaving stale data until the TTL.
export const GENERAL_CACHE_STORAGE_KEY = `nitro:handlers:${GENERAL_CACHE_KEY}:singleton.json`

// GET /api/v1/general — cached 5 min; purged on write (see index.post.ts / index.patch.ts).
// Short TTL is intentional: maintenance mode must propagate quickly even if a
// purge fails (e.g. cache storage is temporarily unavailable).
export default cachedEventHandler(async () => {
  return presentGeneralV1(await generalService.get())
}, {
  name: GENERAL_CACHE_KEY,
  // Singleton → one global entry. A constant key makes the stored key
  // deterministic so the write handlers can evict it exactly.
  getKey: () => 'singleton',
  maxAge: 60 * 5, // 5 minutes
})
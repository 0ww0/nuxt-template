// SINGLETON PATTERN — one row pinned to id = 1.
// GET: cached read (cachedEventHandler). POST/PATCH: upsert + cache purge.
// No [id] routes. See api skill §2 for the full pattern.
// Cache key: import INFO_CACHE_STORAGE_KEY from './index.get'
import { infoService } from '../../../services/info.service'
import { presentInfoV1 } from '../../../utils/presenters/info.v1'

export const INFO_CACHE_KEY = 'api:v1:info'

// The EXACT storage key Nitro uses for this cached handler, exported so the
// write handlers purge precisely the entry that's stored. Pattern is
// `nitro:handlers:<name>:<getKey>.json`. We pin getKey to a constant
// ('singleton') below — without it, Nitro appends a hash of the request URL and
// this key would never match the purge, leaving stale data until the TTL.
export const INFO_CACHE_STORAGE_KEY = `nitro:handlers:${INFO_CACHE_KEY}:singleton.json`

// GET /api/v1/info — cached 24h; purged on write (see index.post.ts / index.patch.ts).
export default cachedEventHandler(async () => {
  return presentInfoV1(await infoService.get())
}, {
  name: INFO_CACHE_KEY,
  // Singleton → one global entry. A constant key makes the stored key
  // deterministic so the write handlers can evict it exactly.
  getKey: () => 'singleton',
  maxAge: 60 * 60 * 24, // 24 hours
})

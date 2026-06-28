// SINGLETON PATTERN — one row pinned to id = 1.
// GET: cached read (cachedEventHandler). POST/PATCH: upsert + cache purge.
// No [id] routes. See api skill §2 for the full pattern.
// Cache key: import ANALYTICS_CACHE_STORAGE_KEY from './index.get'
import { analyticsService } from '../../../services/analytics.service'
import { presentAnalyticsV1 } from '../../../utils/presenters/analytics.v1'

export const ANALYTICS_CACHE_KEY = 'api:v1:analytics'

// The EXACT storage key Nitro uses for this cached handler, exported so the
// write handlers purge precisely the entry that's stored.
export const ANALYTICS_CACHE_STORAGE_KEY = `nitro:handlers:${ANALYTICS_CACHE_KEY}:singleton.json`

// GET /api/v1/analytics — cached 1h; purged on write (see index.post.ts / index.patch.ts).
export default cachedEventHandler(async () => {
  return presentAnalyticsV1(await analyticsService.get())
}, {
  name: ANALYTICS_CACHE_KEY,
  // Singleton → one global entry. A constant key makes the stored key
  // deterministic so the write handlers can evict it exactly.
  getKey: () => 'singleton',
  maxAge: 60 * 60, // 1 hour
})

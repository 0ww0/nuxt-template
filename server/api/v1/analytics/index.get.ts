import { analyticsService } from '../../../services/analytics.service'
import { presentAnalyticsV1 } from '../../../utils/presenters/analytics.v1'

export const ANALYTICS_CACHE_KEY = 'api:v1:analytics'

// GET /api/v1/analytics — cached 1h; purged on write (see index.post.ts / index.patch.ts).
// Shorter TTL than info/seo: tracking IDs may rotate more frequently.
export default cachedEventHandler(async () => {
  return presentAnalyticsV1(await analyticsService.get())
}, {
  name: ANALYTICS_CACHE_KEY,
  maxAge: 60 * 60, // 1 hour
})

import { analyticsService } from '../../../services/analytics.service'
import { presentAnalyticsV1 } from '../../../utils/presenters/analytics.v1'

// GET /api/v1/analytics — returns the singleton analytics settings record.
// Public read (client needs analyticsEnabled + tracking IDs to bootstrap scripts).
export default defineEventHandler(async () => {
  return presentAnalyticsV1(await analyticsService.get())
})

import { updateAnalyticsV1Schema } from '~~/shared/schemas/v1/analytics.schema'
import { analyticsService } from '../../../services/analytics.service'
import { presentAnalyticsV1 } from '../../../utils/presenters/analytics.v1'
import { requireMinRole } from '../../../utils/auth'

// PATCH /api/v1/analytics — super_admin only (anon → 401, below super_admin → 403).
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'super_admin')
  const body = await readValidatedBody(event, updateAnalyticsV1Schema.parse)
  return presentAnalyticsV1(await analyticsService.save(body))
})

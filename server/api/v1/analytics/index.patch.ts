import { updateAnalyticsV1Schema } from '~~/shared/schemas/v1/analytics.schema'
import { analyticsService } from '../../../services/analytics.service'
import { presentAnalyticsV1 } from '../../../utils/presenters/analytics.v1'
import { requireMinRole } from '../../../utils/auth'
import { ANALYTICS_CACHE_KEY } from './index.get'

// PATCH /api/v1/analytics — super_admin only; purges the GET cache on success.
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'super_admin')
  const body = await readValidatedBody(event, updateAnalyticsV1Schema.parse)
  const result = await analyticsService.save(body)
  await useStorage('cache').removeItem(`nitro:handlers:${ANALYTICS_CACHE_KEY}.json`)
  return presentAnalyticsV1(result)
})

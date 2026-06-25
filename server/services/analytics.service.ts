import { analyticsRepository } from '../repositories/analytics.repository'
import { notFound } from '../utils/errors'
import type { NewAnalyticsSettings } from '../db/schema'

// SERVICE LAYER — business rules for the singleton `analytics_settings` record.
export const analyticsService = {
  async get() {
    const analytics = await analyticsRepository.find()
    if (!analytics) throw notFound('Analytics settings (PATCH /api/v1/analytics to create it)')
    return analytics
  },

  save(data: Partial<NewAnalyticsSettings>) {
    return analyticsRepository.upsert(data)
  },
}

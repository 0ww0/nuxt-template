import type { AnalyticsSettings } from '../../db/schema'

// v1 PRESENTER for the singleton `analytics_settings` record.
export function presentAnalyticsV1(analytics: AnalyticsSettings) {
  return {
    ...analytics,
    createdAt: analytics.createdAt.toISOString(),
    updatedAt: analytics.updatedAt.toISOString(),
  }
}

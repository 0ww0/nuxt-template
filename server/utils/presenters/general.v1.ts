import type { GeneralSettings } from '../../db/schema'

// v1 PRESENTER for the singleton `general_settings` record.
export function presentGeneralV1(general: GeneralSettings) {
  return {
    ...general,
    createdAt: general.createdAt.toISOString(),
    updatedAt: general.updatedAt.toISOString(),
  }
}

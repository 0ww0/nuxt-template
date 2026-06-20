import { generalRepository } from '../repositories/general.repository'
import { notFound } from '../utils/errors'
import type { NewGeneralSettings } from '../db/schema'

// SERVICE LAYER — business rules for the singleton `general_settings` record.
export const generalService = {
  async get() {
    const general = await generalRepository.find()
    if (!general) throw notFound('General settings (PATCH /api/v1/general to create it)')
    return general
  },

  save(data: Partial<NewGeneralSettings>) {
    return generalRepository.upsert(data)
  },
}

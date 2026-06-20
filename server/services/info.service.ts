import { infoRepository } from '../repositories/info.repository'
import { notFound } from '../utils/errors'
import type { NewInfo } from '../db/schema'

// SERVICE LAYER — business rules for the singleton `informations` record.
export const infoService = {
  async get() {
    const info = await infoRepository.find()
    if (!info) throw notFound('Application information (PATCH /api/v1/info to create it)')
    return info
  },

  save(data: Partial<NewInfo>) {
    return infoRepository.upsert(data)
  },
}

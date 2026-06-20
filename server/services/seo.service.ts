import { seoRepository } from '../repositories/seo.repository'
import { notFound } from '../utils/errors'
import type { NewSeoSettings } from '../db/schema'

// SERVICE LAYER — business rules for the singleton `seo_settings` record.
export const seoService = {
  async get() {
    const seo = await seoRepository.find()
    if (!seo) throw notFound('SEO settings (PATCH /api/v1/seo to create it)')
    return seo
  },

  save(data: Partial<NewSeoSettings>) {
    return seoRepository.upsert(data)
  },
}

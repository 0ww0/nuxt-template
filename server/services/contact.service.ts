import { contactRepository } from '../repositories/contact.repository'
import { notFound } from '../utils/errors'
import type { NewContactSettings } from '../db/schema'

// SERVICE LAYER — business rules for the singleton `contact_settings` record.
export const contactService = {
  async get() {
    const contact = await contactRepository.find()
    if (!contact) throw notFound('Contact settings (PATCH /api/v1/contact to create it)')
    return contact
  },

  save(data: Partial<NewContactSettings>) {
    return contactRepository.upsert(data)
  },
}

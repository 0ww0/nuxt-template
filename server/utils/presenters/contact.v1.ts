import type { ContactSettings } from '../../db/schema'

// v1 PRESENTER for the singleton `contact_settings` record.
export function presentContactV1(contact: ContactSettings) {
  return {
    ...contact,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  }
}

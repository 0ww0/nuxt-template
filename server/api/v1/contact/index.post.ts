import { updateContactV1Schema } from '~~/shared/schemas/v1/contact.schema'
import { contactService } from '../../../services/contact.service'
import { presentContactV1 } from '../../../utils/presenters/contact.v1'
import { requireMinRole } from '../../../utils/auth'
import { CONTACT_CACHE_KEY } from './index.get'

// POST /api/v1/contact — admin or higher; purges the GET cache on success.
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'admin')
  const body = await readValidatedBody(event, updateContactV1Schema.parse)
  const result = await contactService.save(body)
  await useStorage('cache').removeItem(`nitro:handlers:${CONTACT_CACHE_KEY}.json`)
  return presentContactV1(result)
})

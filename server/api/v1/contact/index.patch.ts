import { updateContactV1Schema } from '~~/shared/schemas/v1/contact.schema'
import { contactService } from '../../../services/contact.service'
import { presentContactV1 } from '../../../utils/presenters/contact.v1'
import { requireMinRole } from '../../../utils/auth'

// PATCH /api/v1/contact — admin or higher (lighter gate than info/seo/analytics/
// general: contact details aren't site-critical the way branding or maintenance
// mode are). anon → 401, below admin → 403.
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'admin')
  const body = await readValidatedBody(event, updateContactV1Schema.parse)
  return presentContactV1(await contactService.save(body))
})

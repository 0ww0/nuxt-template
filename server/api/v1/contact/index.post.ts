import { updateContactV1Schema } from '~~/shared/schemas/v1/contact.schema'
import { contactService } from '../../../services/contact.service'
import { presentContactV1 } from '../../../utils/presenters/contact.v1'
import { requireMinRole } from '../../../utils/auth'

// POST /api/v1/contact — admin or higher (see index.patch.ts for the gate rationale).
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'admin')
  const body = await readValidatedBody(event, updateContactV1Schema.parse)
  return presentContactV1(await contactService.save(body))
})

import { contactService } from '../../../services/contact.service'
import { presentContactV1 } from '../../../utils/presenters/contact.v1'

// GET /api/v1/contact — returns the singleton contact settings record. Public read.
export default defineEventHandler(async () => {
  return presentContactV1(await contactService.get())
})

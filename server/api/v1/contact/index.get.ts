import { contactService } from '../../../services/contact.service'
import { presentContactV1 } from '../../../utils/presenters/contact.v1'

export const CONTACT_CACHE_KEY = 'api:v1:contact'

// GET /api/v1/contact — cached 6h; purged on write (see index.post.ts / index.patch.ts).
export default cachedEventHandler(async () => {
  return presentContactV1(await contactService.get())
}, {
  name: CONTACT_CACHE_KEY,
  maxAge: 60 * 60 * 6, // 6 hours
})

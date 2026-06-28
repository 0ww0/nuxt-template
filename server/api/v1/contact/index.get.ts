// SINGLETON PATTERN — one row pinned to id = 1.
// GET: cached read (cachedEventHandler). POST/PATCH: upsert + cache purge.
// No [id] routes. See api skill §2 for the full pattern.
// Cache key: import CONTACT_CACHE_STORAGE_KEY from './index.get'
import { contactService } from '../../../services/contact.service'
import { presentContactV1 } from '../../../utils/presenters/contact.v1'

export const CONTACT_CACHE_KEY = 'api:v1:contact'

// The EXACT storage key Nitro uses for this cached handler, exported so the
// write handlers purge precisely the entry that's stored.
export const CONTACT_CACHE_STORAGE_KEY = `nitro:handlers:${CONTACT_CACHE_KEY}:singleton.json`

// GET /api/v1/contact — cached 6h; purged on write (see index.post.ts / index.patch.ts).
export default cachedEventHandler(async () => {
  return presentContactV1(await contactService.get())
}, {
  name: CONTACT_CACHE_KEY,
  // Singleton → one global entry. A constant key makes the stored key
  // deterministic so the write handlers can evict it exactly.
  getKey: () => 'singleton',
  maxAge: 60 * 60 * 6, // 6 hours
})

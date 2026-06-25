import { contactService } from '../../../services/contact.service'
import { presentContactV1 } from '../../../utils/presenters/contact.v1'

export const CONTACT_CACHE_KEY = 'api:v1:contact'

// The EXACT storage key Nitro uses for this cached handler, exported so the
// write handlers purge precisely the entry that's stored. Pattern is
// `nitro:handlers:<name>:<getKey>.json`. We pin getKey to a constant
// ('singleton') below — without it, Nitro appends a hash of the request URL and
// this key would never match the purge, leaving stale data until the TTL.
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

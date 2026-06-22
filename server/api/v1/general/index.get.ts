import { generalService } from '../../../services/general.service'
import { presentGeneralV1 } from '../../../utils/presenters/general.v1'

export const GENERAL_CACHE_KEY = 'api:v1:general'

// GET /api/v1/general — cached 5 min; purged on write (see index.post.ts / index.patch.ts).
// Short TTL is intentional: maintenance mode must propagate quickly even if a
// purge fails (e.g. cache storage is temporarily unavailable).
export default cachedEventHandler(async () => {
  return presentGeneralV1(await generalService.get())
}, {
  name: GENERAL_CACHE_KEY,
  maxAge: 60 * 5, // 5 minutes
})

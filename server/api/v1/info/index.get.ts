import { infoService } from '../../../services/info.service'
import { presentInfoV1 } from '../../../utils/presenters/info.v1'

export const INFO_CACHE_KEY = 'api:v1:info'

// GET /api/v1/info — cached 24h; purged on write (see index.post.ts / index.patch.ts).
export default cachedEventHandler(async () => {
  return presentInfoV1(await infoService.get())
}, {
  name: INFO_CACHE_KEY,
  maxAge: 60 * 60 * 24, // 24 hours
})

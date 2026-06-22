import { seoService } from '../../../services/seo.service'
import { presentSeoV1 } from '../../../utils/presenters/seo.v1'

export const SEO_CACHE_KEY = 'api:v1:seo'

// GET /api/v1/seo — cached 24h; purged on write (see index.post.ts / index.patch.ts).
export default cachedEventHandler(async () => {
  return presentSeoV1(await seoService.get())
}, {
  name: SEO_CACHE_KEY,
  maxAge: 60 * 60 * 24, // 24 hours
})

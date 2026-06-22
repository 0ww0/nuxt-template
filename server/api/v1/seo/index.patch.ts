import { updateSeoV1Schema } from '~~/shared/schemas/v1/seo.schema'
import { seoService } from '../../../services/seo.service'
import { presentSeoV1 } from '../../../utils/presenters/seo.v1'
import { requireMinRole } from '../../../utils/auth'
import { SEO_CACHE_KEY } from './index.get'

// PATCH /api/v1/seo — super_admin only; purges the GET cache on success.
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'super_admin')
  const body = await readValidatedBody(event, updateSeoV1Schema.parse)
  const result = await seoService.save(body)
  await useStorage('cache').removeItem(`nitro:handlers:${SEO_CACHE_KEY}.json`)
  return presentSeoV1(result)
})

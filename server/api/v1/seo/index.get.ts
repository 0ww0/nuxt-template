import { seoService } from '../../../services/seo.service'
import { presentSeoV1 } from '../../../utils/presenters/seo.v1'

// GET /api/v1/seo — returns the singleton SEO settings record. Public read.
export default defineEventHandler(async () => {
  return presentSeoV1(await seoService.get())
})

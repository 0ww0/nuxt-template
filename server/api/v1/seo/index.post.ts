import { updateSeoV1Schema } from '~~/shared/schemas/v1/seo.schema'
import { seoService } from '../../../services/seo.service'
import { presentSeoV1 } from '../../../utils/presenters/seo.v1'
import { requireMinRole } from '../../../utils/auth'

// POST /api/v1/seo — super_admin only (anon → 401, below super_admin → 403).
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'super_admin')
  const body = await readValidatedBody(event, updateSeoV1Schema.parse)
  return presentSeoV1(await seoService.save(body))
})

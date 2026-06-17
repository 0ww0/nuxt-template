import { updateInfoV1Schema } from '~~/shared/schemas/v1/info.schema'
import { infoService } from '../../../services/info.service'
import { presentInfoV1 } from '../../../utils/presenters/info.v1'
import { requireMinRole } from '../../../utils/auth'

// POST /api/v1/info — super_admin only (anon → 401, below super_admin → 403).
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'super_admin')
  const body = await readValidatedBody(event, updateInfoV1Schema.parse)
  return presentInfoV1(await infoService.save(body))
})

import { updateGeneralV1Schema } from '~~/shared/schemas/v1/general.schema'
import { generalService } from '../../../services/general.service'
import { presentGeneralV1 } from '../../../utils/presenters/general.v1'
import { requireMinRole } from '../../../utils/auth'

// POST /api/v1/general — super_admin only (see index.patch.ts for the gate rationale).
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'super_admin')
  const body = await readValidatedBody(event, updateGeneralV1Schema.parse)
  return presentGeneralV1(await generalService.save(body))
})

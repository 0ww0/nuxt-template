import { updateInfoV1Schema } from '~~/shared/schemas/v1/info.schema'
import { infoService } from '../../../services/info.service'
import { presentInfoV1 } from '../../../utils/presenters/info.v1'

// POST /api/v1/info — alias of PATCH (preserves the original endpoint's behavior).
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, updateInfoV1Schema.parse)
  return presentInfoV1(await infoService.save(body))
})

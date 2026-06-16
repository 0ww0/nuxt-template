import { updateInfoV1Schema } from '~~/shared/schemas/v1/info.schema'
import { infoService } from '../../../services/info.service'
import { presentInfoV1 } from '../../../utils/presenters/info.v1'

// PATCH /api/v1/info — validate body (strict; blocks unknown keys), then
// create-or-update the singleton, then present.
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, updateInfoV1Schema.parse)
  return presentInfoV1(await infoService.save(body))
})

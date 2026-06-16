import { infoService } from '../../../services/info.service'
import { presentInfoV1 } from '../../../utils/presenters/info.v1'

// GET /api/v1/info — returns the singleton application info record.
export default defineEventHandler(async () => {
  return presentInfoV1(await infoService.get())
})

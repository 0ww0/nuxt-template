import { generalService } from '../../../services/general.service'
import { presentGeneralV1 } from '../../../utils/presenters/general.v1'

// GET /api/v1/general — returns the singleton general settings record.
// Public read (client needs maintenanceMode to render the maintenance page).
export default defineEventHandler(async () => {
  return presentGeneralV1(await generalService.get())
})

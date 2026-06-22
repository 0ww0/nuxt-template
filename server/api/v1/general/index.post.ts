import { updateGeneralV1Schema } from '~~/shared/schemas/v1/general.schema'
import { generalService } from '../../../services/general.service'
import { presentGeneralV1 } from '../../../utils/presenters/general.v1'
import { requireMinRole } from '../../../utils/auth'
import { GENERAL_CACHE_KEY } from './index.get'

// POST /api/v1/general — super_admin only; purges the GET cache on success.
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'super_admin')
  const body = await readValidatedBody(event, updateGeneralV1Schema.parse)
  const result = await generalService.save(body)
  await useStorage('cache').removeItem(`nitro:handlers:${GENERAL_CACHE_KEY}.json`)
  return presentGeneralV1(result)
})

import { updateInfoV1Schema } from '~~/shared/schemas/v1/info.schema'
import { infoService } from '../../../services/info.service'
import { presentInfoV1 } from '../../../utils/presenters/info.v1'
import { requireMinRole } from '../../../utils/auth'
import { INFO_CACHE_KEY } from './index.get'

// PATCH /api/v1/info — super_admin only; purges the GET cache on success.
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'super_admin')
  const body = await readValidatedBody(event, updateInfoV1Schema.parse)
  const result = await infoService.save(body)
  await useStorage('cache').removeItem(`nitro:handlers:${INFO_CACHE_KEY}.json`)
  return presentInfoV1(result)
})

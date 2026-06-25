import { updateInfoV1Schema } from '~~/shared/schemas/v1/info.schema'
import { infoService } from '../../../services/info.service'
import { presentInfoV1 } from '../../../utils/presenters/info.v1'
import { requireMinRole } from '../../../utils/auth'
import { INFO_CACHE_STORAGE_KEY } from './index.get'

// PATCH /api/v1/info — super_admin only; purges the GET cache on success.
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'super_admin')
  const body = await readValidatedBody(event, updateInfoV1Schema.parse)
  const result = await infoService.save(body)
  // Evict the EXACT cached entry (see INFO_CACHE_STORAGE_KEY). The previous
  // `${KEY}.json` form omitted the getKey segment and silently no-op'd.
  await useStorage('cache').removeItem(INFO_CACHE_STORAGE_KEY)
  return presentInfoV1(result)
})

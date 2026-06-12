import { z } from 'zod'
import { updateUserV1Schema } from '@shared/schemas/v1/user.schema'
import { userService } from '../../../services/user.service'
import { presentUserV1 } from '../../../utils/presenters/user.v1'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

// PATCH /api/v1/users/:id
export default defineEventHandler(async (event) => {
    const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
    const body = await readValidatedBody(event, updateUserV1Schema.parse)
    const user = await userService.update(id, body)
    return presentUserV1(user!)
})

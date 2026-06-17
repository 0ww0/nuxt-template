import { requireMinRole } from '../../../utils/auth'
import { presentAuthUserV1 } from '../../../utils/presenters/auth.v1'

// GET /api/v1/admin/overview — admin-only.
// The client-side `role` middleware is UX; THIS server check is the real
// authorization boundary. Lives in root server/ (not the layer) so the edge
// layer stays unfragmented.
export default defineEventHandler(async (event) => {
  const admin = await requireMinRole(event, 'admin') // admin or higher (super_admin inherits)
  return {
    admin: presentAuthUserV1(admin),
    message: 'Welcome to the admin area.',
  }
})

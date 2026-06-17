import type { UserRole } from '~~/shared/auth/roles'

// Named middleware (opt-in). Reads page meta:
//   minRole: 'admin'              → that role OR higher (hierarchical, preferred)
//   requiredRole: 'admin' | [...] → exact match against one of these (orthogonal)
// Also covers the "must be logged in" check. Client-side UX guard; the
// server-side requireMinRole/requireRole is the real boundary.
export default defineNuxtRouteMiddleware(async (to) => {
  const minRole = to.meta.minRole as UserRole | undefined
  const required = to.meta.requiredRole as UserRole | UserRole[] | undefined
  if (!minRole && !required) return // nothing pinned → nothing to enforce

  const { user, fetchUser, hasRole, hasMinRole } = useAuth()
  if (!user.value) await fetchUser()
  if (!user.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  const allowed = minRole
    ? hasMinRole(minRole)
    : hasRole(...(Array.isArray(required) ? required : [required!]))
  if (!allowed) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
})

import type { UserRole } from '~~/shared/auth/roles'

// Named middleware (opt-in). Gates a page (or a whole layer's layout) by role:
//   definePageMeta({ middleware: 'role', requiredRole: 'admin' })
//   definePageMeta({ middleware: 'role', requiredRole: ['admin', 'editor'] })
// Also covers the "must be logged in" check, so you don't need 'auth' as well.
export default defineNuxtRouteMiddleware(async (to) => {
  const required = to.meta.requiredRole as UserRole | UserRole[] | undefined
  if (!required) return // no role pinned → nothing to enforce here

  const roles = Array.isArray(required) ? required : [required]
  const { user, fetchUser, hasRole } = useAuth()
  if (!user.value) await fetchUser()

  if (!user.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
  if (!hasRole(...roles)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
})

// Named middleware (opt-in). Use on pages that need any logged-in user:
//   definePageMeta({ middleware: 'auth' })
// Client-side UX guard; the server-side requireUser/requireRole is the real
// boundary.
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchUser } = useAuth()
  if (!user.value) await fetchUser()
  if (!user.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})

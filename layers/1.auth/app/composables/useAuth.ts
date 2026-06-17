import { roleAtLeast, type UserRole } from '~~/shared/auth/roles'

// Client-side mirror of the v1 auth presenter shape.
export interface AuthUser {
  id: number
  name: string
  email: string
  role: UserRole
  email_verified: boolean
  created_at: number
}

// One shared auth core for every entry point / area. Different login pages can
// all call this composable; the session lives in the httpOnly cookie.
export function useAuth() {
  const user = useState<AuthUser | null>('auth:user', () => null)

  // Uses useRequestFetch so the session cookie is forwarded during SSR — the
  // server then knows the user on first render (no auth flicker).
  async function fetchUser() {
    const authedFetch = useRequestFetch()
    try {
      user.value = await authedFetch<AuthUser>('/api/v1/auth/me')
    } catch {
      user.value = null
    }
    return user.value
  }

  async function login(email: string, password: string) {
    user.value = await $fetch<AuthUser>('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    return user.value
  }

  async function logout() {
    await $fetch('/api/v1/auth/logout', { method: 'POST' })
    user.value = null
    await navigateTo('/login')
  }

  const isLoggedIn = computed(() => user.value !== null)
  const hasRole = (...roles: UserRole[]) =>
    !!user.value && roles.includes(user.value.role)
  const hasMinRole = (min: UserRole) =>
    !!user.value && roleAtLeast(user.value.role, min)

  return { user, isLoggedIn, hasRole, hasMinRole, fetchUser, login, logout }
}

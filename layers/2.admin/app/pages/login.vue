<script setup lang="ts">
import { loginV1Schema } from '~~/shared/schemas/v1/auth.schema'

// A second, independent entry point — same auth core, different door.
const route = useRoute()
const { login } = useAuth()

const form = reactive({ email: '', password: '' })
const error = ref<string | null>(null)
const pending = ref(false)

async function submit() {
  error.value = null
  const parsed = loginV1Schema.safeParse(form)
  if (!parsed.success) {
    error.value = parsed.error.issues[0]?.message ?? 'Invalid input'
    return
  }
  pending.value = true
  try {
    const u = await login(parsed.data.email, parsed.data.password)
    if (u?.role !== 'admin') {
      error.value = 'This account is not an admin.'
      return
    }
    await navigateTo((route.query.redirect as string) || '/admin')
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'Login failed'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main style="max-width: 360px; margin: 3rem auto; font-family: system-ui;">
    <h1>Admin sign in</h1>
    <form @submit.prevent="submit" style="display: grid; gap: 0.5rem; margin-top: 1rem;">
      <input v-model="form.email" type="email" placeholder="Email" autocomplete="email" />
      <input
        v-model="form.password"
        type="password"
        placeholder="Password"
        autocomplete="current-password"
      />
      <button :disabled="pending" type="submit">
        {{ pending ? 'Signing in…' : 'Sign in' }}
      </button>
      <p v-if="error" style="color: #c00;">{{ error }}</p>
    </form>
  </main>
</template>

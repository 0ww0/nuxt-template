<script setup lang="ts">
import { loginV1Schema } from '~~/shared/schemas/v1/auth.schema'

// The primary login. The auth/role middleware redirect here with ?redirect=…
definePageMeta({ layout: 'portal' })

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
    await login(parsed.data.email, parsed.data.password)
    await navigateTo((route.query.redirect as string) || '/dashboard')
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'Login failed'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section style="max-width: 360px; margin: 1rem auto;">
    <h1>Sign in</h1>
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
  </section>
</template>

<script setup lang="ts">
import { createUserV1Schema } from '~~/shared/schemas/v1/user.schema'

// Note: the SAME Zod schema validates on the client here and on the server in
// the POST handler — that's the payoff of putting it in shared/.

const { data: users, refresh } = await useFetch('/api/v1/users')

const form = reactive({ name: '', email: '' })
const error = ref<string | null>(null)
const pending = ref(false)

async function submit() {
  error.value = null
  const parsed = createUserV1Schema.safeParse(form)
  if (!parsed.success) {
    error.value = parsed.error.issues[0]?.message ?? 'Invalid input'
    return
  }
  pending.value = true
  try {
    await $fetch('/api/v1/users', { method: 'POST', body: parsed.data })
    form.name = ''
    form.email = ''
    await refresh()
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'Something went wrong'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main style="max-width: 540px; margin: 3rem auto; font-family: system-ui;">
    <h1>Users (API v1)</h1>

    <form @submit.prevent="submit" style="display: grid; gap: 0.5rem; margin: 1rem 0;">
      <input v-model="form.name" placeholder="Name" />
      <input v-model="form.email" placeholder="Email" />
      <button :disabled="pending" type="submit">
        {{ pending ? 'Saving…' : 'Add user' }}
      </button>
      <p v-if="error" style="color: #c00;">{{ error }}</p>
    </form>

    <ul>
      <li v-for="u in users" :key="u.id">
        {{ u.name }} — {{ u.email }}
      </li>
    </ul>
  </main>
</template>

<script setup lang="ts">
// Any logged-in user; the `auth` middleware (from 1.auth) redirects anonymous
// visitors to /login.
definePageMeta({ layout: 'portal', middleware: 'auth' })

const { user } = useAuth()
</script>

<template>
  <section>
    <h1>Your dashboard</h1>
    <p v-if="user">
      Signed in as {{ user.name }} ({{ user.email }}) — role: {{ user.role }}.
    </p>
  </section>
</template>

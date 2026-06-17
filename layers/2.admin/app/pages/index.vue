<script setup lang="ts">
// Client gate: the `role` middleware (from 1.auth) reads requiredRole here and
// bounces non-admins. The /api/v1/admin/overview endpoint enforces the SAME role
// server-side, so the data is protected even if the client check is bypassed.
definePageMeta({
  layout: 'admin',
  middleware: 'role',
  minRole: 'admin', // admin or higher (super_admin inherits)
})

const { data: overview } = await useFetch('/api/v1/admin/overview')
</script>

<template>
  <section>
    <h1>Admin dashboard</h1>
    <p v-if="overview">{{ overview.message }} You are signed in as {{ overview.admin.name }}.</p>
  </section>
</template>

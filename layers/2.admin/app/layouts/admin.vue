<script setup lang="ts">
// `useAuth` comes from the 1.auth layer (auto-imported across layers).
const { user, isLoggedIn, logout } = useAuth()
</script>

<template>
  <div style="font-family: system-ui;">
    <header
      style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid #eee;"
    >
      <strong>Admin</strong>
      <nav style="display: flex; gap: 1rem; align-items: center;">
        <NuxtLink to="/admin">Dashboard</NuxtLink>
        <span v-if="isLoggedIn">{{ user?.name }} ({{ user?.role }})</span>
        <button v-if="isLoggedIn" type="button" @click="logout">Log out</button>
      </nav>
    </header>
    <main style="max-width: 720px; margin: 2rem auto; padding: 0 1rem;">
      <slot />
    </main>
  </div>
</template>

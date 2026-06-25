<script setup lang="ts">
const { user, isLoggedIn, logout } = useAuth()
</script>

<template>
  <div style="font-family: system-ui;">
    <header
      style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid #eee;"
    >
      <strong>Portal</strong>
      <nav style="display: flex; gap: 1rem; align-items: center;">
        <NuxtLink to="/dashboard">Dashboard</NuxtLink>
        <span v-if="isLoggedIn">{{ user?.name }}</span>
        <button v-if="isLoggedIn" type="button" @click="logout">Log out</button>
        <NuxtLink v-else to="/login">Sign in</NuxtLink>
      </nav>
    </header>
    <main style="max-width: 720px; margin: 2rem auto; padding: 0 1rem;">
      <slot />
    </main>
  </div>
</template>

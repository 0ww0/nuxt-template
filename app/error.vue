<script setup lang="ts">
import type { NuxtError } from '#app'
const props = defineProps<{ error: NuxtError }>()

// Computed properties for better DX and backward compatibility
const statusCode = computed(() => props.error?.status || 500)
const statusText = computed(() => props.error?.statusText || 'Internal Server Error')
const message = computed(() => props.error?.message || 'An unexpected error occurred')
const stack = computed(() => props.error?.stack)

const handleClearError = () => clearError({ redirect: '/' })
</script>

<template>
  <main>
    <h1>{{ statusCode }} - {{ statusText }}</h1>
    <p>{{ message }}</p>
    <pre v-if="stack">{{ stack }}</pre>
    <button @click="handleClearError">Return to Home</button>
  </main>
</template>
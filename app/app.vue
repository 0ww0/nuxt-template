<script lang="ts" setup>
import { UiHead } from './components/ui/head/'
</script>

<template>
  <UiHead />
  <NuxtLoadingIndicator />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <ClientOnly>
  </ClientOnly>
</template>

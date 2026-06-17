<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
</script>

<template>
	<div>
		<h1>{{ error.status }}</h1>
		<p>{{ error.statusText }}</p>
		<NuxtLink to="/">Go back home</NuxtLink>
	</div>
</template>
<script setup lang="ts">
import { inject } from 'vue';
import { AvatarContextKey } from './avatar.types';

const avatarContext = inject(AvatarContextKey, null);

withDefaults(defineProps<{ as?: string }>(), {
	as: 'div',
});
</script>

<template>
	<component :is="as" v-if="!avatarContext || avatarContext.imageStatus.value !== 'loaded'" class="avatar-fallback">
		<slot />
	</component>
</template>

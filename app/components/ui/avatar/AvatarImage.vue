<script setup lang="ts">
import { inject, watch } from 'vue';
import { AvatarContextKey } from './avatar.types';

interface AvatarImageProps {
	as?: string;
	src?: string;
	alt?: string;
}

const props = withDefaults(defineProps<AvatarImageProps>(), {
	as: 'img',
});

const avatarContext = inject(AvatarContextKey, null);

watch(
	() => props.src,
	(src) => {
		if (avatarContext) avatarContext.imageStatus.value = src ? 'loading' : 'idle';
	},
	{ immediate: true },
);

const onLoad = () => {
	if (avatarContext) avatarContext.imageStatus.value = 'loaded';
};

const onError = () => {
	if (avatarContext) avatarContext.imageStatus.value = 'error';
};
</script>

<template>
	<component
		:is="as"
		v-if="src && avatarContext?.imageStatus.value !== 'error'"
		:src="src"
		:alt="alt"
		class="avatar-image"
		@load="onLoad"
		@error="onError"
	/>
</template>

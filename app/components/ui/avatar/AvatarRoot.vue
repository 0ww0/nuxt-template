<script setup lang="ts">
import { provide, ref, computed } from 'vue';
import { useConfig } from '@composables/useConfig';
import type { AvatarImageStatus } from './avatar.types';
import { AvatarContextKey } from './avatar.types';

interface AvatarRootProps {
	as?: string;
	size?: '8' | '10' | '12' | '14' | '16';
	shape?: 'circle' | 'rounded' | 'square';
	status?: 'default' | 'online' | 'offline' | 'away';
}

const props = withDefaults(defineProps<AvatarRootProps>(), {
	as: 'div',
	size: '12',
	shape: 'circle',
	status: 'default',
});

const config = useConfig();

const sizeClass: Record<NonNullable<AvatarRootProps['size']>, string> = {
	'8': 'avatar-8',
	'10': 'avatar-10',
	'12': 'avatar-12',
	'14': 'avatar-14',
	'16': 'avatar-16',
};

const shapeClass: Record<NonNullable<AvatarRootProps['shape']>, string> = {
	circle: 'avatar-circle',
	rounded: 'avatar-rounded',
	square: 'avatar-square',
};

const statusClass: Record<NonNullable<AvatarRootProps['status']>, string> = {
	default: '',
	online: 'avatar-online',
	offline: 'avatar-offline',
	away: 'avatar-away',
};

// The status ring is color-only, so it's invisible to screen readers and to
// anyone who can't distinguish the ring colors. This gives it a text
// alternative, using ConfigProvider's useId for an SSR-safe id.
const statusLabel: Record<NonNullable<AvatarRootProps['status']>, string> = {
	default: '',
	online: 'Online',
	offline: 'Offline',
	away: 'Away',
};

const statusId = config.value.useId?.();
const hasStatus = computed(() => props.status !== 'default');

const imageStatus = ref<AvatarImageStatus>('idle');

provide(AvatarContextKey, { imageStatus });
</script>

<template>
	<component
		:is="as"
		class="avatar-root"
		:class="[sizeClass[props.size], shapeClass[props.shape], statusClass[props.status]]"
		:aria-describedby="hasStatus ? statusId : undefined"
	>
		<slot />
		<span v-if="hasStatus" :id="statusId" class="sr-only">{{ statusLabel[props.status] }}</span>
	</component>
</template>

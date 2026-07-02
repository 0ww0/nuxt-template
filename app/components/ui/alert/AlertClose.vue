<script setup lang="ts">
import { mergeClassNames } from '@utils/mergeClassNames';

withDefaults(defineProps<{
	as?: string;
	icon?: string;
}>(), {
	as: 'button',
	icon: 'ri:close-line',
});
</script>

<template>
	<component :is="as" :class="mergeClassNames('alert-close', $attrs.class as string)" aria-label="Close">
		<Icon :name="icon" class="w-4 h-4" aria-hidden="true" />
	</component>
</template>

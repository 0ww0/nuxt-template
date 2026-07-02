<script setup lang="ts">
import { mergeClassNames } from '@utils/mergeClassNames';

withDefaults(defineProps<{
	as?: string;
}>(), {
	as: 'div',
});
</script>

<template>
	<component :is="as" :class="mergeClassNames('alert-content', $attrs.class as string)">
		<slot />
	</component>
</template>

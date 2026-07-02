<script setup lang="ts">
import { mergeClassNames } from '@utils/mergeClassNames';

withDefaults(defineProps<{
	as?: string;
	name: string;
}>(), {
	as: 'span',
});
</script>

<template>
	<component :is="as" aria-hidden="true" :class="mergeClassNames('alert-icon', $attrs.class as string)">
		<Icon :name="name" v-bind="$attrs" />
	</component>
</template>

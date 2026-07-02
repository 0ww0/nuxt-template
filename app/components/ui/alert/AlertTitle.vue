<script setup lang="ts">
import { inject } from 'vue';
import { mergeClassNames } from '@utils/mergeClassNames';
import { AlertContextKey } from './alert.types';

const alertContext = inject(AlertContextKey);

withDefaults(defineProps<{
	as?: string;
}>(), {
	as: 'h3',
});
</script>

<template>
	<component :is="as" :id="alertContext?.titleId" :class="mergeClassNames('alert-title', $attrs.class as string)">
		<slot />
	</component>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import { mergeClassNames } from '@utils/mergeClassNames';
import { AlertContextKey } from '@/types/alert.types';

const alertContext = inject(AlertContextKey);

withDefaults(defineProps<{
	as?: string;
}>(), {
	as: 'p',
});
</script>

<template>
	<component :is="as" :id="alertContext?.descriptionId"
		:class="mergeClassNames('alert-description', $attrs.class as string)">
		<slot />
	</component>
</template>

<script setup lang="ts">
import { provide } from 'vue';
import { useConfig } from '@composables/useConfig';
import { mergeClassNames } from '@utils/mergeClassNames';
import { AlertContextKey, type AlertColor, type AlertVariant, type AlertDirection } from './alert.types';

interface AlertProps {
	as?: string;
	variant?: AlertVariant;
	color?: AlertColor;
	direction?: AlertDirection;
}

const props = withDefaults(defineProps<AlertProps>(), {
	as: 'div',
	variant: 'default',
	color: 'neutral',
	direction: 'horizontal',
});

const config = useConfig();

// Generated once per root instance via ConfigProvider's SSR-safe useId(),
// same mechanism Accordion uses for aria-controls/aria-labelledby.
const titleId = config.value.useId?.() ?? '';
const descriptionId = config.value.useId?.() ?? '';

provide(AlertContextKey, { titleId, descriptionId });

const colorClass: Record<AlertColor, string> = {
	neutral: 'alert-neutral',
	info: 'alert-info',
	success: 'alert-success',
	warning: 'alert-warning',
	error: 'alert-error',
};

const variantClass: Record<AlertVariant, string> = {
	default: 'alert-default',
	outline: 'alert-outline',
	dashed: 'alert-dashed',
	soft: 'alert-soft',
	ghost: 'alert-ghost',
};

const directionClass: Record<AlertDirection, string> = {
	vertical: 'alert-vertical',
	horizontal: 'alert-horizontal',
};
</script>

<template>
	<component :is="as" role="alert" :dir="config.dir" :aria-labelledby="titleId" :aria-describedby="descriptionId"
		:class="mergeClassNames(
			'alert-root',
			directionClass[props.direction],
			colorClass[props.color],
			variantClass[props.variant],
		)">
		<slot />
	</component>
</template>

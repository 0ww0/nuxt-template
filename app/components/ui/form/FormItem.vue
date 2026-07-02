<script lang="ts" setup>
import { provide, ref } from 'vue';
import { useConfig } from '@composables/useConfig';
import { FormItemContextSymbol } from './useFormField';
import { mergeClassNames } from '@utils/mergeClassNames';

const props = defineProps<{
  class?: string;
}>();

// Falls back to CONFIG_DEFAULTS outside a ConfigProvider, so this never throws.
const config = useConfig();
const id = config.value.useId?.() ?? `form-item-${Math.random().toString(36).slice(2, 9)}`;

provide(FormItemContextSymbol, { id: ref(id) });
</script>

<template>
  <div :class="mergeClassNames('form-item', props.class)">
    <slot />
  </div>
</template>

<script lang="ts" setup>
import { useFormField } from './useFormField';
import { mergeClassNames } from '@utils/mergeClassNames';

const props = defineProps<{
  class?: string;
}>();

const { error, formItemId } = useFormField();
</script>

<template>
  <label :for="formItemId" :class="mergeClassNames('form-label', error && 'form-label-error', props.class)">
    <slot />
  </label>
</template>

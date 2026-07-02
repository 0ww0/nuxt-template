<script lang="ts" setup>
import { useFormField } from './useFormField';
import { mergeClassNames } from '@utils/mergeClassNames';

const props = defineProps<{
  class?: string;
}>();

const { formDescriptionId } = useFormField();
</script>

<template>
  <p :id="formDescriptionId" :class="mergeClassNames('form-description', props.class)">
    <slot />
  </p>
</template>

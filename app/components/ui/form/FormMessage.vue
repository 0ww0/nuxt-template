<script lang="ts" setup>
import { useFormField } from './useFormField';
import { mergeClassNames } from '@utils/mergeClassNames';

const props = defineProps<{
  class?: string;
}>();

const { error, formMessageId } = useFormField();
</script>

<template>
  <p
    v-if="error"
    :id="formMessageId"
    role="alert"
    :class="mergeClassNames('form-message', props.class)"
  >
    {{ error }}
  </p>
</template>

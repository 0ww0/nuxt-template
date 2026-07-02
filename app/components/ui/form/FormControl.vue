<script lang="ts" setup>
import { computed } from 'vue';
import { useFormField } from './useFormField';

const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

// Expose these properties to the slot
const slotProps = computed(() => ({
  id: formItemId.value,
  'aria-describedby': !error.value
    ? formDescriptionId.value
    : `${formDescriptionId.value} ${formMessageId.value}`,
  'aria-invalid': !!error.value,
}));
</script>

<template>
  <slot v-bind="slotProps" />
</template>

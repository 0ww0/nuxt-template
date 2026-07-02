<script lang="ts" setup>
import { provide, toRef, ref, inject, watch } from 'vue';
import { useConfig } from '@composables/useConfig';
import { FormFieldContextSymbol } from './useFormField';
import { FormContextSymbol } from '@composables/useForm';

const props = defineProps<{
  name?: string;
  error?: string;
}>();

// Falls back to CONFIG_DEFAULTS outside a ConfigProvider, so this never throws.
const config = useConfig();
const id = config.value.useId?.() ?? `form-field-${Math.random().toString(36).slice(2, 9)}`;

const formContext = inject(FormContextSymbol, undefined);
const manualError = toRef(props, 'error');
const name = toRef(props, 'name');

// If inside a Form, try to bind value and error
const error = ref(manualError.value);

if (formContext && props.name) {
  // Watch for form error changes
  watch(() => formContext.errors[props.name!], (newError) => {
    error.value = newError;
  });

  // Watch for manual error changes (override)
  watch(manualError, (newError) => {
    if (newError) error.value = newError;
  });
} else {
  watch(manualError, (val) => error.value = val);
}

provide(FormFieldContextSymbol, {
  id: ref(id),
  error,
  name
});
</script>

<template>
  <slot />
</template>

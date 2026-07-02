<script lang="ts" setup generic="T extends Record<string, any>">
import { provide } from 'vue';
import { useForm, type FormContext, FormContextSymbol } from '@composables/useForm';
import type { ZodSchema } from 'zod';

const props = withDefaults(defineProps<{
    initialValues?: T;
    schema?: ZodSchema<T>;
    validateOn?: 'input' | 'blur' | 'submit';
    class?: string;
}>(), {
    initialValues: () => ({} as T),
    validateOn: 'submit',
});

const emit = defineEmits<{
    (e: 'submit', values: T): void;
}>();

const form = useForm<T>({
    initialValues: props.initialValues,
    validationSchema: props.schema,
    validateOn: props.validateOn,
    onSubmit: async (values) => {
        emit('submit', values);
    },
});

provide(FormContextSymbol, form);

// Expose form methods to parent
defineExpose(form);
</script>

<template>
    <form @submit="form.handleSubmit" :class="props.class">
        <slot v-bind="form" />
    </form>
</template>

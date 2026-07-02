<script setup lang="ts">
import { provide, ref, watch } from 'vue';
import { useConfig } from '@composables/useConfig';
import { AccordionContextKey, type AccordionType } from './accordion.types';

interface AccordionProps {
    as?: string;
    type?: AccordionType;
    defaultValue?: string | string[];
    modelValue?: string | string[];
    collapsible?: boolean;
    triggerFirst?: boolean;
    disabled?: boolean;
}

const props = withDefaults(defineProps<AccordionProps>(), {
    as: 'div',
    type: 'single',
    collapsible: false,
    triggerFirst: false,
    disabled: false,
});

const emit = defineEmits(['update:modelValue']);

const config = useConfig();

const baseId = config.value.useId?.() ?? `accordion-${Math.random().toString(36).slice(2, 9)}`;

const internalValue = ref(props.modelValue ?? props.defaultValue ?? (props.type === 'multiple' ? [] : ''));

watch(() => props.modelValue, (newValue) => {
    if (newValue !== undefined) {
        internalValue.value = newValue;
    }
});

const toggleItem = (value: string) => {
    if (props.disabled) return;

    if (props.type === 'single') {
        const isCurrent = internalValue.value === value;
        if (isCurrent && props.collapsible) {
            internalValue.value = '';
        }
        else if (!isCurrent) {
            internalValue.value = value;
        }
    }
    else {
        const currentValues = Array.isArray(internalValue.value) ? internalValue.value : [];
        if (currentValues.includes(value)) {
            internalValue.value = currentValues.filter(v => v !== value);
        }
        else {
            internalValue.value = [...currentValues, value];
        }
    }
    emit('update:modelValue', internalValue.value);
};

provide(AccordionContextKey, {
    type: props.type,
    value: internalValue,
    toggleItem,
    disabled: props.disabled,
    triggerFirst: props.triggerFirst,
    baseId,
});
</script>

<template>
    <component :is="as" class="accordion-root" :dir="config.dir" data-orientation="vertical">
        <slot />
    </component>
</template>

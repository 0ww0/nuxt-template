<script setup lang="ts">
import { provide, computed, inject } from 'vue';
import { AccordionContextKey, AccordionItemContextKey } from './accordion.types';

interface AccordionItemProps {
    as?: string;
    value: string;
    disabled?: boolean;
}

const props = withDefaults(defineProps<AccordionItemProps>(), {
    as: 'div',
    disabled: false,
});

const accordionContext = inject(AccordionContextKey);

if (!accordionContext) {
    throw new Error('AccordionItem must be used within an Accordion component');
}

const isItemDisabled = computed(() => accordionContext.disabled || props.disabled);
const isOpen = computed(() => {
    if (accordionContext.type === 'single') {
        return accordionContext.value.value === props.value;
    }
    return Array.isArray(accordionContext.value.value) && accordionContext.value.value.includes(props.value);
});

const triggerId = `${accordionContext.baseId}-trigger-${props.value}`;
const contentId = `${accordionContext.baseId}-content-${props.value}`;

provide(AccordionItemContextKey, {
    value: props.value,
    disabled: isItemDisabled,
    isOpen,
    toggle: () => accordionContext.toggleItem(props.value),
    triggerId,
    contentId,
});
</script>

<template>
    <component :is="as" class="accordion-item" :data-state="isOpen ? 'open' : 'closed'"
        :data-disabled="isItemDisabled ? '' : undefined">
        <slot />
    </component>
</template>

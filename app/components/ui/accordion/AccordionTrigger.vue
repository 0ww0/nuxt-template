<script setup lang="ts">
import { inject } from 'vue';
import { AccordionContextKey, AccordionItemContextKey } from './accordion.types';

interface AccordionTriggerProps {
    as?: string;
}

withDefaults(defineProps<AccordionTriggerProps>(), {
    as: 'button',
});

const itemContext = inject(AccordionItemContextKey);
const accordionContext = inject(AccordionContextKey);

if (!itemContext || !accordionContext) {
    throw new Error('AccordionTrigger must be used within an AccordionItem');
}
</script>

<template>
    <component :is="as" :id="itemContext.triggerId"
        :type="as === 'button' ? 'button' : undefined"
        :class="['accordion-trigger', accordionContext.triggerFirst && '[&>svg]:order-first justify-start']"
        :data-state="itemContext.isOpen.value ? 'open' : 'closed'"
        :disabled="itemContext.disabled.value"
        :aria-expanded="itemContext.isOpen.value"
        :aria-controls="itemContext.contentId"
        @click="itemContext.toggle">
        <slot />
        <slot name="icon">
            <Icon name="ri:arrow-down-s-line"
                :class="['accordion-icon', { 'rotate-180': itemContext.isOpen.value }]" />
        </slot>
    </component>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import { AccordionContextKey, AccordionItemContextKey } from './accordion.types';

interface AccordionContentProps {
    as?: string;
}

withDefaults(defineProps<AccordionContentProps>(), {
    as: 'div',
});

const itemContext = inject(AccordionItemContextKey);
const accordionContext = inject(AccordionContextKey);

if (!itemContext || !accordionContext) {
    throw new Error('AccordionContent must be used within an AccordionItem');
}
</script>

<template>
    <component :is="as"
        :id="itemContext.contentId"
        role="region"
        :aria-labelledby="itemContext.triggerId"
        class="accordion-content"
        :data-state="itemContext.isOpen.value ? 'open' : 'closed'"
        v-show="itemContext.isOpen.value"
        :inert="!itemContext.isOpen.value || undefined">
        <div class="accordion-content-inner">
            <div class="accordion-content-wrapper">
                <slot />
            </div>
        </div>
    </component>
</template>
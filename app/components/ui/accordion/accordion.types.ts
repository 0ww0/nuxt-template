import type { InjectionKey, ComputedRef, Ref } from 'vue';

export type AccordionType = 'single' | 'multiple';

export interface AccordionContext {
    type: AccordionType;
    value: Ref<string | string[]>;
    toggleItem: (value: string) => void;
    disabled: boolean;
    triggerFirst: boolean;
    baseId: string;
}

export interface AccordionItemContext {
    value: string;
    disabled: ComputedRef<boolean>;
    isOpen: ComputedRef<boolean>;
    toggle: () => void;
    triggerId: string;
    contentId: string;
}

export const AccordionContextKey: InjectionKey<AccordionContext> = Symbol('accordion-context');
export const AccordionItemContextKey: InjectionKey<AccordionItemContext> = Symbol('accordion-item-context');

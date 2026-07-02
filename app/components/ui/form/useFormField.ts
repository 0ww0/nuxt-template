import { inject, provide, computed, type InjectionKey, type Ref } from 'vue';

export interface FormFieldContextValue {
    id: Ref<string>;
    error?: Ref<string | undefined>;
    name?: Ref<string | undefined>;
}

export const FormFieldContextSymbol: InjectionKey<FormFieldContextValue> = Symbol('FormFieldContext');

export interface FormItemContextValue {
    id: Ref<string>;
}

export const FormItemContextSymbol: InjectionKey<FormItemContextValue> = Symbol('FormItemContext');

export function useFormField() {
    const fieldContext = inject(FormFieldContextSymbol);
    const itemContext = inject(FormItemContextSymbol);

    if (!fieldContext && !itemContext) {
        throw new Error('useFormField should be used within <FormField> or <FormItem>');
    }

    const id = computed(() => itemContext?.id.value ?? fieldContext?.id.value);
    
    return {
        id,
        name: computed(() => fieldContext?.name?.value),
        formItemId: computed(() => `${id.value}-form-item`),
        formDescriptionId: computed(() => `${id.value}-form-item-description`),
        formMessageId: computed(() => `${id.value}-form-item-message`),
        error: computed(() => fieldContext?.error?.value),
    };
}

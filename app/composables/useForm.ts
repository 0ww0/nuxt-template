import { reactive, ref, toValue, watch, type Ref, type MaybeRefOrGetter, type InjectionKey } from 'vue';
import type { ZodSchema } from 'zod';

export interface FormOptions<T = any> {
    initialValues?: MaybeRefOrGetter<T>;
    validationSchema?: ZodSchema<T>;
    validateOn?: 'input' | 'blur' | 'submit';
    onSubmit?: (values: T) => void | Promise<void>;
}

export const FormContextSymbol: InjectionKey<FormContext> = Symbol('FormContext');

export interface FormContext<T = any> {
    values: T;
    errors: Record<string, string>;
    touched: Record<string, boolean>;
    isSubmitting: Ref<boolean>;
    validateField: (field: string) => Promise<void>;
    validateForm: () => Promise<boolean>;
    setFieldValue: (field: keyof T, value: any) => void;
    setFieldError: (field: keyof T, error: string) => void;
    setFieldTouched: (field: keyof T, isTouched?: boolean) => void;
    handleBlur: (field: keyof T) => void;
    handleSubmit: (e?: Event) => Promise<void>;
    resetForm: () => void;
}

export function useForm<T extends Record<string, any> = any>(options: FormOptions<T> = {}): FormContext<T> {
    const initialValues = toValue(options.initialValues) || {} as T;

    // Reactive State
    const values = reactive<T>({ ...initialValues });
    const errors = reactive<Record<string, string>>({});
    const touched = reactive<Record<string, boolean>>({});
    const isSubmitting = ref(false);

    // Core Validation Logic (Zod only)
    const validate = async () => {
        const schema = toValue(options.validationSchema);
        if (!schema) return true;

        let isValid = true;
        const currentErrors: Record<string, string> = {};

        const result = await schema.safeParseAsync(values);
        if (!result.success) {
            isValid = false;
            result.error.issues.forEach((issue) => {
                const path = issue.path.join('.');
                currentErrors[path] = issue.message;
            });
        }

        // Update errors reactive state
        Object.keys(errors).forEach(key => delete errors[key]);
        Object.assign(errors, currentErrors);

        return isValid;
    };

    const validateField = async (field: string) => {
        const schema = toValue(options.validationSchema);
        if (!schema) return;

        let fieldError = '';

        const result = await schema.safeParseAsync(values);
        if (!result.success) {
            const issue = result.error.issues.find((i) => i.path.join('.') === field);
            if (issue) fieldError = issue.message;
        }

        if (fieldError) {
            errors[field] = fieldError;
        } else {
            delete errors[field];
        }
    };

    // Event Handlers
    const setFieldValue = (field: keyof T, value: any) => {
        (values as any)[field] = value;
        if (options.validateOn === 'input') {
            validateField(field as string);
        }
    };

    const setFieldError = (field: keyof T, error: string) => {
        errors[field as string] = error;
    };

    const setFieldTouched = (field: keyof T, isTouched = true) => {
        touched[field as string] = isTouched;
        if (isTouched && options.validateOn === 'blur') {
            validateField(field as string);
        }
    };

    const handleBlur = (field: keyof T) => {
        setFieldTouched(field, true);
    };

    const handleSubmit = async (event?: Event) => {
        if (event) event.preventDefault();

        isSubmitting.value = true;
        setFieldTouchedAll(true);

        const isValid = await validate();

        if (isValid && options.onSubmit) {
            await options.onSubmit({ ...values } as T);
        }

        isSubmitting.value = false;
    };

    const resetForm = () => {
        // Reset values
        Object.keys(values).forEach(key => delete values[key]);
        Object.assign(values, initialValues);

        // Reset errors
        Object.keys(errors).forEach(key => delete errors[key]);

        // Reset touched
        Object.keys(touched).forEach(key => delete touched[key]);

        isSubmitting.value = false;
    };

    // Helper to touch all fields
    const setFieldTouchedAll = (isTouched: boolean) => {
        Object.keys(values).forEach(key => {
            touched[key] = isTouched;
        });
    };

    // Watch values for validation on input if enabled
    if (options.validateOn === 'input') {
        watch(values, () => {
            validate();
        }, { deep: true });
    }

    return {
        values: values as T,
        errors,
        touched,
        isSubmitting,
        validateField,
        validateForm: validate,
        setFieldValue,
        setFieldError,
        setFieldTouched,
        handleBlur,
        handleSubmit,
        resetForm
    };
}

import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import { z } from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@components/ui/form/index';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const signupSchema = z.object({
    username: z.string().min(2, 'Username must be at least 2 characters.'),
    email: z.string().email('Enter a valid email address.'),
    bio: z.string().max(160, 'Bio must be 160 characters or fewer.').optional(),
});

type SignupValues = z.infer<typeof signupSchema>;

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

// `Form` (FormRoot.vue) is a generic SFC (`generic="T extends Record<string, any>"`).
// Storybook's `Meta<typeof Form>` tries to match that generic call signature against
// a concrete component type and fails with TS2559. `satisfies Meta<any>` keeps arg
// inference for the stories below without fighting the generic component's type.
const meta = {
    title: 'UI/Form',
    component: Form as any,
    argTypes: {
        validateOn: {
            control: 'radio',
            options: ['submit', 'blur', 'input'],
        },
    },
} satisfies Meta<any>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Default — native <input>, validate on submit
// ---------------------------------------------------------------------------

export const Default: Story = {
    render: (args) => ({
        components: { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage },
        setup() {
            const onSubmit = (values: SignupValues) => {
                alert(JSON.stringify(values, null, 2));
            };
            return { args, schema: signupSchema, onSubmit };
        },
        template: `
            <Form
                v-slot="{ values, setFieldValue, handleBlur, isSubmitting }"
                :schema="schema"
                :validate-on="args.validateOn"
                class="flex flex-col gap-6 max-w-sm"
                @submit="onSubmit"
            >
                <FormField name="username">
                    <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl v-slot="slotProps">
                            <input
                                v-bind="slotProps"
                                type="text"
                                class="border rounded-md px-3 py-2 text-sm"
                                :value="values.username"
                                @input="setFieldValue('username', $event.target.value)"
                                @blur="handleBlur('username')"
                            />
                        </FormControl>
                        <FormDescription>This is your public display name.</FormDescription>
                        <FormMessage />
                    </FormItem>
                </FormField>

                <FormField name="email">
                    <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl v-slot="slotProps">
                            <input
                                v-bind="slotProps"
                                type="email"
                                class="border rounded-md px-3 py-2 text-sm"
                                :value="values.email"
                                @input="setFieldValue('email', $event.target.value)"
                                @blur="handleBlur('email')"
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                </FormField>

                <button type="submit" :disabled="isSubmitting" class="border rounded-md px-3 py-2 text-sm font-medium">
                    {{ isSubmitting ? 'Submitting…' : 'Submit' }}
                </button>
            </Form>
        `,
    }),
    args: {
        validateOn: 'submit',
    },
};

// ---------------------------------------------------------------------------
// ValidateOnBlur — errors appear as soon as a field loses focus
// ---------------------------------------------------------------------------

export const ValidateOnBlur: Story = {
    ...Default,
    args: {
        validateOn: 'blur',
    },
};

// ---------------------------------------------------------------------------
// ValidateOnInput — errors update on every keystroke
// ---------------------------------------------------------------------------

export const ValidateOnInput: Story = {
    ...Default,
    args: {
        validateOn: 'input',
    },
};

// ---------------------------------------------------------------------------
// WithTextarea — native <textarea>, optional field with a description
// ---------------------------------------------------------------------------

export const WithTextarea: Story = {
    render: (args) => ({
        components: { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage },
        setup() {
            const onSubmit = (values: SignupValues) => {
                alert(JSON.stringify(values, null, 2));
            };
            return { args, schema: signupSchema, onSubmit };
        },
        template: `
            <Form
                v-slot="{ values, setFieldValue, handleBlur }"
                :schema="schema"
                :validate-on="args.validateOn"
                :initial-values="{ username: 'jdoe', email: 'jdoe@example.com' }"
                class="flex flex-col gap-6 max-w-sm"
                @submit="onSubmit"
            >
                <FormField name="bio">
                    <FormItem>
                        <FormLabel>Bio</FormLabel>
                        <FormControl v-slot="slotProps">
                            <textarea
                                v-bind="slotProps"
                                rows="3"
                                class="border rounded-md px-3 py-2 text-sm"
                                :value="values.bio"
                                @input="setFieldValue('bio', $event.target.value)"
                                @blur="handleBlur('bio')"
                            />
                        </FormControl>
                        <FormDescription>Max 160 characters. Shown on your public profile.</FormDescription>
                        <FormMessage />
                    </FormItem>
                </FormField>

                <button type="submit" class="border rounded-md px-3 py-2 text-sm font-medium">Save</button>
            </Form>
        `,
    }),
    args: {
        validateOn: 'blur',
    },
};

// ---------------------------------------------------------------------------
// PrefilledWithErrors — server-side errors set via setFieldError, no user input yet
// ---------------------------------------------------------------------------

export const PrefilledWithErrors: Story = {
    render: () => ({
        components: { Form, FormField, FormItem, FormLabel, FormControl, FormMessage },
        setup() {
            const schema = signupSchema;
            const onSubmit = () => {};
            return { schema, onSubmit };
        },
        template: `
            <Form
                v-slot="{ values, setFieldValue, setFieldError }"
                :schema="schema"
                :initial-values="{ username: 'x', email: 'not-an-email' }"
                class="flex flex-col gap-6 max-w-sm"
                @submit="onSubmit"
                @vue:mounted="setFieldError('email', 'This email is already taken.')"
            >
                <FormField name="username">
                    <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl v-slot="slotProps">
                            <input
                                v-bind="slotProps"
                                type="text"
                                class="border rounded-md px-3 py-2 text-sm"
                                :value="values.username"
                                @input="setFieldValue('username', $event.target.value)"
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                </FormField>

                <FormField name="email">
                    <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl v-slot="slotProps">
                            <input
                                v-bind="slotProps"
                                type="email"
                                class="border rounded-md px-3 py-2 text-sm"
                                :value="values.email"
                                @input="setFieldValue('email', $event.target.value)"
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                </FormField>
            </Form>
        `,
    }),
};

// ---------------------------------------------------------------------------
// StandaloneField — FormField used outside a <Form>, manual error prop
// (exercises the fallback branch in FormField.vue: no formContext, so
// error comes purely from the `error` prop rather than schema validation)
// ---------------------------------------------------------------------------

export const StandaloneField: Story = {
    render: () => ({
        components: { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage },
        setup() {
            const value = ref('');
            return { value };
        },
        template: `
            <FormField name="coupon" error="This coupon code has expired.">
                <FormItem class="max-w-sm">
                    <FormLabel>Coupon code</FormLabel>
                    <FormControl v-slot="slotProps">
                        <input v-bind="slotProps" type="text" class="border rounded-md px-3 py-2 text-sm" v-model="value" />
                    </FormControl>
                    <FormDescription>No Form or Zod schema involved — this is a manually-controlled error.</FormDescription>
                    <FormMessage />
                </FormItem>
            </FormField>
        `,
    }),
};
import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@components/ui/accordion/index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccordionItemData {
    value: string;
    title: string;
    content: string;
    disabled?: boolean;
}

interface StoryArgs {
    type: 'single' | 'multiple';
    defaultValue?: string | string[];
    collapsible: boolean;
    disabled: boolean;
    triggerFirst: boolean;
    items: AccordionItemData[];
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultItems: AccordionItemData[] = [
    {
        value: 'what',
        title: 'What is an accordion?',
        content: 'An accordion is a vertically stacked list of items. Each item has a trigger that reveals or hides associated content.',
    },
    {
        value: 'when',
        title: 'When should I use one?',
        content: 'Accordions work well when space is limited and users need to scan a list of topics before diving into one — think FAQs, settings panels, or step-by-step guides.',
    },
    {
        value: 'why',
        title: 'Why the grid animation?',
        content: 'CSS cannot animate height: auto, so we animate grid-template-rows from 0fr to 1fr instead. This gives a smooth expand/collapse without JavaScript measuring content height.',
    },
];

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<StoryArgs> = {
    title: 'UI/Accordion',
    component: Accordion,
    tags: ['autodocs'],
    argTypes: {
        type: {
            control: 'radio',
            options: ['single', 'multiple'],
            description: 'Whether one or multiple items can be open at the same time.',
            table: {
                type: { summary: 'single | multiple' },
                defaultValue: { summary: 'single' },
            },
        },
        collapsible: {
            control: 'boolean',
            description: 'Allow closing the open item by clicking its trigger again (single mode only).',
            table: { defaultValue: { summary: 'false' } },
        },
        triggerFirst: {
            control: 'boolean',
            description: 'Move the chevron icon to the start of the trigger.',
            table: { defaultValue: { summary: 'false' } },
        },
        disabled: {
            control: 'boolean',
            description: 'Disable the entire accordion.',
            table: { defaultValue: { summary: 'false' } },
        },
        defaultValue: {
            control: 'text',
            description: 'Item value open by default (uncontrolled).',
        },
        items: {
            control: 'object',
            description: 'Array of accordion items. Each item can be individually disabled.',
        },
    },
    args: {
        type: 'single',
        collapsible: false,
        disabled: false,
        triggerFirst: false,
        items: defaultItems,
    },
};

export default meta;
type Story = StoryObj<StoryArgs>;

// ---------------------------------------------------------------------------
// Shared template
// ---------------------------------------------------------------------------

const Template = (args: StoryArgs) => ({
    components: { Accordion, AccordionItem, AccordionTrigger, AccordionContent },
    setup: () => ({ args }),
    template: `
        <Accordion
            :type="args.type"
            :collapsible="args.collapsible"
            :triggerFirst="args.triggerFirst"
            :disabled="args.disabled"
            :default-value="args.defaultValue"
        >
            <AccordionItem
                v-for="item in args.items"
                :key="item.value"
                :value="item.value"
                :disabled="item.disabled"
            >
                <AccordionTrigger>{{ item.title }}</AccordionTrigger>
                <AccordionContent>{{ item.content }}</AccordionContent>
            </AccordionItem>
        </Accordion>
    `,
});

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/**
 * Default single-select accordion. Only one item can be open at a time,
 * and clicking an open item does not collapse it.
 */
export const Default: Story = {
    render: Template,
    args: {
        type: 'single',
        collapsible: false,
    },
};

/**
 * Single-select with collapsible enabled. Clicking the open item collapses it,
 * leaving the accordion with nothing selected.
 */
export const SingleCollapsible: Story = {
    name: 'Single — Collapsible',
    render: Template,
    args: {
        type: 'single',
        collapsible: true,
        defaultValue: 'what',
    },
};

/**
 * Multiple items can be open simultaneously. Each item toggles independently.
 */
export const Multiple: Story = {
    name: 'Multiple — Open many at once',
    render: Template,
    args: {
        type: 'multiple',
        defaultValue: ['what', 'why'],
    },
};

/**
 * Entire accordion disabled via the root prop. All triggers are inert
 * and visually muted via disabled: styles in accordion.css.
 */
export const Disabled: Story = {
    name: 'Disabled — All items',
    render: Template,
    args: {
        type: 'single',
        disabled: true,
        defaultValue: 'what',
    },
};

/**
 * Individual items can be disabled while the rest remain interactive.
 * The second item here is disabled at the AccordionItem level.
 */
export const DisabledItem: Story = {
    name: 'Disabled — Single item',
    render: Template,
    args: {
        type: 'single',
        collapsible: true,
        items: [
            defaultItems[0],
            { value: 'when', title: 'When should I use one? (disabled)', content: 'This content is unreachable.', disabled: true },
            defaultItems[2],
        ],
    },
};

/**
 * Icon appears before the label. Useful when the trigger reads more naturally
 * as a disclosure triangle (tree views, side nav).
 */
export const TriggerFirst: Story = {
    name: 'Trigger first — Icon before label',
    render: Template,
    args: {
        type: 'single',
        collapsible: true,
        triggerFirst: true,
    },
};

/**
 * Controlled usage: open state lives in the parent via v-model.
 * A readout above the accordion reflects the current value in real time.
 */
export const Controlled: Story = {
    name: 'Controlled — v-model',
    render: (args: StoryArgs) => ({
        components: { Accordion, AccordionItem, AccordionTrigger, AccordionContent },
        setup() {
            const value = ref('what');
            return { args, value };
        },
        template: `
            <div class="flex flex-col gap-4">
                <p class="text-sm text-muted-foreground font-mono">
                    modelValue: <strong>{{ value || '—' }}</strong>
                </p>
                <Accordion
                    :type="args.type"
                    :collapsible="args.collapsible"
                    v-model="value"
                >
                    <AccordionItem
                        v-for="item in args.items"
                        :key="item.value"
                        :value="item.value"
                    >
                        <AccordionTrigger>{{ item.title }}</AccordionTrigger>
                        <AccordionContent>{{ item.content }}</AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        `,
    }),
    args: {
        type: 'single',
        collapsible: true,
    },
};

/**
 * Controlled with type="multiple" — v-model value is an array.
 */
export const ControlledMultiple: Story = {
    name: 'Controlled — v-model multiple',
    render: (args: StoryArgs) => ({
        components: { Accordion, AccordionItem, AccordionTrigger, AccordionContent },
        setup() {
            const value = ref<string[]>(['what']);
            return { args, value };
        },
        template: `
            <div class="flex flex-col gap-4">
                <p class="text-sm text-muted-foreground font-mono">
                    modelValue: <strong>{{ value.length ? value.join(', ') : '—' }}</strong>
                </p>
                <Accordion
                    type="multiple"
                    v-model="value"
                >
                    <AccordionItem
                        v-for="item in args.items"
                        :key="item.value"
                        :value="item.value"
                    >
                        <AccordionTrigger>{{ item.title }}</AccordionTrigger>
                        <AccordionContent>{{ item.content }}</AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        `,
    }),
    args: {
        type: 'multiple',
    },
};

/**
 * Custom icon slot — replace the default chevron with any element.
 * The accordion-icon class still applies for sizing and transition.
 */
export const CustomIcon: Story = {
    name: 'Custom icon slot',
    render: (args: StoryArgs) => ({
        components: { Accordion, AccordionItem, AccordionTrigger, AccordionContent },
        setup: () => ({ args }),
        template: `
            <Accordion
                :type="args.type"
                :collapsible="args.collapsible"
                :disabled="args.disabled"
            >
                <AccordionItem
                    v-for="item in args.items"
                    :key="item.value"
                    :value="item.value"
                >
                    <AccordionTrigger>
                        {{ item.title }}
                        <template #icon>
                            <span class="accordion-icon text-xs font-bold">+</span>
                        </template>
                    </AccordionTrigger>
                    <AccordionContent>{{ item.content }}</AccordionContent>
                </AccordionItem>
            </Accordion>
        `,
    }),
    args: {
        type: 'single',
        collapsible: true,
    },
};

/**
 * Additional icon inside the trigger label alongside the default chevron.
 */
export const ItemIcons: Story = {
    name: 'Item icons — Icon inside label',
    render: (args: StoryArgs) => ({
        components: { Accordion, AccordionItem, AccordionTrigger, AccordionContent },
        setup: () => ({ args }),
        template: `
            <Accordion
                :type="args.type"
                :collapsible="args.collapsible"
                :disabled="args.disabled"
            >
                <AccordionItem
                    v-for="item in args.items"
                    :key="item.value"
                    :value="item.value"
                >
                    <AccordionTrigger>
                        <div class="flex items-center gap-2">
                            <Icon name="lucide:smile" class="h-4 w-4 shrink-0" />
                            <span>{{ item.title }}</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>{{ item.content }}</AccordionContent>
                </AccordionItem>
            </Accordion>
        `,
    }),
    args: {
        type: 'single',
        collapsible: true,
    },
};

/**
 * Rich content inside AccordionContent — not just plain text.
 * Confirms the grid animation handles variable-height content correctly.
 */
export const RichContent: Story = {
    name: 'Rich content',
    render: (args: StoryArgs) => ({
        components: { Accordion, AccordionItem, AccordionTrigger, AccordionContent },
        setup: () => ({ args }),
        template: `
            <Accordion type="single" collapsible>
                <AccordionItem value="install">
                    <AccordionTrigger>Installation</AccordionTrigger>
                    <AccordionContent>
                        <div class="flex flex-col gap-2">
                            <p>Install using your preferred package manager:</p>
                            <pre class="bg-muted rounded p-3 text-xs font-mono overflow-x-auto">npm install @your-scope/ui</pre>
                        </div>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="usage">
                    <AccordionTrigger>Basic usage</AccordionTrigger>
                    <AccordionContent>
                        <div class="flex flex-col gap-2">
                            <p>Import and compose the components:</p>
                            <pre class="bg-muted rounded p-3 text-xs font-mono overflow-x-auto">&lt;Accordion type="single" collapsible&gt;\n  &lt;AccordionItem value="a"&gt;\n    &lt;AccordionTrigger&gt;Label&lt;/AccordionTrigger&gt;\n    &lt;AccordionContent&gt;Content&lt;/AccordionContent&gt;\n  &lt;/AccordionItem&gt;\n&lt;/Accordion&gt;</pre>
                        </div>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="props">
                    <AccordionTrigger>Props reference</AccordionTrigger>
                    <AccordionContent>
                        <table class="w-full text-xs border-collapse">
                            <thead>
                                <tr>
                                    <th class="text-left py-1 pr-4 font-semibold">Prop</th>
                                    <th class="text-left py-1 pr-4 font-semibold">Type</th>
                                    <th class="text-left py-1 font-semibold">Default</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr class="border-t border-border"><td class="py-1 pr-4 font-mono">type</td><td class="py-1 pr-4 text-muted-foreground">"single" | "multiple"</td><td class="py-1 text-muted-foreground">"single"</td></tr>
                                <tr class="border-t border-border"><td class="py-1 pr-4 font-mono">collapsible</td><td class="py-1 pr-4 text-muted-foreground">boolean</td><td class="py-1 text-muted-foreground">false</td></tr>
                                <tr class="border-t border-border"><td class="py-1 pr-4 font-mono">disabled</td><td class="py-1 pr-4 text-muted-foreground">boolean</td><td class="py-1 text-muted-foreground">false</td></tr>
                                <tr class="border-t border-border"><td class="py-1 pr-4 font-mono">triggerFirst</td><td class="py-1 pr-4 text-muted-foreground">boolean</td><td class="py-1 text-muted-foreground">false</td></tr>
                                <tr class="border-t border-border"><td class="py-1 pr-4 font-mono">defaultValue</td><td class="py-1 pr-4 text-muted-foreground">string | string[]</td><td class="py-1 text-muted-foreground">—</td></tr>
                                <tr class="border-t border-border"><td class="py-1 pr-4 font-mono">modelValue</td><td class="py-1 pr-4 text-muted-foreground">string | string[]</td><td class="py-1 text-muted-foreground">—</td></tr>
                            </tbody>
                        </table>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        `,
    }),
    args: {},
};

/**
 * Nested accordions — an outer accordion containing an inner one.
 * Each accordion's context is fully isolated via its own provide/inject.
 */
export const Nested: Story = {
    name: 'Nested — Accordion within accordion',
    render: (args: StoryArgs) => ({
        components: { Accordion, AccordionItem, AccordionTrigger, AccordionContent },
        setup: () => ({ args }),
        template: `
            <Accordion type="single" collapsible>
                <AccordionItem value="outer-1">
                    <AccordionTrigger>Outer Item 1</AccordionTrigger>
                    <AccordionContent>
                        <div class="p-4 border rounded-md border-border bg-muted/20">
                            <h4 class="mb-2 font-medium text-sm">Nested Accordion</h4>
                            <Accordion type="single" collapsible>
                                <AccordionItem value="inner-1">
                                    <AccordionTrigger>Inner Item 1</AccordionTrigger>
                                    <AccordionContent>
                                        Content inside the inner accordion, which is inside the outer accordion.
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="inner-2">
                                    <AccordionTrigger>Inner Item 2</AccordionTrigger>
                                    <AccordionContent>More inner content.</AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </div>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="outer-2">
                    <AccordionTrigger>Outer Item 2</AccordionTrigger>
                    <AccordionContent>Regular content without nesting.</AccordionContent>
                </AccordionItem>
            </Accordion>
        `,
    }),
    args: {},
};

/**
 * RTL layout — dir="rtl" is set on the root element via ConfigProvider.
 * Text direction and layout flip automatically for right-to-left locales.
 */
export const RTL: Story = {
    name: 'RTL — Right-to-left layout',
    render: (args: StoryArgs) => ({
        components: { Accordion, AccordionItem, AccordionTrigger, AccordionContent },
        setup: () => ({ args }),
        template: `
            <Accordion
                :type="args.type"
                :collapsible="args.collapsible"
                :disabled="args.disabled"
            >
                <AccordionItem value="one">
                    <AccordionTrigger>ما هو الأكورديون؟</AccordionTrigger>
                    <AccordionContent>
                        الأكورديون هو قائمة من العناصر المكدسة عمودياً، يكشف كل عنصر محتواه عند النقر.
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="two">
                    <AccordionTrigger>متى يجب استخدامه؟</AccordionTrigger>
                    <AccordionContent>
                        يُستخدم الأكورديون عندما تكون المساحة محدودة ويحتاج المستخدمون إلى تصفح قائمة من المواضيع.
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="three">
                    <AccordionTrigger>لماذا نستخدم حركة الشبكة؟</AccordionTrigger>
                    <AccordionContent>
                        لا يمكن لـ CSS تحريك height: auto، لذلك نُحرّك grid-template-rows بدلاً من ذلك.
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        `,
    }),
    args: {
        type: 'single',
        collapsible: true,
    },
};
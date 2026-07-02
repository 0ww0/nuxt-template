import type { Meta, StoryObj } from '@storybook/vue3';
import ConfigProvider from '@components/ConfigProvider.vue';
import { Alert, AlertTitle, AlertDescription, AlertIcon, AlertClose, AlertContent } from '@components/ui/alert';

const meta = {
	title: 'UI/Alert',
	component: Alert,
	// Real ConfigProvider in the tree so useId()/dir come from the actual
	// provider (not the CONFIG_DEFAULTS fallback) — same as Accordion/Avatar stories.
	decorators: [
		() => ({
			components: { ConfigProvider },
			template: '<ConfigProvider><story /></ConfigProvider>',
		}),
	],
	argTypes: {
		variant: {
			control: 'select',
			options: ['default', 'outline', 'dashed', 'soft', 'ghost'],
		},
		color: {
			control: 'select',
			options: ['neutral', 'info', 'success', 'warning', 'error'],
		},
		direction: {
			control: 'select',
			options: ['horizontal', 'vertical'],
		},
	},
	tags: ['autodocs'],
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

const Template = (args: Record<string, unknown>) => ({
	components: { Alert, AlertTitle, AlertDescription, AlertIcon, AlertClose, AlertContent },
	setup() {
		return { args };
	},
	template: `
		<Alert v-bind="args">
			<AlertIcon name="ri:information-line" />
			<AlertContent>
				<AlertTitle>Heads up</AlertTitle>
				<AlertDescription>This is an alert description explaining what happened.</AlertDescription>
			</AlertContent>
			<AlertClose />
		</Alert>
	`,
});

export const Default: Story = {
	render: Template,
	args: {
		variant: 'default',
		color: 'neutral',
		direction: 'horizontal',
	},
};

export const Info: Story = {
	render: Template,
	args: { ...Default.args, color: 'info' },
};

export const Success: Story = {
	render: Template,
	args: { ...Default.args, color: 'success' },
};

export const Warning: Story = {
	render: Template,
	args: { ...Default.args, color: 'warning' },
};

export const Danger: Story = {
	render: Template,
	args: { ...Default.args, color: 'error' },
};

export const Outline: Story = {
	render: Template,
	args: { ...Default.args, variant: 'outline', color: 'info' },
};

export const Dashed: Story = {
	render: Template,
	args: { ...Default.args, variant: 'dashed', color: 'warning' },
};

export const Soft: Story = {
	render: Template,
	args: { ...Default.args, variant: 'soft', color: 'success' },
};

export const Ghost: Story = {
	render: Template,
	args: { ...Default.args, variant: 'ghost', color: 'error' },
};

export const Vertical: Story = {
	render: Template,
	args: { ...Default.args, direction: 'vertical', color: 'info' },
};

// Alert used with only a title. aria-describedby on the root still points at
// a descriptionId that has nothing rendering into it — the simple/always-wired
// ARIA approach we chose over a mount-registration mechanism.
export const TitleOnly: Story = {
	render: (args: Record<string, unknown>) => ({
		components: { Alert, AlertIcon, AlertContent, AlertTitle },
		setup() {
			return { args };
		},
		template: `
			<Alert v-bind="args">
				<AlertIcon name="ri:checkbox-circle-line" />
				<AlertContent>
					<AlertTitle>Saved successfully</AlertTitle>
				</AlertContent>
			</Alert>
		`,
	}),
	args: { ...Default.args, color: 'success' },
};

export const WithoutIcon: Story = {
	render: (args: Record<string, unknown>) => ({
		components: { Alert, AlertContent, AlertTitle, AlertDescription },
		setup() {
			return { args };
		},
		template: `
			<Alert v-bind="args">
				<AlertContent>
					<AlertTitle>No icon here</AlertTitle>
					<AlertDescription>Alerts work fine without an icon too.</AlertDescription>
				</AlertContent>
			</Alert>
		`,
	}),
	args: Default.args,
};

export const WithoutCloseButton: Story = {
	render: (args: Record<string, unknown>) => ({
		components: { Alert, AlertIcon, AlertContent, AlertTitle, AlertDescription },
		setup() {
			return { args };
		},
		template: `
			<Alert v-bind="args">
				<AlertIcon name="ri:error-warning-line" />
				<AlertContent>
					<AlertTitle>Persistent notice</AlertTitle>
					<AlertDescription>Not every alert needs to be dismissible.</AlertDescription>
				</AlertContent>
			</Alert>
		`,
	}),
	args: { ...Default.args, color: 'warning' },
};

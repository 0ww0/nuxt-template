import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Avatar, AvatarImage, AvatarFallback } from '@components/ui/Avatar';

const meta = {
	title: 'UI/Avatar',
	component: Avatar,
	tags: ['autodocs'],
	argTypes: {
		size: { control: 'select', options: ['8', '10', '12', '14', '16'] },
		shape: { control: 'select', options: ['circle', 'rounded', 'square'] },
		status: { control: 'select', options: ['default', 'online', 'offline', 'away'] },
	},
	args: {
		size: '12',
		shape: 'circle',
		status: 'default',
	},
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No src -> AvatarFallback renders immediately with the slotted initials. */
export const Default: Story = {
	render: (args) => ({
		components: { Avatar, AvatarFallback },
		setup() {
			return { args };
		},
		template: `
			<Avatar v-bind="args">
				<AvatarFallback>JD</AvatarFallback>
			</Avatar>
		`,
	}),
};

/** Valid src -> AvatarImage loads and hides the fallback. */
export const WithImage: Story = {
	render: (args) => ({
		components: { Avatar, AvatarImage, AvatarFallback },
		setup() {
			return { args };
		},
		template: `
			<Avatar v-bind="args">
				<AvatarImage src="https://i.pravatar.cc/150?img=12" alt="Jane Doe" />
				<AvatarFallback>JD</AvatarFallback>
			</Avatar>
		`,
	}),
};

/**
 * Broken src -> @error fires, imageStatus becomes 'error', and the fallback
 * stays visible instead of showing a broken image with no alternative.
 */
export const BrokenImage: Story = {
	render: (args) => ({
		components: { Avatar, AvatarImage, AvatarFallback },
		setup() {
			return { args };
		},
		template: `
			<Avatar v-bind="args">
				<AvatarImage src="https://this-domain-does-not-resolve.invalid/broken.png" alt="Jane Doe" />
				<AvatarFallback>JD</AvatarFallback>
			</Avatar>
		`,
	}),
};

/** Custom fallback content instead of initials, e.g. an icon. */
export const CustomFallbackContent: Story = {
	render: (args) => ({
		components: { Avatar, AvatarFallback },
		setup() {
			return { args };
		},
		template: `
			<Avatar v-bind="args">
				<AvatarFallback>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-1/2 h-1/2" aria-hidden="true">
						<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
						<circle cx="12" cy="7" r="4" />
					</svg>
				</AvatarFallback>
			</Avatar>
		`,
	}),
};

/** All size tokens side by side. */
export const Sizes: Story = {
	render: () => ({
		components: { Avatar, AvatarFallback },
		template: `
			<div class="flex items-end gap-4">
				<Avatar size="8"><AvatarFallback>8</AvatarFallback></Avatar>
				<Avatar size="10"><AvatarFallback>10</AvatarFallback></Avatar>
				<Avatar size="12"><AvatarFallback>12</AvatarFallback></Avatar>
				<Avatar size="14"><AvatarFallback>14</AvatarFallback></Avatar>
				<Avatar size="16"><AvatarFallback>16</AvatarFallback></Avatar>
			</div>
		`,
	}),
};

/** All shape tokens side by side. */
export const Shapes: Story = {
	render: () => ({
		components: { Avatar, AvatarFallback },
		template: `
			<div class="flex items-center gap-4">
				<Avatar shape="circle"><AvatarFallback>C</AvatarFallback></Avatar>
				<Avatar shape="rounded"><AvatarFallback>R</AvatarFallback></Avatar>
				<Avatar shape="square"><AvatarFallback>S</AvatarFallback></Avatar>
			</div>
		`,
	}),
};

/**
 * All status tokens side by side. Each ring also carries a visually-hidden
 * text alternative (via ConfigProvider's useId) for screen readers, since
 * the ring color alone doesn't convey status.
 */
export const StatusIndicators: Story = {
	render: () => ({
		components: { Avatar, AvatarFallback },
		template: `
			<div class="flex items-center gap-6">
				<Avatar status="online"><AvatarFallback>ON</AvatarFallback></Avatar>
				<Avatar status="offline"><AvatarFallback>OF</AvatarFallback></Avatar>
				<Avatar status="away"><AvatarFallback>AW</AvatarFallback></Avatar>
			</div>
		`,
	}),
};

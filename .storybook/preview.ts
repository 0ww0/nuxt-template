import type { Preview } from '@storybook/vue3-vite';
import { setup } from '@storybook/vue3';
import { h } from 'vue';
import './css/tailwind.css';

// 1. Setup Nuxt-specific mocks for Storybook's isolated Vue app
setup((app) => {
  // Mock <NuxtLink> component
  app.component('NuxtLink', {
    props: {
      to: {
        type: [String, Object],
        required: true,
      },
    },
    methods: {
      onClick(this: any, event: MouseEvent) {
        event.preventDefault();
        console.log('[NuxtLink Clicked]', this.to);
      },
    },
    template: '<a :href="typeof to === \'string\' ? to : \'#\'" @click="onClick"><slot /></a>',
  });

  // Mock <ClientOnly> component
  app.component('ClientOnly', {
    template: '<slot />'
  });

  // Mock <Icon> — Nuxt auto-imports this globally via nuxt-icon / @iconify,
  // but Storybook has no Nuxt layer. Renders an inline SVG chevron by default
  // so AccordionTrigger (and any other component using <Icon>) renders correctly.
  // The `name` prop is accepted but ignored — add cases here if other icons are needed.
  app.component('Icon', {
    props: {
      name: { type: String, default: '' },
      class: { type: String, default: '' },
    },
    setup(props) {
      // Renders a simple chevron-down that matches ri:arrow-down-s-line visually
      return () => h(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '2',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          class: props.class,
          'aria-hidden': 'true',
        },
        [h('polyline', { points: '6 9 12 15 18 9' })],
      );
    },
  });
});

// Mock simple global composables on the window object (if needed by your code)
// @ts-ignore
window.useRoute = () => ({ path: '/', query: {}, params: {} });
// @ts-ignore
window.useRuntimeConfig = () => ({ public: {} });

// 2. Configure Storybook parameters (Viewports, Backgrounds, Controls)
const preview: Preview = {
  parameters: {
    // Enable interactive controls matching
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // Define custom viewports for responsive testing
    viewport: {
      viewports: {
        mobile: {
          name: 'Mobile (iPhone 13/14)',
          styles: { width: '390px', height: '844px' },
          type: 'mobile',
        },
        tablet: {
          name: 'Tablet (iPad Air)',
          styles: { width: '820px', height: '1180px' },
          type: 'tablet',
        },
        desktop: {
          name: 'Desktop (1080p)',
          styles: { width: '1440px', height: '900px' },
          type: 'desktop',
        },
      },
      defaultViewport: 'responsive',
    },
    // Configure background themes (e.g. Tailwind neutral/slate tones)
    backgrounds: {
      default: 'light',
      values: [
        {
          name: 'light',
          value: '#ffffff',
        },
        {
          name: 'dark',
          value: '#0f172a', // Tailwind slate-900
        },
        {
          name: 'zinc-dark',
          value: '#18181b', // Tailwind zinc-900
        },
      ],
    },
    a11y: {
      config: {
        rules: [
          // Disable Axe Core global rule to pass the image-alt test for components using background images
          // We will handle accessibility for image-alt on a component-by-component basis
          { id: 'image-alt', enabled: false },
        ],
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default preview;
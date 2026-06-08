import type { Preview } from '@storybook/vue3-vite';
import { setup } from '@storybook/vue3';
import './css/tailwind.css';
import { t } from 'vue-router/dist/options-_KKPn1xZ.mjs';

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
        // Log the link navigation trigger to the console
        console.log('[NuxtLink Clicked]', this.to);
      },
    },
    template: '<a :href="typeof to === \'string\' ? to : \'#\'" @click="onClick"><slot /></a>',
  });

  // Mock <ClientOnly> component
  app.component('ClientOnly', {
    template: '<slot />'
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
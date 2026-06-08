import type { StorybookConfig } from '@storybook/vue3-vite';
import { mergeConfig } from 'vite';
import tailwindcss from "@tailwindcss/vite";
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

const config: StorybookConfig = {
  "stories": [
    '../storybook/**/*.stories.@(ts|tsx|js|jsx|mdx)',
  ],
  "addons": [
    "@storybook/addon-a11y",
    "@storybook/addon-docs"
  ],
  "framework": "@storybook/vue3-vite",
  async viteFinal(config) {
    return mergeConfig(config, {
      plugins: [
        vue(),
        tailwindcss()
      ],
      resolve: {
        alias: {
          '@': fileURLToPath(new URL('../app', import.meta.url)),
          '~': fileURLToPath(new URL('../app', import.meta.url)),
          '#images': fileURLToPath(new URL('../app/assets/images', import.meta.url)),
          '#fonts': fileURLToPath(new URL('../app/assets/fonts', import.meta.url)),
          '#css': fileURLToPath(new URL('../app/assets/css', import.meta.url)),
        },
      },
    });
  },
};
export default config;
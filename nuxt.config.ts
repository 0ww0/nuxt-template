import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  alias: {
    "@": fileURLToPath(new URL("./app", import.meta.url)),
    "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    "@server": fileURLToPath(new URL("./server", import.meta.url)),
    "#images": fileURLToPath(new URL("./app/assets/images", import.meta.url)),
    "#fonts": fileURLToPath(new URL("./app/assets/fonts", import.meta.url)),
    "#css": fileURLToPath(new URL("./app/assets/css", import.meta.url)),
  },
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['./app/assets/css/tailwind.css'],
  vite: {
    plugins: [
      tailwindcss()
    ],
    optimizeDeps: {
      include: [
        '@vue/devtools-core',
        '@vue/devtools-kit',
        'zod',
      ]
    }
  },

  modules: ['@nuxthub/core', '@pinia/nuxt'],

  hub: {
    db: {
      dialect: 'postgresql',
      casing: 'snake_case',
    },
    blob: {
      driver: 'fs',
      dir: '.data/blob'
    },
    kv: true,
    cache: true,
  },

  nitro: {
    experimental: {
      tasks: true,
    },
    storage: {
      kv: {
        driver: 'fs',
        base: '.data/kv'
      },
      cache: {
        driver: 'fs',
        base: '.data/cache'
      },
    },
    scheduledTasks: {
      '0 * * * *': ['auth:cleanup'], // hourly
    }
  },
  runtimeConfig: {
    appUrl: process.env.NUXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    webhookSecret: process.env.NUXT_WEBHOOK_SECRET ?? '',
    public: {},
  },
})
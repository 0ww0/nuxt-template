import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  alias: {
    "@": fileURLToPath(new URL("./app", import.meta.url)),
    "@components": fileURLToPath(new URL("./app/components", import.meta.url)),
    "@composables": fileURLToPath(new URL("./app/composables", import.meta.url)),
    "@types": fileURLToPath(new URL("./app/types", import.meta.url)),
    "@utils": fileURLToPath(new URL("./app/utils", import.meta.url)),
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
    sessionSecret: process.env.NUXT_SESSION_SECRET ?? '',
    webhookSecret: process.env.NUXT_WEBHOOK_SECRET ?? '',
    // appUrl is read by auth.service.ts as `useRuntimeConfig().public.appUrl`
    // (email reset/verification links), so it MUST live under `public`. It is
    // the site's own canonical URL — not a secret — so public exposure is fine.
    // Declaring it here also lets Nuxt's runtime override bind NUXT_PUBLIC_APP_URL
    // to it (Nuxt only overrides keys already present in the schema).
    public: {
      appUrl: process.env.NUXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    },
  },
  $production: {
    nitro: {
      ignore: ['tasks/db/seed.ts'],
    },
  },
})
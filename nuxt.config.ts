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
  app: {
    head: {
      title: 'Nuxt Template',
      titleTemplate: '%s - Nuxt Template',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Nuxt Template' },
        { name: 'keywords', content: 'Nuxt Template' },
        { name: 'author', content: 'Nuxt Template' },
        { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#0a0a0a', media: '(prefers-color-scheme: dark)' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ]
    }
  },

  modules: ['@nuxthub/core', '@pinia/nuxt'],

  hub: {
    db: 'postgresql',
    blob: {
      driver: 'fs',
      dir: '.data/blob'
    },
    kv: true,
    cache: true,
  },

  nitro: {
    storage: {
      kv: {
        driver: 'fs',
        base: '.data/kv'
      },
      cache: {
        driver: 'fs',
        base: '.data/cache'
      }
    }
  }
})
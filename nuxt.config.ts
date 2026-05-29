// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxthub/core'],

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
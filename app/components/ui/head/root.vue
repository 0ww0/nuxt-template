<script lang="ts" setup>
const config = useConfig();

useHead({
  title: 'Nuxt Template',
  titleTemplate: '%s - Nuxt Template',
  htmlAttrs: {
    lang: config.value.locale,
  },
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
    { rel: 'icon', type: 'image/png', href: '/favicon.png' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  ]
})

useSeoMeta({
  description: 'Nuxt Template',
  keywords: 'Nuxt Template',
  author: 'Nuxt Template',
  themeColor: '#ffffff',
  ogTitle: 'Nuxt Template',
  ogDescription: 'Nuxt Template',
  ogType: 'website',
  ogUrl: 'https://nuxt-template.nuxt.dev',
  ogImage: 'https://nuxt-template.nuxt.dev/og-image.png',
  twitterImage: 'https://nuxt-template.nuxt.dev/og-image.png',
  twitterTitle: 'Nuxt Template',
  twitterDescription: 'Nuxt Template',
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <slot />
</template>
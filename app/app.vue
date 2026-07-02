<script setup lang="ts">
import { UiHead } from '@/components/ui/head';
 
// Nuxt's useId() is passed down through ConfigProvider so any descendant
// component can call `useConfig().value.useId?.()` to generate SSR-safe
// ids (avoids hydration mismatches when ids are generated client-side only).
const useIdFunction = () => useId();
 
// Pulls the typed `theme` object from app.config.ts (primaryColor,
// secondaryColor, accentColor, etc.). This flows into ConfigProvider,
// which syncs it to CSS custom properties (--primary-color, etc.) on
// <html>, so the whole app can theme itself via CSS vars without prop drilling.
const appConfig = useAppConfig();
</script>

<template>
  <!--
        ConfigProvider is the single source of global UI config for the app:
        - dir / locale: not passed here — ConfigProvider's own defaults
          ('ltr' / 'en') are the single source of truth. Override here only
          if this app needs to diverge from ConfigProvider's defaults.
        - theme: design tokens from app.config.ts, synced to CSS vars internally
        - use-id: SSR-safe id generator, available via useConfig() anywhere below
        - scroll-body: how body padding/margin behave when scroll locking kicks in
          (e.g. when a modal/drawer opens). Accepts the shorthand object here;
          ConfigProvider normalizes it internally.
    -->
    <ConfigProvider
        :use-id="useIdFunction"
        :theme="appConfig.theme"
        :scroll-body="{ padding: true, margin: false }"
    >
        <UiHead />
        <NuxtLoadingIndicator />
        <NuxtLayout>
            <NuxtPage />
        </NuxtLayout>

        <ClientOnly>
        </ClientOnly>
    </ConfigProvider>
</template>
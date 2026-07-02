<script setup lang="ts">
import { provide, toRefs, computed, watchEffect } from 'vue';
import type { ConfigProviderProps, ConfigProviderContext } from '@/types/config.types';
import { ConfigProviderKey, normalizeScrollBody, toCssVarName } from '@/types/config.types';

const props = withDefaults(defineProps<ConfigProviderProps>(), {
    dir: 'ltr',
    locale: 'en',
    scrollBody: true,
});

const { dir, locale, scrollBody, useId, nonce, theme } = toRefs(props);

// Create the config context. scrollBody is normalized here so every
// downstream consumer of useConfig() only ever deals with the full
// ScrollBodyOption shape, not the boolean | object union.
const config = computed<ConfigProviderContext>(() => ({
    dir: dir.value,
    locale: locale.value,
    scrollBody: normalizeScrollBody(scrollBody.value),
    useId: useId.value,
    nonce: nonce.value,
    theme: theme?.value,
}));

// Provide the config to all descendant components via a typed Symbol key.
provide(ConfigProviderKey, config);

// Sync theme tokens to CSS custom properties on the root element so
// components/Tailwind can reference var(--primary-color) etc. without
// any prop drilling. Uses imperative style.setProperty, which is not
// subject to a strict CSP style-src nonce requirement (unlike injecting
// a <style> block would be).
watchEffect(() => {
    if (!theme.value || typeof document === 'undefined') return;

    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.value)) {
        if (value == null) continue;
        root.style.setProperty(toCssVarName(key), String(value));
    }
});
</script>

<template>
    <slot />
</template>

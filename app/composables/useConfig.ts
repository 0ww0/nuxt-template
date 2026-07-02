import { inject, computed, type ComputedRef } from 'vue';
import type { ConfigProviderContext } from '@/types/config.types';
import { ConfigProviderKey, CONFIG_DEFAULTS } from '@/types/config.types';

/**
 * Composable to access the ConfigProvider context.
 * Falls back to CONFIG_DEFAULTS (shared with ConfigProvider's own defaults)
 * when used outside a ConfigProvider, so the two can never drift apart.
 *
 * @returns The config context provided by ConfigProvider
 */
export function useConfig(): ComputedRef<ConfigProviderContext> {
    const config = inject(ConfigProviderKey, null);

    if (!config) {
        return computed(() => CONFIG_DEFAULTS);
    }

    return config;
}

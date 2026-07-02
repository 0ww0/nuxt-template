import type { InjectionKey, ComputedRef } from 'vue';

export type Direction = 'ltr' | 'rtl';

export interface ScrollBodyOption {
    /**
     * Whether to apply padding to the body when scroll is locked
     * @default true
     */
    padding?: boolean;
    /**
     * Whether to apply margin to the body when scroll is locked
     * @default false
     */
    margin?: boolean;
}

/**
 * Strict shape for the design-token theme.
 * Mirrors the keys defined in app.config.ts so that overrides
 * (per-layer / per-tenant) are type-checked at compile time.
 */
export interface ConfigProviderTheme {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    neutralColor: string;
    errorColor: string;
    successColor: string;
    warningColor: string;
    infoColor: string;
}

export interface ConfigProviderProps {
    /**
     * The global reading direction of your application.
     * This will be inherited by all components.
     * @default 'ltr'
     */
    dir?: Direction;

    /**
     * The global locale of your application.
     * This will be inherited by all components.
     * @default 'en'
     */
    locale?: string;

    /**
     * The global scroll body behavior of your application.
     * Accepts a boolean shorthand (true = padding only, no margin)
     * or a full ScrollBodyOption object.
     * @default true
     */
    scrollBody?: boolean | ScrollBodyOption;

    /**
     * The global useId injection as a workaround for preventing hydration issues.
     * Use Nuxt's useId() function here. Consumers call `useId?.()` to get
     * a fresh id per invocation.
     */
    useId?: () => string;

    /**
     * The global nonce value of your application for CSP.
     * Required if you inject <style nonce="..."> blocks. Not required
     * for imperative `style.setProperty` calls (used by the CSS var sync below).
     */
    nonce?: string;

    /**
     * The global theme configuration.
     * This will be inherited by all components.
     */
    theme?: ConfigProviderTheme;
}

export interface ConfigProviderContext {
    dir: Direction;
    locale: string;
    /**
     * Always normalized to the full object shape internally,
     * regardless of what shorthand was passed in via props.
     */
    scrollBody: ScrollBodyOption;
    useId?: () => string;
    nonce?: string;
    theme?: ConfigProviderTheme;
}

/** Single source of truth for defaults, shared by ConfigProvider and useConfig. */
export const CONFIG_DEFAULTS: ConfigProviderContext = {
    dir: 'ltr',
    locale: 'en',
    scrollBody: { padding: true, margin: false },
};

/** Typed injection key — avoids string-key collisions and gives provide/inject type safety. */
export const ConfigProviderKey: InjectionKey<ComputedRef<ConfigProviderContext>> =
    Symbol('config-provider');

/** Normalizes the boolean | ScrollBodyOption prop shorthand into a full object. */
export function normalizeScrollBody(value: boolean | ScrollBodyOption | undefined): ScrollBodyOption {
    if (value === undefined) {
        return { padding: true, margin: false };
    }
    if (typeof value === 'boolean') {
        return { padding: value, margin: false };
    }
    return { padding: value.padding ?? true, margin: value.margin ?? false };
}

/** kebab-case helper for mapping theme keys (primaryColor -> primary-color) to CSS vars. */
export function toCssVarName(key: string): string {
    return `--${key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}

import type { InjectionKey } from 'vue';

export type AlertColor = 'neutral' | 'info' | 'success' | 'warning' | 'error';
export type AlertVariant = 'default' | 'outline' | 'dashed' | 'soft' | 'ghost';
export type AlertDirection = 'vertical' | 'horizontal';

/**
 * Context shared between AlertRoot and its descendants.
 *
 * titleId/descriptionId are generated once by AlertRoot via ConfigProvider's
 * useId() (SSR-safe) and handed down so AlertTitle/AlertDescription can render
 * them as their own `id`, while AlertRoot points aria-labelledby /
 * aria-describedby at them. No registration step needed — both ids are always
 * wired on the root; a mounted AlertTitle/AlertDescription fills the slot,
 * an absent one just leaves a dangling id (accepted tradeoff, see Alert.stories.ts).
 */
export interface AlertContext {
	titleId: string;
	descriptionId: string;
}

export const AlertContextKey: InjectionKey<AlertContext> = Symbol('AlertContext');

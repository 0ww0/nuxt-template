import type { InjectionKey, Ref } from 'vue';

/**
 * Lifecycle of the <AvatarImage> element, tracked so <AvatarFallback>
 * knows when to render without either component reaching into the other.
 * - idle: no src provided
 * - loading: src provided, load not yet resolved
 * - loaded: image loaded successfully -> fallback hides
 * - error: image failed to load -> fallback stays visible
 */
export type AvatarImageStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface AvatarContext {
    imageStatus: Ref<AvatarImageStatus>;
}

/** Typed injection key — avoids the string-key collision risk of the previous 'avatarContext' key. */
export const AvatarContextKey: InjectionKey<AvatarContext> = Symbol('avatar-context');

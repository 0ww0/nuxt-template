import type { ConfigProviderTheme } from '../app/types/config.types';

// Augment Nuxt's AppConfigInput so `theme` are type-checked here
// and fully typed (with autocomplete) wherever useAppConfig() is called.
declare module '@nuxt/schema' {
    interface AppConfigInput {
        theme?: ConfigProviderTheme;
    }
}

export default defineAppConfig({
    theme: {
        primaryColor: 'black',
        secondaryColor: 'white',
        accentColor: 'red',
        neutralColor: 'yellow',
        errorColor: 'purple',
        successColor: 'orange',
        warningColor: 'pink',
        infoColor: 'gray',
    },
});
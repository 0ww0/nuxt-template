// server/plugins/appUrlCheck.ts
// Fail-loud startup guard for the canonical app URL.
//
// auth.service.ts builds password-reset and email-verification links from
// `useRuntimeConfig().public.appUrl`. If that is unset (or still the localhost
// default in production), every outbound security email points somewhere users
// can't reach — and a dropped/dead link looks identical to a working one.
// There is no other startup validation, so a misconfigured deploy is silent.
//
// This checks the SAME key the service reads (public.appUrl), not the private
// top-level config, so it actually guards the value that ends up in emails.
import { writeLog } from '../utils/logger'

const LOCALHOST_DEFAULT = 'http://localhost:3000'

export default defineNitroPlugin(() => {
    const appUrl = useRuntimeConfig().public.appUrl

    if (import.meta.dev) return // localhost is correct in dev

    if (!appUrl || appUrl === LOCALHOST_DEFAULT) {
        const msg =
            '[startup] NUXT_PUBLIC_APP_URL is not set for production — ' +
            'password-reset and email-verification links will be broken. ' +
            `Got: ${appUrl ?? '(undefined)'}`
        console.error(msg)
        writeLog('error', msg)
        // To fail hard instead of warning (matches mailer.ts's "make it LOUD"
        // philosophy), throw here — but note that aborts server boot entirely:
        //   throw new Error(msg)
    }
})
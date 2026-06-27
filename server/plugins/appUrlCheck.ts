// server/plugins/appUrlCheck.ts
// Fail-loud startup guard for the canonical app URL.
//
// auth.service.ts builds password-reset and email-verification links from
// `useRuntimeConfig().public.appUrl`. If that is unset (or still the localhost
// default in production), every outbound security email points somewhere users
// can't reach — and a dropped/dead link looks identical to a working one.
//
// This throws on startup (not just logs) so a misconfigured deploy is caught
// immediately, not discovered when a user reports a broken password-reset link.
import { writeLog } from '../utils/logger'

const LOCALHOST_DEFAULT = 'http://localhost:3000'

export default defineNitroPlugin(() => {
  if (import.meta.dev) return // localhost is correct in dev

  const appUrl = useRuntimeConfig().public.appUrl

  if (!appUrl || appUrl === LOCALHOST_DEFAULT) {
    const msg =
      '[startup] NUXT_PUBLIC_APP_URL is not set for production — ' +
      'password-reset and email-verification links will be broken. ' +
      `Got: ${appUrl ?? '(undefined)'}`
    // Log before throwing so the error appears in the structured log stream
    // even if the process crashes before the logger flushes normally.
    writeLog('error', msg)
    throw new Error(msg)
  }
})

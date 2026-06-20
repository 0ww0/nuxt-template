import { db, schema } from '@nuxthub/db'
import { authService } from '../../services/auth.service'

// DEV-ONLY seed endpoint. Runs in the Nitro context where @nuxthub/db is
// available. Guard prevents it from ever executing in production.
// Trigger:  curl -X POST http://localhost:3000/api/dev/seed
export default defineEventHandler(async () => {
  if (!import.meta.dev || process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404 }) // 404 not 403 — don't reveal it exists
  }

  // Safe for a dev database only. Clear sessions first (FK → users), then the
  // rest. (Deleting users would cascade to sessions too, but explicit is clearer.)
  // The four settings singletons have no FK relationship to users, so order
  // among them doesn't matter — grouped here for readability.
  await db.delete(schema.sessions)
  await db.delete(schema.infos)
  await db.delete(schema.seoSettings)
  await db.delete(schema.analyticsSettings)
  await db.delete(schema.contactSettings)
  await db.delete(schema.generalSettings)
  await db.delete(schema.users)

  // Demo rows for the users CRUD list — no credentials, so they can't log in.
  const demoUsers = await db
    .insert(schema.users)
    .values([
      { email: 'ada@example.com', name: 'Ada Lovelace' },
      { email: 'alan@example.com', name: 'Alan Turing' },
      { email: 'grace@example.com', name: 'Grace Hopper' },
    ])
    .returning()

  // Login-able accounts. Hashing goes through authService so the hash format
  // lives in exactly one place. `role` is set here because the seeder is a
  // trusted internal caller — the public /register endpoint can't set it.
  const adminPassword = 'admin-password-123'
  const userPassword = 'user-password-123'
  const superPassword = 'super-password-123'

  const superAdmin = await authService.register({
    email: 'super@example.com',
    name: 'Super Admin',
    password: superPassword,
    role: 'super_admin',
  })
  const admin = await authService.register({
    email: 'admin@example.com',
    name: 'Admin User',
    password: adminPassword,
    role: 'admin',
  })
  const member = await authService.register({
    email: 'user@example.com',
    name: 'Regular User',
    password: userPassword,
    role: 'user',
  })

  // `informations` — trimmed to identity + branding only. author/siteUrl moved
  // to seo_settings; maintenanceMode/analyticsEnabled moved to their own tables.
  await db.insert(schema.infos).values({
    id: 1, // singleton row (matches infoRepository SINGLETON_ID)
    title: 'My App',
    description: 'A demo application',
    version: '1.0.0',
    primaryColor: '#4f46e5',
    tagline: 'Build fast, ship faster',
    copyrightText: '© 2026 Acme Inc.',
  })

  await db.insert(schema.seoSettings).values({
    id: 1, // singleton row (matches seoRepository SINGLETON_ID)
    keywords: 'demo, nuxt, nuxthub',
    author: 'Acme Inc.',
    siteUrl: 'https://example.com',
    privacyPolicyUrl: 'https://example.com/privacy',
    termsOfServiceUrl: 'https://example.com/terms',
  })

  await db.insert(schema.analyticsSettings).values({
    id: 1, // singleton row (matches analyticsRepository SINGLETON_ID)
    analyticsEnabled: true,
    googleAnalyticsId: 'G-DEMO12345',
  })

  await db.insert(schema.contactSettings).values({
    id: 1, // singleton row (matches contactRepository SINGLETON_ID)
    email: 'hello@example.com',
    phone: '+1 555 0100',
    twitter: 'https://twitter.com/acme',
    github: 'https://github.com/acme',
  })

  await db.insert(schema.generalSettings).values({
    id: 1, // singleton row (matches generalRepository SINGLETON_ID)
    maintenanceMode: false,
  })

  return {
    seeded: {
      users: demoUsers.length + 3,
      infos: 1,
      seoSettings: 1,
      analyticsSettings: 1,
      contactSettings: 1,
      generalSettings: 1,
    },
    // Returned for convenience — dev-only throwaway credentials.
    accounts: {
      superAdmin: { email: superAdmin.email, password: superPassword },
      admin: { email: admin.email, password: adminPassword },
      user: { email: member.email, password: userPassword },
    },
  }
})
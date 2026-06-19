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
  await db.delete(schema.sessions)
  await db.delete(schema.infos)
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

  await db.insert(schema.infos).values({
    id: 1, // singleton row (matches infoRepository SINGLETON_ID)
    title: 'My App',
    description: 'A demo application',
    version: '1.0.0',
    author: 'Acme Inc.',
    siteUrl: 'https://example.com',
    primaryColor: '#4f46e5',
    maintenanceMode: false,
    analyticsEnabled: true,
    tagline: 'Build fast, ship faster',
    copyrightText: '© 2026 Acme Inc.',
  })

  return {
    seeded: {
      users: demoUsers.length + 3,
      infos: 1,
    },
    // Returned for convenience — dev-only throwaway credentials.
    accounts: {
      superAdmin: { email: superAdmin.email, password: superPassword },
      admin: { email: admin.email, password: adminPassword },
      user: { email: member.email, password: userPassword },
    },
  }
})

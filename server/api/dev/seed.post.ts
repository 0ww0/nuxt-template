import { db, schema } from '@nuxthub/db'

// DEV-ONLY seed endpoint. Runs in the Nitro context where @nuxthub/db is
// available. Guard prevents it from ever executing in production.
// Trigger:  curl -X POST http://localhost:3000/api/dev/seed
export default defineEventHandler(async () => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 403, statusMessage: 'Seeding is dev-only' })
  }

  // Safe for a dev database only.
  await db.delete(schema.infos)
  await db.delete(schema.users)

  const users = await db
    .insert(schema.users)
    .values([
      { email: 'ada@example.com', name: 'Ada Lovelace' },
      { email: 'alan@example.com', name: 'Alan Turing' },
      { email: 'grace@example.com', name: 'Grace Hopper' },
    ])
    .returning()

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

  return { seeded: { users: users.length, infos: 1 } }
})

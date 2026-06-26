import { db, schema } from '@nuxthub/db'
import { authService } from '../../services/auth.service'

// DEV-ONLY seed task.
//
// Lives under server/tasks/ so its direct @nuxthub/db import is the documented
// maintenance-only exception (not an api-layer violation), and so it's off the
// HTTP surface entirely — there is no route to curl.
//
// Run on demand:  npx nuxt task run db:seed
// (Requires nitro.experimental.tasks = true — already set for auth:cleanup.)
//
// Two layers keep it out of production:
//  1. The import.meta.dev guard below. `import.meta.dev` is statically replaced
//     with `false` in prod builds, so this whole destructive body — including the
//     throwaway demo passwords — is dead-code-eliminated from the prod bundle.
//  2. (Optional, in nuxt.config.ts) a $production `nitro.ignore` entry that drops
//     this file from the build scan entirely. See the config snippet.
export default defineTask({
    meta: {
        name: 'db:seed',
        description: 'DEV ONLY — wipe and reseed demo data',
    },
    async run() {
        // Runtime guarantee. With the build-time ignore this branch never even ships,
        // but it stays as the belt to that suspenders.
        if (!import.meta.dev) {
            throw new Error('db:seed is dev-only and must never run in production')
        }

        // Safe for a dev database only. Clear sessions first (FK → users), then the
        // rest. Settings singletons have no FK to users, so order among them is free.
        await db.delete(schema.sessions)
        await db.delete(schema.infoSettings)
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
        const superPassword = 'super-password-123'
        const adminPassword = 'admin-password-123'
        const userPassword = 'user-password-123'

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

        await db.insert(schema.infoSettings).values({
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

        // Tasks conventionally return a { result } envelope.
        return {
            result: {
                seeded: {
                    users: demoUsers.length + 3,
                    infoSettings: 1,
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
            },
        }
    },
})
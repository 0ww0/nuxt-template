import { pgTable, serial, text, boolean, timestamp } from 'drizzle-orm/pg-core'

// "info" is the NEW schema for the agent workflow: the table exists, but its
// repository / service / schemas / presenters / routes do NOT. Point an agent
// at AGENTS.md to build the full v1 CRUD by mirroring `users`.
export const info = pgTable('info', {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    published: boolean('published').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
})

export type Info = typeof info.$inferSelect
export type NewInfo = typeof info.$inferInsert

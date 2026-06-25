-- Step 5 — Manual addendum: append these statements to the migration that
-- Drizzle generates for the Step 4/5 schema changes (the one that adds
-- mfa_codes, rate_limit_attempts, mfa_enabled, and the role CHECK constraint).
--
-- WHY MANUAL: Drizzle pg-core cannot express a *functional* index (one that
-- indexes an expression like lower(email)) in schema notation. It must be
-- written as raw SQL. Append it to the generated migration file so it is
-- applied atomically in the same transaction.
--
-- HOW TO APPLY:
--   1. Run: npm run db:generate
--   2. Open the newly generated .sql file in server/db/migrations/postgresql/.
--   3. Append the two statements below at the end of that file.
--   4. Run: npm run dev  (auto-applies)  OR  npm run db:migrate  (CI/prod)
--
-- WHAT THESE DO:
--   a. Drop the plain unique constraint Drizzle already created on users.email
--      (created in migration 0000). We replace it with a case-insensitive
--      functional index that indexes lower(email), achieving the same
--      uniqueness guarantee while also making case-folded lookups index-eligible.
--
--   b. Create the functional unique index on lower(email). This is the
--      DB-level defense against Ada@x.com vs ada@x.com duplicate registrations,
--      complementing the .toLowerCase() Zod normalizer added in Step 2.
--
-- NOTE: The application-layer email normalisation (Zod .toLowerCase().trim())
-- is still the primary enforcement. This index is defense-in-depth.

-- (a) Remove the plain case-sensitive unique constraint added in 0000.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_unique";

-- (b) Case-insensitive functional unique index replaces it.
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" (lower("email"));

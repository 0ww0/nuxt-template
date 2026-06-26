#!/usr/bin/env bash
# Precise guard: `role` may be ACCEPTED as input (role: z.…) only in the two
# edge-gated schemas:
#   - createUserV1Schema  → POST /users handler runs assertCanAssignRole(actor, role)
#   - setRoleV1Schema     → PATCH /users/:id/role gated by requireMinRole('super_admin')
# Both live in shared/schemas/v1/user.schema.ts (template puts an entity's
# schemas in one file), so filename-based exclusion does NOT work — we match on
# the enclosing schema name instead.
#
# Deliberately ignores `role: true` (e.g. updateUserV1Schema's `.omit({ role: true })`),
# which is role REMOVAL, not acceptance. Uses portable awk (mawk/gawk).
set -uo pipefail

files=$(find shared/schemas -name '*.ts' 2>/dev/null)
[ -z "$files" ] && { echo "✓ no schema files"; exit 0; }

violations=$(printf '%s\n' "$files" | xargs awk '
  /export const [A-Za-z0-9_]+[ \t]*=/ {
    line=$0
    sub(/^.*export const /, "", line)
    sub(/[^A-Za-z0-9_].*$/, "", line)
    current=line
  }
  /role[ \t]*:[ \t]*z\./ {
    if (current != "createUserV1Schema" && current != "setRoleV1Schema")
      printf "%s:%d  (role accepted inside: %s)\n", FILENAME, FNR, current
  }
')

if [ -n "$violations" ]; then
  echo "ERROR: 'role' is accepted as input outside an edge-gated schema:"
  printf '%s\n' "$violations" | sed 's/^/  /'
  echo "  Allowed only in createUserV1Schema (assertCanAssignRole) and setRoleV1Schema."
  exit 1
fi
echo "✓ role accepted only in createUserV1Schema / setRoleV1Schema"

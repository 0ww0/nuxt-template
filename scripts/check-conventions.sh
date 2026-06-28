#!/usr/bin/env bash
#
# Convention & security guardrails for the Nuxt 4 + NuxtHub template.
# Encodes the hard rules as runnable gates.
#
#   Local:  bash scripts/check-conventions.sh
#   CI:     see .github/workflows/ci.yml
#
# HARD failures (FAIL) exit non-zero and should block merge.
# Advisory items (WARN) never block; they prompt a manual look.
#
# Intentionally NOT `set -e`: grep returns 1 on "no match", which is the
# success case for most checks here.
set -uo pipefail

fail=0
warn=0

section() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
err()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=1; }
note() { printf '  \033[33mWARN\033[0m %s\n' "$1"; warn=1; }
ok()   { printf '  \033[32m ok \033[0m %s\n' "$1"; }
indent() { sed 's/^/         /'; }

# ── 1. @nuxthub/db only in repositories/ and tasks/ ──────────────────────────
# (tasks/ is the documented maintenance-only exception; everything else must go
#  through the repository layer.)
#
# Issue 5 fix: replaced GNU-only --exclude-dir with a portable grep -v pipeline
# so this works identically on macOS BSD grep and Linux.
section "@nuxthub/db imported only in repositories/ and tasks/"
violations=$(grep -rl "from '@nuxthub/db'" server --include='*.ts' 2>/dev/null \
  | grep -v "repositories/" \
  | grep -v "tasks/" \
  || true)
if [ -n "$violations" ]; then
  err "@nuxthub/db imported outside repositories/ and tasks/:"
  printf '%s\n' "$violations" | indent
else
  ok "no stray @nuxthub/db imports"
fi

# ── 2. services/ are HTTP-agnostic ───────────────────────────────────────────
# High-signal h3 primitives that must never appear in a service. (We avoid a
# bare `event.` match — too many false positives in comments/identifiers.)
section "services/ are HTTP-agnostic"
http_prims='readBody|readValidatedBody|getValidatedRouterParams|getRouterParams|getQuery|getCookie|setCookie|setResponseStatus|getRequestHeader|getRequestHost|getRequestIP|setHeader|defineEventHandler|createError|H3Event'
violations=$(grep -rlE "$http_prims" server/services --include='*.ts' 2>/dev/null || true)
if [ -n "$violations" ]; then
  err "HTTP primitives found in services (move to the handler/edge):"
  printf '%s\n' "$violations" | indent
else
  ok "services contain no HTTP primitives"
fi

# ── 3. PATCH schemas: .partial() is paired with .strict() ────────────────────
# File-level heuristic: any schema file using .partial() must also use .strict()
# (blocks mass-assignment of id/role/timestamps). The chain often spans lines,
# so we check presence per file rather than adjacency.
section "PATCH schemas pair .partial() with .strict()"
any=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  any=1
  if ! grep -q '\.strict(' "$f"; then
    err "$f uses .partial() without .strict()"
  fi
done < <(grep -rl '\.partial(' shared/schemas --include='*.ts' 2>/dev/null || true)
[ "$any" -eq 0 ] && ok "no .partial() schemas found" || { [ "$fail" -eq 0 ] && ok "all .partial() schemas also .strict()"; }

# ── 4. `role` accepted only in edge-gated schemas (HARD gate) ────────────────
# Delegates to the precise check: `role: z.…` is allowed only inside
# createUserV1Schema (capped by assertCanAssignRole) and setRoleV1Schema, by
# ENCLOSING SCHEMA NAME — not filename — and ignores `.omit({ role: true })`.
# One source of truth, runnable standalone too.
section "role accepted only in edge-gated schemas"
if bash "$(dirname "$0")/check-role-schemas.sh"; then
  :
else
  fail=1
fi

# ── 5. Webhook handlers enforce requireWebhookSignature ──────────────────────
section "webhook handlers enforce requireWebhookSignature"
if [ -d server/api/webhooks ]; then
  found=0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    found=1
    if ! grep -q 'requireWebhookSignature' "$f"; then
      err "$f does not call requireWebhookSignature"
    fi
  done < <(find server/api/webhooks -name '*.ts' 2>/dev/null)
  [ "$found" -eq 0 ] && ok "webhooks dir present, no handlers yet" \
    || { [ "$fail" -eq 0 ] && ok "all webhook handlers call requireWebhookSignature"; }
else
  ok "no webhooks dir yet"
fi

# ── 6. Singleton write handlers purge the cache STORAGE key ──────────────────
# Must call removeItem (else stale cache), and should target *_CACHE_STORAGE_KEY
# (the nitro:handlers:<name>:<getKey>.json form), not the bare *_CACHE_KEY.
section "singleton write handlers purge the cache storage key"
for s in info seo analytics general contact; do
  for m in post patch; do
    f="server/api/v1/$s/index.$m.ts"
    [ -f "$f" ] || continue
    if ! grep -q 'removeItem' "$f"; then
      err "$f does not call removeItem (cache will go stale)"
    elif ! grep -q '_CACHE_STORAGE_KEY' "$f"; then
      note "$f calls removeItem but not via *_CACHE_STORAGE_KEY — confirm it targets nitro:handlers:<name>:<getKey>.json"
    else
      ok "$s/$m purge ok"
    fi
  done
done

# ── 6b. Singleton cache purge must use the CACHE_STORAGE_KEY constant ────────
# A bare string in removeItem() silently targets a different key than the one
# Nitro actually stores, leaving stale data until the TTL expires.
# All five write handlers must reference the exported *_CACHE_STORAGE_KEY
# constant, not a string literal.
section "singleton cache purge uses constant (not bare string)"
bad=$(grep -rn "removeItem('" server/api --include='*.ts' 2>/dev/null || true)
if [ -n "$bad" ]; then
  err "singleton write handler calls removeItem with a bare string — use the CACHE_STORAGE_KEY constant:"
  printf '%s\n' "$bad" | indent
else
  ok "no bare-string removeItem calls found"
fi

# ── 7. Secret columns ⇒ hand-listed presenters (advisory) ────────────────────
# Two-part check:
#
# Part A — warn when a schema table with a secret-looking column (password_hash,
#   token_hash, code_hash, etc.) also has a presenter file. Token/code tables
#   (passwordResetToken, emailVerificationToken, mfaCode, mfaPreAuthToken) are
#   internal and have no presenter, so they are silently skipped.
#
# Part B — warn when a presenter uses spread AND its entity stem matches a schema
#   file that carries a secret column. Settings singletons (analytics, contact,
#   general, info, seo) have no secret columns → silent. User presenters carry
#   an explicit "Do NOT spread" annotation → suppressed by the annotation check.
section "secret-bearing columns & presenter spreads"

# Collect entity stems whose schema defines a secret-looking column via text().
secret_stems=""
while IFS= read -r schema_file; do
  [ -z "$schema_file" ] && continue
  stem=$(basename "$schema_file" .ts)
  secret_stems="$secret_stems $stem"
done < <(grep -rlE "text\('[a-z_]*(hash|token|secret)[a-z_]*'\)" \
  server/db/schema --include='*.ts' 2>/dev/null || true)

# Part A: flag stems that have both a secret column AND a presenter,
# unless every existing presenter for that stem already carries an explicit
# "Do NOT spread" safety annotation (meaning the risk has been reviewed).
any_secret=0
for stem in $secret_stems; do
  presenter_files=$(ls server/utils/presenters/"${stem}".*.ts 2>/dev/null || true)
  [ -z "$presenter_files" ] && continue
  # Check whether ALL presenters for this stem are annotated
  all_annotated=1
  for pf in $presenter_files; do
    if ! grep -q 'Do NOT\|no secret\|no.*[Hh]ash\|no.*[Tt]oken' "$pf" 2>/dev/null; then
      all_annotated=0
      break
    fi
  done
  if [ "$all_annotated" -eq 0 ]; then
    note "schema ${stem}.ts has secret column(s) and a presenter — presenter MUST hand-list fields (no { ...row }):"
    grep -nE "text\('[a-z_]*(hash|token|secret)[a-z_]*'\)" \
      "server/db/schema/${stem}.ts" 2>/dev/null | indent
    any_secret=1
  fi
done
[ "$any_secret" -eq 0 ] && ok "no presenter-exposed tables with secret columns detected"

# Part B: flag spreading presenters only when their table has secret columns,
# and only when they lack an explicit safety annotation.
spread_warn=0
while IFS= read -r presenter_file; do
  [ -z "$presenter_file" ] && continue
  pname=$(basename "$presenter_file")
  pstem="${pname%%.*}"
  # Skip if this presenter's underlying table has no secret columns
  if ! echo "$secret_stems" | grep -qw "$pstem"; then
    continue
  fi
  # Skip if the file already carries an explicit safety annotation
  if grep -q 'Do NOT\|no secret\|no.*[Hh]ash\|no.*[Tt]oken' "$presenter_file" 2>/dev/null; then
    continue
  fi
  note "$presenter_file spreads a table with secret columns — hand-list fields instead"
  spread_warn=1
done < <(grep -rln '\.\.\.' server/utils/presenters --include='*.ts' 2>/dev/null || true)
[ "$spread_warn" -eq 0 ] && ok "no unsafe spreads in presenters"

# ── 8. Sensitive handlers call checkRateLimit (advisory) ─────────────────────
# Issue 10 fix: removed `authService` and `scryptAsync` from the grep pattern.
#   - `authService` matched too broadly: admin handlers legitimately call
#     authService.register() and are protected by requireMinRole, not
#     checkRateLimit. This produced false positives that trained developers
#     to ignore the warning section entirely.
#   - `scryptAsync` matched handlers that call authService.login() transitively
#     through the service layer (mfa/enable, mfa/disable, users/index.post).
#     Those handlers ARE correctly protected — by requireUser or requireMinRole.
#
# The remaining pattern targets only direct signals in handler files:
#   sendMail      — email sending (password reset, OTP, verification)
#   mfaService    — OTP send or verify
#
# Exclusions (protected by requireUser / requireMinRole rather than checkRateLimit):
#   users/index.post — requireMinRole('admin') gate
#   mfa/enable       — step-up auth via requireUser; no OTP dispatch
#   mfa/disable      — step-up auth via requireUser; no OTP dispatch
section "sensitive handlers call checkRateLimit"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if ! grep -q 'checkRateLimit' "$f"; then
    note "$f references sendMail/mfaService but has no checkRateLimit — verify"
  fi
done < <(grep -rlE 'sendMail|mfaService' server/api --include='*.ts' 2>/dev/null \
  | grep -v "users/index\.post" \
  | grep -v "mfa/enable" \
  | grep -v "mfa/disable" \
  || true)

# ── 9. .env.example covers all referenced env vars (advisory) ────────────────
# Mirrors CI step 10 so developers see the same failure locally before push.
# Collects every process.env.VAR_NAME reference in nuxt.config.ts and server/,
# then checks each against .env.example.
section ".env.example covers all used env vars"
if [ -f .env.example ]; then
  used=$(grep -rhoE 'process\.env\.[A-Z_][A-Z0-9_]+' \
    nuxt.config.ts server/ --include='*.ts' 2>/dev/null \
    | grep -oE '[A-Z_][A-Z0-9_]+$' \
    | sort -u || true)
  any_missing=0
  while IFS= read -r var; do
    [ -z "$var" ] && continue
    if ! grep -q "^${var}=" .env.example 2>/dev/null; then
      note "$var referenced in code but missing from .env.example"
      any_missing=1
    fi
  done <<< "$used"
  [ "$any_missing" -eq 0 ] && ok ".env.example covers all detected process.env vars"
else
  note ".env.example not found — skipping coverage check"
fi

# ── Result ───────────────────────────────────────────────────────────────────
echo
if [ "$fail" -ne 0 ]; then
  printf '\033[31m✗ Convention checks FAILED.\033[0m\n'
  exit 1
elif [ "$warn" -ne 0 ]; then
  printf '\033[33m✓ Convention checks passed (with warnings to review).\033[0m\n'
else
  printf '\033[32m✓ All convention checks passed.\033[0m\n'
fi
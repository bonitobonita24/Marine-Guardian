# Post-Generation Security Verification Checklist — V31

> **Purpose:** Run this checklist after every Phase 4 scaffold and every Phase 7 Feature Update.
> Every item maps to a specific rule, security layer, or section in the Master Prompt.
> If any item FAILS → fix before merge. No exceptions.
>
> **Who runs this:** Human (Bonito) or auditing agent (ChatGPT / Claude independent audit).
> Claude Code's two-stage review (Rule 25) covers spec compliance and code quality. (V31 primary; Cline deprecated.)
> This checklist covers what Rule 25 does NOT — security, isolation, and production safety.
>
> **How to use:** Copy this file into your project root. After code generation, `grep` or
> manually inspect each item. Mark PASS / FAIL / N/A. Fix all FAILs before squash-merge.
>
> **Total: 84 verification items across 13 sections.**

---

## SECTION 1 — AUTHENTICATION (Auth.js v5)

```
□ 1.1  Auth config exists at src/server/auth/ and uses Auth.js v5
       → Master Prompt Phase 4 Part 5
□ 1.2  Session cookies are NOT overridden — HttpOnly, Secure, SameSite=lax are Auth.js defaults
       → Secure Code Generation: AUTH DEFAULTS item 1
       VERIFY: grep -r "cookies" src/server/auth/ — no manual cookie config that weakens defaults
□ 1.3  AUTH_SECRET loaded from process.env only — never imported in any file under src/app/ (client)
       → Secure Code Generation: AUTH DEFAULTS item 5
       VERIFY: grep -r "AUTH_SECRET" src/app/ — must return 0 results
□ 1.4  Password reset tokens are time-limited (≤1 hour) and single-use
       → Secure Code Generation: AUTH DEFAULTS item 2
       VERIFY: if password reset exists, check token expiry field in schema + single-use invalidation
□ 1.5  Logout invalidates session server-side — not just a frontend redirect
       → Secure Code Generation: AUTH DEFAULTS item 4
       VERIFY: grep -r "signOut" src/ — confirm server-side session deletion call exists
□ 1.6  No secrets in any file matching src/app/**/* or any NEXT_PUBLIC_* env var
       → Secure Code Generation: AGENT PROHIBITIONS item 4
       VERIFY: grep -r "NEXT_PUBLIC_.*SECRET\|NEXT_PUBLIC_.*KEY\|NEXT_PUBLIC_.*TOKEN" .env* — must return 0
```

---

## SECTION 2 — AUTHORIZATION (RBAC — L3)

```
□ 2.1  requireRole middleware exists at src/server/trpc/middleware/rbac.ts
       → Master Prompt Phase 4 Part 5, Rule 7 L3
□ 2.2  Every protectedProcedure uses requireRole() or equivalent role check
       → Secure Code Generation: AGENT PROHIBITIONS item 1
       VERIFY: grep -rn "protectedProcedure" src/server/trpc/ — each must chain a role guard
□ 2.3  No role/permission checks exist ONLY in frontend code (src/app/ or src/components/)
       → Secure Code Generation: AGENT PROHIBITIONS item 3
       VERIFY: grep -rn "role.*===\|isAdmin\|hasPermission" src/app/ src/components/
       → Frontend role checks are OK for UI display, but the SAME check must also exist server-side
□ 2.4  No tRPC resolver accepts role, plan, tier, or isAdmin from client input
       → Secure Code Generation: AGENT PROHIBITIONS item 1
       VERIFY: grep -rn "role\|plan\|tier\|isAdmin" in Zod input schemas — none should accept these
□ 2.5  Sensitive mutations (delete, role change, export) validate BOTH role AND resource ownership
       → Secure Code Generation: INPUT VALIDATION item 5
```

---

## SECTION 3 — MULTI-TENANT ISOLATION (L1–L6)

```
□ 3.1  tenantId column exists on ALL entities (nullable in single mode, NOT NULL in multi mode)
       → Rule 7B / 7C
       VERIFY: grep "tenant_id" prisma/schema.prisma — every model except AuditLog system tables
□ 3.2  L6 Prisma extension (tenant-guard.ts) is active and attached to the Prisma client
       → Rule 7, Phase 4 Part 3
       VERIFY: grep -r "tenantGuardExtension\|defineExtension" packages/db/
□ 3.3  tRPC context derives tenantId from session — NEVER from client request body
       → Rule 7 L1, Secure Code Generation: AGENT PROHIBITIONS item 1
       VERIFY: grep "tenantId" src/server/trpc/context.ts — must come from session, not req.body
□ 3.4  RLS policies exist (active in multi mode, commented in single mode)
       → Rule 7 L2
       VERIFY: grep -r "ROW LEVEL SECURITY\|tenant_isolation" prisma/migrations/
□ 3.5  No Prisma query anywhere uses findMany/findFirst without tenant scoping
       → Secure Code Generation: AGENT PROHIBITIONS item 2
       VERIFY: grep -rn "findMany\|findFirst\|findUnique" src/server/ — each must include where: { tenantId }
       (L6 auto-injects, but verify no raw prisma calls bypass the extension)
□ 3.6  Seed script creates data scoped to a specific tenant — no tenant-orphaned records
       → Phase 4 Part 3
□ 3.7  AuditLog model exists with tenantId, userId, action, entity, entityId, before, after, createdAt
       → Rule 7 L5
       VERIFY: grep "model AuditLog" prisma/schema.prisma
□ 3.8  Every mutation (create, update, delete) calls writeAuditLog()
       → Rule 7 L5
       VERIFY: grep -rn "writeAuditLog" src/server/ — count should roughly match mutation count
```

---

## SECTION 4 — INPUT VALIDATION (Zod + tRPC)

```
□ 4.1  Every tRPC procedure has a .input() with a Zod schema — no unvalidated inputs
       → Secure Code Generation: INPUT VALIDATION item 1
       VERIFY: grep -rn "\.input(" src/server/trpc/ — every procedure file has at least one
□ 4.2  No z.any() or z.unknown() on any user-facing input schema
       → Secure Code Generation: INPUT VALIDATION item 1, AGENT PROHIBITIONS item 5
       VERIFY: grep -rn "z.any\|z.unknown" src/ — must return 0 in tRPC input schemas
□ 4.3  Object schemas use .strict() to reject unknown fields
       → Secure Code Generation: INPUT VALIDATION item 2
       VERIFY: grep -rn "z.object" src/server/ — spot-check that .strict() is chained
□ 4.4  Enum fields use z.enum() with explicit values — no open z.string() where a set exists
       → Secure Code Generation: INPUT VALIDATION item 3
       VERIFY: grep for status/type/role fields in schemas — should use z.enum, not z.string
□ 4.5  Numeric inputs are bounded — z.number().min(0) or similar constraints present
       → Secure Code Generation: INPUT VALIDATION item 4
       VERIFY: grep -rn "z.number()" src/server/ — each should have .min() or .max() or both
□ 4.6  All list endpoints enforce pagination — no unbounded findMany without take/skip
       → Secure Code Generation: INPUT VALIDATION item 6
       VERIFY: grep -rn "findMany" src/server/ — each must include take: or limit parameter
□ 4.7  getById resolvers verify the returned record belongs to the requesting tenant
       → Secure Code Generation: INPUT VALIDATION item 5 (IDOR prevention)
       VERIFY: any findUnique/findFirst by ID must include tenantId in the where clause
```

---

## SECTION 5 — DATABASE SAFETY (Prisma + PostgreSQL)

```
□ 5.1  No $queryRaw or $executeRaw usage — or if present, fully parameterized with Prisma.sql``
       → Secure Code Generation: AGENT PROHIBITIONS item 8
       VERIFY: grep -rn "queryRaw\|executeRaw" src/ — 0 results preferred; if present, must use tagged template
□ 5.2  Multi-step writes use Prisma.$transaction()
       → Secure Code Generation: DATABASE SAFETY item 1
       VERIFY: grep -rn "transaction" src/server/ — inventory updates, order creation, transfers must be wrapped
□ 5.3  Race-condition-prone operations use optimistic locking or SELECT FOR UPDATE
       → Secure Code Generation: DATABASE SAFETY item 2
       CHECK: inventory decrements, credit/balance operations, quota checks — must NOT be read-then-write without lock
□ 5.4  Unique constraints defined in Prisma schema where business logic requires it
       → Secure Code Generation: DATABASE SAFETY item 4
       VERIFY: grep "@@unique\|@unique" prisma/schema.prisma — email, slug, SKU, etc.
□ 5.5  All foreign keys have explicit relations in Prisma schema — no orphan-prone string IDs
       → Secure Code Generation: DATABASE SAFETY item 5
       VERIFY: no plain String field used as a foreign key without @relation
□ 5.6  Critical operations (payment, role change, soft delete) are idempotent
       → Secure Code Generation: DATABASE SAFETY item 6
       CHECK: calling the same mutation twice must not double-charge, double-delete, or corrupt state
```

---

## SECTION 6 — FILE UPLOAD SAFETY (if packages/storage/ exists)

```
□ 6.1  Allowed MIME types are explicitly whitelisted — not a blocklist
       → Secure Code Generation: FILE UPLOAD SAFETY item 1
       VERIFY: grep -rn "allowedTypes\|mimeType\|contentType" packages/storage/
□ 6.2  MIME type validated server-side by reading magic bytes — not file extension only
       → Secure Code Generation: FILE UPLOAD SAFETY item 2
       VERIFY: check for file-type or mmmagic or similar library usage
□ 6.3  File size limit enforced (default max 10 MB)
       → Secure Code Generation: FILE UPLOAD SAFETY item 3
       VERIFY: grep -rn "maxSize\|maxFileSize\|limit" in upload handler
□ 6.4  Stored filenames are randomized — original user filename not used as storage key
       → Secure Code Generation: FILE UPLOAD SAFETY item 4
       VERIFY: grep -rn "randomUUID\|cuid\|nanoid" in upload handler
□ 6.5  Storage paths include tenantId: ${tenantId}/${entityType}/${filename}
       → Secure Code Generation: FILE UPLOAD SAFETY item 5
       VERIFY: grep -rn "tenantId" packages/storage/ — path construction must include tenant
□ 6.6  SVG and HTML file uploads are rejected
       → Secure Code Generation: FILE UPLOAD SAFETY item 6
       VERIFY: SVG and HTML not in the allowed MIME types whitelist
□ 6.7  Files served without executable content-type (no application/javascript, text/html on downloads)
       → Secure Code Generation: FILE UPLOAD SAFETY item 7
```

---

## SECTION 7 — QUEUE AND CACHE SAFETY (if packages/jobs/ exists)

```
□ 7.1  ALL BullMQ job payloads include tenantId and userId fields
       → Secure Code Generation: QUEUE AND CACHE SAFETY item 1
       VERIFY: grep -rn "tenantId\|userId" packages/jobs/ — present in every job type definition
□ 7.2  Workers validate tenantId is present and valid before processing
       → Secure Code Generation: QUEUE AND CACHE SAFETY item 2
       VERIFY: worker entry point checks tenantId before any DB operation
□ 7.3  Valkey cache keys are prefixed with tenantId
       → Secure Code Generation: QUEUE AND CACHE SAFETY item 3
       VERIFY: grep -rn "cache\|redis\|valkey" src/ — key construction includes ${tenantId}:
□ 7.4  Job handlers are idempotent — safe to retry without duplicate side effects
       → Secure Code Generation: QUEUE AND CACHE SAFETY item 4
       CHECK: does re-running a failed job cause duplicate emails, charges, or records?
□ 7.5  No plaintext PII, passwords, or tokens in job payloads
       → Secure Code Generation: QUEUE AND CACHE SAFETY item 5
       VERIFY: review job payload types — should contain IDs for lookup, not inline sensitive data
□ 7.6  DLQ entries are tenant-scoped
       → Secure Code Generation: QUEUE AND CACHE SAFETY item 6
```

---

## SECTION 8 — PRODUCTION ERROR HANDLING

```
□ 8.1  tRPC error formatter strips internal details in production
       → Secure Code Generation: PRODUCTION ERROR HANDLING item 1
       VERIFY: grep -rn "errorFormatter\|onError" src/server/trpc/ — check NODE_ENV === 'production' branch
□ 8.2  Client receives only generic error messages (not Prisma errors, table names, or stack traces)
       → Secure Code Generation: PRODUCTION ERROR HANDLING items 2 + 4
       TEST: trigger a deliberate Prisma error → verify client response has no schema detail
□ 8.3  Full errors logged server-side (console.error or structured logger)
       → Secure Code Generation: PRODUCTION ERROR HANDLING item 3
       VERIFY: error handler logs the full error object for debugging
□ 8.4  No console.log with sensitive data (req.headers.authorization, user passwords, tokens)
       → Secure Code Generation: AGENT PROHIBITIONS item 4
       VERIFY: grep -rn "console.log" src/ — review any that log request objects or auth data
```

---

## SECTION 9 — SECURITY HEADERS + RATE LIMITING + XSS

```
□ 9.1  Security headers present in next.config.ts (X-Frame-Options, CSP, HSTS, etc.)
       → V18, Phase 4 Part 5
       VERIFY: grep -rn "X-Frame-Options\|Content-Security-Policy\|Strict-Transport" next.config.ts
□ 9.2  Rate limiter exists at src/server/lib/rate-limit.ts and is wired into tRPC
       → V18, Phase 4 Part 5
       VERIFY: grep -rn "rateLimit\|rateLimiters" src/server/trpc/
□ 9.3  Auth endpoints (login, register, password reset) use strict rate limits (≤10/min)
       → V18 rate limiter defaults
       VERIFY: grep -rn "rateLimiters.auth" src/server/ — applied to all auth procedures
□ 9.4  DOMPurify sanitizer exists at src/server/lib/sanitize.ts
       → V18, Phase 4 Part 5
□ 9.5  User-submitted HTML content is sanitized before database storage
       → V18 sanitizer
       VERIFY: any rich text / markdown field stored → sanitize() called before prisma.create/update
□ 9.6  No dangerouslySetInnerHTML without sanitization in React components
       → Secure Code Generation: XSS prevention
       VERIFY: grep -rn "dangerouslySetInnerHTML\|innerHTML" src/ — each must use sanitized input
□ 9.7  CORS origins restricted per environment — no wildcard (*) in staging or prod
       → Secure Code Generation: SECURE PRODUCTION DEFAULTS item 5
       VERIFY: grep -rn "cors\|Access-Control-Allow-Origin" — check for * in non-dev configs
□ 9.8  Non-auth tRPC procedures have rate limiting applied (V28)
       → Secure Code Generation: SECURE PRODUCTION DEFAULTS item 7
       VERIFY: grep -rn "rateLimiters" src/server/trpc/ — protectedProcedure should chain .api or .public tier
       VERIFY: no tRPC procedure exists without ANY rate limiter middleware chained
```

---

## SECTION 10 — WEBHOOK SAFETY (if external integrations exist)

```
□ 10.1 Incoming webhooks verify provider signature before processing any data
       → Secure Code Generation: WEBHOOK SAFETY item 1
       VERIFY: grep -rn "verify\|signature\|hmac" in webhook handler files
□ 10.2 Webhook handlers are idempotent — duplicate delivery does not cause duplicate effects
       → Secure Code Generation: WEBHOOK SAFETY item 2
       CHECK: idempotency key or event ID deduplication exists
□ 10.3 Webhook secrets stored in env vars only — not hardcoded
       → Secure Code Generation: WEBHOOK SAFETY item 3
       VERIFY: grep -rn "WEBHOOK_SECRET" — loaded from process.env, not inline string
```

---

## SECTION 11 — SECRETS AND CREDENTIALS

```
□ 11.1 CREDENTIALS.md exists and is in .gitignore
       → V17, Bootstrap Step 18
       VERIFY: grep "CREDENTIALS" .gitignore — must be present
□ 11.2 No real secrets in .env.example — only descriptive placeholders
       → Phase 3 .env.example rules
       VERIFY: cat .env.example | grep -v "^#\|^$" — no actual passwords or tokens
□ 11.3 All generated passwords are ≥22 characters
       → V25 credential policy
       VERIFY: check CREDENTIALS.md — every password field ≥22 chars
□ 11.4 AUTH_SECRET is 48 characters (base64)
       → V25 Master Prompt .env template
       VERIFY: wc -c on AUTH_SECRET value in .env.dev — should be 48
□ 11.5 No secrets in console.log, agent-log.md, CHANGELOG_AI.md, or lessons.md
       → Secure Code Generation: AGENT PROHIBITIONS item 4
       VERIFY: grep -rn "password\|secret\|token" in governance docs — should reference field names only, never values
□ 11.6 .env.dev, .env.staging, .env.prod are all in .gitignore
       → Phase 3, Bootstrap Step 16
       VERIFY: grep "\.env" .gitignore
```

---

## SECTION 12 — SECURE PRODUCTION DEFAULTS

```
□ 12.1 Prisma Studio is NOT accessible in staging or production
       → Secure Code Generation: SECURE PRODUCTION DEFAULTS item 1
       VERIFY: no prisma studio command in staging/prod compose or startup scripts
□ 12.2 pgAdmin port is NOT exposed to public internet (firewall-restricted)
       → Scenario 25, Secure Code Generation: SECURE PRODUCTION DEFAULTS item 2
       VERIFY: staging/prod compose files — pgAdmin port not in the ports: section, or restricted
□ 12.3 No /api/debug, /api/test, or similar debug endpoints exist
       → Secure Code Generation: SECURE PRODUCTION DEFAULTS item 3
       VERIFY: find src/app/api -name "debug*" -o -name "test*" — must return 0 results
□ 12.4 Feature flags default to OFF
       → Secure Code Generation: SECURE PRODUCTION DEFAULTS item 4
□ 12.5 Dev-only env vars (NEXT_PUBLIC_DEBUG etc.) not present in .env.staging or .env.prod
       → Secure Code Generation: SECURE PRODUCTION DEFAULTS item 6
       VERIFY: grep "DEBUG\|VERBOSE\|DEV_" .env.staging .env.prod — must return 0
□ 12.6 Docker compose staging/prod files have NO build: key — pull-only
       → Scenario 24, Phase 4 Part 7
       VERIFY: grep "build:" deploy/compose/stage/ deploy/compose/prod/ — must return 0
□ 12.7 Staging/prod compose files have Traefik labels AND no host ports on app service (V27)
       → Scenario 32 Part B/C, .clinerules DOCKER COMPOSE RULES
       VERIFY: staging/prod app service has traefik.enable=true label
       VERIFY: staging/prod app service has NO ports: section (Traefik routes traffic)
       VERIFY: dev app service still has ports: section (direct access via Docker Desktop)
□ 12.8 Xendit webhook verification (CONDITIONAL — only if payment.gateway: xendit) (V27)
       → Secure Code Generation: XENDIT PAYMENT WEBHOOK SECURITY
       VERIFY: webhook handler reads x-callback-token header
       VERIFY: comparison uses crypto.timingSafeEqual (NOT ===)
       VERIFY: XENDIT_SECRET_KEY is NOT in any NEXT_PUBLIC_* env var
       VERIFY: XENDIT_SECRET_KEY, XENDIT_PUBLIC_KEY, XENDIT_WEBHOOK_TOKEN in .gitignore (via .env files)
       VERIFY: webhook handler checks payment amount against DB record (not trusting payload alone)
       VERIFY: webhook handler is idempotent (duplicate transaction_id returns 200, skips logic)
□ 12.9 Cloudflare Turnstile bot protection — framework default (V27)
       → Secure Code Generation: CLOUDFLARE TURNSTILE BOT PROTECTION
       VERIFY: all public-facing forms (login, register, password reset, contact, payment) include Turnstile widget
       VERIFY: server-side siteverify call exists for every protected form submission — client widget alone = NO protection
       VERIFY: TURNSTILE_SECRET_KEY is NOT in any NEXT_PUBLIC_* env var (only NEXT_PUBLIC_TURNSTILE_SITE_KEY is public)
       VERIFY: siteverify response hostname matches expected domain
       VERIFY: CSP headers include challenges.cloudflare.com in script-src and frame-src
       VERIFY: .env.dev AND .env.staging use Cloudflare test keys (1x00000000000000000000AA), .env.prod uses real keys
       VERIFY: Turnstile api.js loaded from https://challenges.cloudflare.com/turnstile/v0/api.js — NOT proxied or cached
```

---

## SECTION 13 — V31 VALIDATION (Phase 5 commands)

These are the 9 Phase 5 commands. They are NOT security-specific but catch structural issues.
Run them as a baseline before the security checklist above.

```
□ 13.1  pnpm install --frozen-lockfile          → exit 0
□ 13.2  pnpm tools:validate-inputs              → exit 0
□ 13.3  pnpm tools:check-env                    → exit 0
□ 13.4  pnpm tools:check-product-sync           → exit 0 (also checks private tag leakage)
□ 13.5  pnpm lint                               → 0 errors
□ 13.6  pnpm typecheck                          → 0 errors
□ 13.7  pnpm test                               → all pass
□ 13.8  pnpm build                              → exit 0
□ 13.9  pnpm audit --audit-level=high           → 0 HIGH or CRITICAL CVEs
```

---

## HOW TO USE THIS CHECKLIST

**After Phase 4 (initial scaffold):**
Run ALL 13 sections. Every item applies. This is the most critical audit — the scaffold
defines the security posture for the entire project lifecycle.

**After Phase 7 (Feature Update):**
Run only the sections relevant to the feature:
- Added a new tRPC router? → Sections 2, 3, 4, 5, 8
- Added file uploads? → Section 6
- Added background jobs? → Section 7
- Added external webhook integration? → Section 10
- Changed auth config? → Section 1
- Always run Section 13 (Phase 5 commands) regardless

**Cross-AI audit loop:**
1. Claude Code generates the code (MiniMax M2.5)
2. Copy this checklist + relevant code files to ChatGPT or Claude
3. Ask: "Run every item in this checklist against the code. Report PASS/FAIL per item."
4. Fix all FAILs before squash-merge

---

*Part of the Spec-Driven Platform V31 deliverable set.*
*Companion to the SECURE CODE GENERATION section in Master_Prompt_v31.md.*
*Maintained by Claude on behalf of Bonito — Powerbyte IT Solutions, Lipa City, Philippines.*

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
> **Total: 147 verification items across 21 sections.**

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
□ 5.7  Any single-use/limited resource (coupon, invite link, password-reset token, limited-stock
       purchase) uses a DB-level guard, not an app-level read-then-write
       → Secure Code Generation: DATABASE SAFETY item 2 (generalized rule)
       VERIFY: redemption/consumption logic uses a unique index or conditional UPDATE ... WHERE
               qty > 0 / used_at IS NULL — not a separate check-then-act
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
□ 9.9  Clickjacking protection present — X-Frame-Options: DENY or CSP frame-ancestors 'none'
       → Secure Code Generation: SECURE PRODUCTION DEFAULTS item 9
       VERIFY: grep -rn "X-Frame-Options\|frame-ancestors" next.config.ts — both headers present
               together (not X-Frame-Options alone) except on explicitly embeddable widget routes
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
□ 12.10 Open redirect protection — no redirect to a client-supplied URL without allowlist validation
       → Secure Code Generation: AGENT PROHIBITIONS item 14
       VERIFY: grep -rn "returnTo\|redirect_to\|next=\|redirect=" src/ — every usage validates against
               a same-origin/approved-path allowlist and rejects protocol-relative (//) or absolute
               external URLs
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

## SECTION 14 — COMPLIANCE & DATA PRIVACY (V32.9)

Run when PRODUCT.md §12 declares `personal data: yes`. Skip only when `personal data: no` is explicit.

```
□ 14.1  PH DPA (RA 10173) lawful basis declared per processing activity
        → PRODUCT.md §12 Compliance & Data Privacy → Lawful basis field
        VERIFY: lawful basis is one of: consent · contract · legal obligation · legitimate interest ·
                vital interest · public authority — and is recorded in PRODUCT.md, not left blank

□ 14.2  Privacy notice presented at the point of collection (inline form or linked modal)
        → privacy.md § Consent + privacy notice at collection
        VERIFY: consent/signup flow renders a privacy notice with: what data, why, lawful basis,
                retention period, data-subject rights, and how to exercise them

□ 14.3  ConsentLog (or ConsentRecord) Prisma model exists and records consent events
        → privacy.md § Prisma ConsentLog / DataSubjectRequest / retention models
        VERIFY: schema.prisma contains ConsentLog with fields: userId, tenantId, purpose,
                legalBasis, givenAt, withdrawnAt, privacyNoticeVersion

□ 14.4  All 6 data-subject rights implemented as app features or formally deferred in PRODUCT.md
        Rights: access · rectify · erase · object · portability · restrict
        → privacy.md § The 6 data-subject rights → implement as APP FEATURES
        VERIFY: DSR tRPC endpoints exist (or PRODUCT.md §12 states "defer to v2" with owner sign-off)
        VERIFY: DataSubjectRequest model in schema has: type, status, requestedAt, resolvedAt, evidenceUrl

□ 14.5  Retention policy enforced — automated erasure / archival job wired
        → privacy.md § Retention / erasure jobs (BullMQ)
        VERIFY: BullMQ job exists for retention policy declared in PRODUCT.md §12
        VERIFY: eraseExpiredPersonalData job deletes or anonymizes on schedule (cron string matches policy)

□ 14.6  Breach-notification runbook present and 72-hour deadline acknowledged
        → privacy.md § Breach notification — 72 hours
        VERIFY: docs/BREACH_RUNBOOK.md (or equivalent) exists with: NPC report URL, subject notification
                template, 72-hour timer trigger, incident-log location
        VERIFY: PRODUCT.md §12 Breach procedure field is not blank

□ 14.7  Privacy Impact Assessment (PIA) artifact produced before Phase 6 deploy
        → privacy.md § DPO · NPC registration · PIA
        VERIFY: docs/PIA.md (or docs/PRIVACY_IMPACT.md) exists with: processing activities list,
                risks identified, mitigations applied
        CONDITION: skip only if PRODUCT.md §12 PIA required: no is explicitly declared

□ 14.8  Data Protection Officer (DPO) named or formally designated as "to be appointed"
        → PRODUCT.md §12 Compliance & Data Privacy → DPO field
        VERIFY: DPO field in PRODUCT.md §12 is not blank — "to be appointed" is acceptable
        VERIFY: privacy notice (14.2) references DPO contact point

□ 14.9  NPC registration status acknowledged in PRODUCT.md
        → privacy.md § DPO · NPC registration · PIA
        VERIFY: PRODUCT.md §12 NPC registration field is set (required or not required — not blank)
        NOTE: qualifying Personal Information Controllers must register data-processing systems
              with the NPC at privacy.gov.ph before going live

□ 14.10 WCAG 2.2 AA accessibility verified when gov/LGU client flag is set
        → PRODUCT.md §12 Gov/LGU client → WCAG 2.2 AA required (DICT Memorandum Circular 004)
        VERIFY: if gov_lgu_flag: yes → run accessibility audit (axe-core / Lighthouse a11y ≥90)
                on all public + citizen-facing pages before Phase 6 sign-off
        CONDITION: skip only when gov_lgu_flag: no is explicitly declared

□ 14.11 Sensitive personal information (SPI) receives heightened protection
        SPI: health, biometric, government-issued IDs (SSS/GSIS/TIN/PhilHealth), racial/ethnic origin,
             political/religious affiliation, sexual life, offenses/proceedings
        → privacy.md § Sensitive personal information (heightened protection)
        VERIFY: SPI fields in schema have: encryption at rest (column-level or application-level),
                access restricted to minimum roles (L3 RBAC), retention minimized
        CONDITION: skip if no SPI is declared in PRODUCT.md §12

□ 14.12 Compliance-badge claims are honest — design-claim badges only, no false certification claims
        → Master Prompt Rule 33 / privacy.md § Honest compliance-badge policy
        VERIFY: footer / trust-badge UI uses only design-claim badges (e.g. "Privacy-First Design")
                unless the app holds a real certification (ISO 27001, SOC 2, etc.)
        VERIFY: no badge claims "GDPR Certified", "ISO 27001 Certified", or "PCI DSS Compliant"
                unless certification evidence is on file

□ 14.13 OWASP Top 10:2025 A03 (Injection / Supply Chain) — dependency integrity gate
        → security.md § ASVS 5.0 mapping / OWASP Top 10:2025 A03
        VERIFY: pnpm audit --audit-level=high exits 0 (Section 13 item 13.9 must PASS first)
        VERIFY: package.json has no packages with known supply-chain compromise history
                (check npm advisories; flag any package flagged in the last 90 days)
        VERIFY: lockfile (pnpm-lock.yaml) is committed and --frozen-lockfile enforced in CI

□ 14.14 OWASP Top 10:2025 A10 (Fail-Closed / Exceptional Conditions) — fail-safe defaults
        → security.md § ASVS 5.0 mapping / OWASP Top 10:2025 A10
        VERIFY: all tRPC procedures default to DENY on error — no permission granted in catch blocks
        VERIFY: auth session failure → redirects to login, never grants access
        VERIFY: external-service failure (payment, SMS, webhook) → logged + queued for retry,
                never silently continues with elevated privileges
        VERIFY: error boundary in Next.js root layout — unhandled render errors show safe fallback,
                not raw stack traces
```

---

## SECTION 15 — AI / LLM / MCP SECURITY (V32.18)

Run when the app calls an LLM, exposes tools to a model, runs an agent, or ships/consumes an MCP server.
Skip only when the app has no AI/LLM/agent/MCP surface. Maps to OWASP LLM Top 10:2025 + MITRE ATLAS.
→ security.md § AI / LLM / MCP SECURITY. Deep procedures: curated cybersecurity-skills bundle.

```
□ 15.1  Untrusted-input boundary — system instructions structurally separated from all user/retrieved
        content (no untrusted text concatenated into the system-prompt region)
        → security.md § AI/LLM/MCP item 1–2  (OWASP LLM01 · ATLAS AML.T0051)
        VERIFY: system role holds instructions only; user/tool content is fenced + labelled as data
        VERIFY: privileged actions gated by L3 RBAC server-side, NOT by what the model "decided"

□ 15.2  Indirect-injection sanitization on every content the model later reads (RAG chunks, fetched
        pages, uploads, tool results, image-embedded text)
        → security.md § AI/LLM/MCP item 1, 5  (OWASP LLM01)
        VERIFY: retrieved/fetched text is stripped of zero-width chars + Unicode-flattened + scanned
                before ingestion; instructions found inside retrieved chunks are NOT auto-executed

□ 15.3  Tool/function-calling least privilege + server-side argument validation
        → security.md § AI/LLM/MCP item 3  (OWASP LLM06/LLM08)
        VERIFY: high-impact tools (delete, pay, email, role-change, raw SQL, shell) require human
                approval or are not exposed to the model
        VERIFY: every tool argument re-validated Zod-strict + tenant-ownership (model-supplied id is
                an untrusted id — BOLA surface); tool outputs treated as untrusted input

□ 15.4  MCP server safety — for any MCP server the app ships OR consumes
        → security.md § AI/LLM/MCP item 4  (ATLAS AML.T0010 · OWASP MCP03:2025)
        VERIFY: tool definitions pinned + rug-pull detection; raw tool/prompt/resource descriptions
                inspected for hidden instructions (tool poisoning)
        VERIFY: URL-fetching MCP tools pass the SSRF block (allowlist + blocked private ranges)
        VERIFY: the SSRF block explicitly denies the cloud-metadata endpoints (169.254.169.254,
                metadata.google.internal, fd00:ec2::254) — an agent/tool fetch that reaches them is
                cloud-credential theft (harvest 2026-07-16: PentesterFlow/agent AUDIT.md)

□ 15.5  RAG corpus provenance + tenant-scoped retrieval
        → security.md § AI/LLM/MCP item 5, 7  (OWASP LLM01/LLM03)
        VERIFY: write access to the vector store is known; user-writable corpora treated as untrusted
        VERIFY: model retrieval is scoped to the requesting tenant/user (same L1 scoping as any query)

□ 15.6  Output handling — model output treated as untrusted
        → security.md § AI/LLM/MCP item 6  (OWASP LLM02 insecure output handling)
        VERIFY: raw LLM output never rendered as HTML unsanitized, never passed to eval/exec/shell/SQL/
                file-path; structured output schema-validated before any downstream consumer
        VERIFY: output rail filters leaked secrets/PII before reaching the user

□ 15.7  Secrets/PII protection + consumption cap on LLM endpoints
        → security.md § AI/LLM/MCP item 7  (OWASP LLM06/LLM10)
        VERIFY: no API keys, tenant secrets, other users' data, or full system prompt placed where the
                model can echo them; PII redacted from inputs that don't need it
        VERIFY: LLM endpoints rate-limited + cost-capped (treated as public endpoint per L4 tiers)
        VERIFY: agent persistence paths — logs, checkpoints, session memory, learning/compaction
                snapshots — redact secrets/bearer tokens BEFORE write, not only before user display
                (a secret written to a log or snapshot is already leaked; harvest 2026-07-16:
                PentesterFlow/agent src/redact credential-redaction layer)
```

---

## SECTION 16 — API AUTHORIZATION DEPTH & INJECTION FAMILY (V32.18)

Always run when any tRPC router or non-tRPC Route Handler exists. Sharpens IDOR into the full OWASP
API Top 10 authorization set + the non-SQL injection classes.
→ security.md § API AUTHORIZATION DEPTH + § INJECTION FAMILY.

```
□ 16.1  BOLA (API1) — object-level ownership verified before every read/mutate by id
        → security.md § API AUTHORIZATION DEPTH item 1
        VERIFY: object belongs to ctx.tenantId (and ctx.userId where relevant) BEFORE return/mutate,
                even with L6 active; model/client-supplied ids re-checked

□ 16.2  BFLA (API5) — function-level role check tested with a LOW-privilege token
        → security.md § API AUTHORIZATION DEPTH item 2
        VERIFY: admin/privileged procedures check role server-side; a standard user token cannot reach
                an admin function; function never gated by UI visibility alone

□ 16.3  BOPLA mass assignment (API3) — writable fields whitelisted
        → security.md § API AUTHORIZATION DEPTH item 3
        VERIFY: Zod .strict() + .pick() on writable fields; client-sent role, isAdmin, isVerified,
                tenantId, balance, discountRate, permissions, securityVersion are rejected/ignored

□ 16.4  BOPLA excessive data exposure (API3) — response returns only needed fields
        → security.md § API AUTHORIZATION DEPTH item 4
        VERIFY: Prisma select scopes output; passwordHash, internal notes, tenantId, audit fields, and
                other users' PII never leak in a response object

□ 16.5  NoSQL / operator injection closed
        → security.md § INJECTION FAMILY item 1
        VERIFY: object-typed values rejected where a scalar is expected (no { "$gt": "" } smuggling)

□ 16.6  XXE disabled on any XML/SVG/DOCX parser
        → security.md § INJECTION FAMILY item 2
        VERIFY: external entity + DTD resolution disabled on every XML-parsing path

□ 16.7  SSTI — no server-side template built from unsanitized user input
        → security.md § INJECTION FAMILY item 3
        VERIFY: email/report/label templates never interpolate raw user input into a code-executing engine

□ 16.8  Insecure deserialization — typed JSON parse only
        → security.md § INJECTION FAMILY item 4
        VERIFY: untrusted input never deserialized into live objects; parsed to typed Zod schemas only

□ 16.9  CORS not wildcard in prod + Host header validated
        → security.md § INJECTION FAMILY item 5 + SECURE PRODUCTION DEFAULTS item 5
        VERIFY: no wildcard CORS in production; Host header validated/pinned where it drives links or cache keys

□ 16.10 Prototype pollution closed — no __proto__/constructor/prototype key injection
        → security.md § INJECTION FAMILY item 6
        VERIFY: object-merge utilities reject __proto__/constructor/prototype keys from untrusted
                input; no unguarded deep-merge or lodash.merge on user-controlled objects
```

---

## SECTION 17 — AUTH TOKEN & OAUTH SECURITY

Run whenever the app issues/validates JWTs or implements an OAuth/SSO login flow.
→ security.md § Auth DEFAULTS item 7 + § OAUTH/SSO SAFETY.

```
□ 17.1  JWT signing algorithm is pinned server-side — alg:none rejected
        → security.md § Auth DEFAULTS item 7
        VERIFY: Auth.js JWT strategy configures the algorithm explicitly; a token whose header
                claims a different alg (or "none") is rejected, not silently accepted

□ 17.2  Signing-secret entropy ≥32 bytes, generated (not user-chosen)
        → security.md § Auth DEFAULTS item 7
        VERIFY: AUTH_SECRET / JWT signing secret is ≥32 bytes of high-entropy generated data (e.g.
                openssl rand -base64 32) — never a short or human-chosen string

□ 17.3  OAuth flows use PKCE (S256)
        → security.md § OAUTH/SSO SAFETY item 1
        VERIFY: every OAuth authorization-code flow includes code_challenge_method=S256 — plain
                method and PKCE-less flows are rejected

□ 17.4  state parameter is CSRF-bound and single-use
        → security.md § OAUTH/SSO SAFETY item 3
        VERIFY: state is tied to the initiating session and rejected if missing, mismatched, or replayed

□ 17.5  redirect_uri validated against an exact-match allowlist
        → security.md § OAUTH/SSO SAFETY item 2
        VERIFY: no wildcard or prefix/substring match accepted for redirect_uri — exact string match only

□ 17.6  No token placed in a URL query string beyond the initial authorization-code redirect
        → security.md § OAUTH/SSO SAFETY item 4
        VERIFY: grep for access_token=/id_token= in query-string construction outside the OAuth
                provider's own redirect — must return 0
```

---

## SECTION 18 — COMMAND / CODE EXECUTION SAFETY

Run whenever the app shells out, evaluates dynamic code, or accepts input that could reach an
interpreter. → security.md § AGENT PROHIBITIONS item 15.

```
□ 18.1  No unsanitized exec/eval/Function/shell call exists anywhere in the codebase
        → security.md § AGENT PROHIBITIONS item 15
        VERIFY: grep -rn "child_process.exec(\|eval(\|new Function(" src/ — any hit with
                user-derived input is a FAIL

□ 18.2  Where shelling out is unavoidable, execFile()/argv-array form is used with validated,
        allowlisted arguments — never string-concatenated shell commands
        → security.md § AGENT PROHIBITIONS item 15
        VERIFY: grep -rn "execFile\|spawn(" src/ — arguments passed as an array, not interpolated
                into a shell string

□ 18.3  Any required shell-out runs least-privilege / sandboxed
        → security.md § AGENT PROHIBITIONS item 15
        CHECK: the process invoking a shell command runs with the minimum OS privileges needed and,
               where feasible, inside an isolated/sandboxed execution context
```

---

## SECTION 19 — CLOUD CREDENTIAL SAFETY (S3/R2/MinIO)

Run whenever the app integrates AWS S3, Cloudflare R2, or MinIO storage.
→ security.md § CLOUD CREDENTIAL SAFETY.

```
□ 19.1  App-runtime IAM keys are scoped to the specific bucket + minimum actions
        → security.md § CLOUD CREDENTIAL SAFETY item 1
        VERIFY: no s3:* or account-wide keys configured in the app runtime; policy lists only the
                actions the app actually performs (GetObject/PutObject/DeleteObject on its own bucket)

□ 19.2  Container/task IAM role preferred over long-lived static keys in staging/production
        → security.md § CLOUD CREDENTIAL SAFETY item 2
        VERIFY: production deployment uses a task/instance role where the platform supports it;
                static keys, if used, are rotated on the same cadence as other production secrets

□ 19.3  Bucket policy denies public listing
        → security.md § CLOUD CREDENTIAL SAFETY item 3
        VERIFY: bucket policy has no s3:ListBucket grant to anonymous/public principals

□ 19.4  Presigned URLs are short-TTL and scoped to one object key
        → security.md § CLOUD CREDENTIAL SAFETY item 4
        VERIFY: grep -rn "presign\|getSignedUrl" src/ — TTL is minutes not days, and the signed URL
                targets a single object key, never a prefix or whole-bucket grant
```

---

## SECTION 20 — MOBILE APP SAFETY (CONDITIONAL — native mobile only)

Run only when PRODUCT.md §9 declares native mobile (Expo). Skip entirely for web-only apps.
→ security.md § MOBILE APP SAFETY.

```
□ 20.1  Certificate pinning on all mobile API calls
        → security.md § MOBILE APP SAFETY item 1
        VERIFY: the mobile client pins the expected certificate/public key and rejects connections
                presenting a certificate outside the pinned set

□ 20.2  No sensitive data unencrypted in AsyncStorage/WatermelonDB
        → security.md § MOBILE APP SAFETY item 2
        VERIFY: auth tokens and PII are stored via SecureStore/Keychain-backed encryption
                (expo-secure-store or platform Keychain/Keystore), never plain AsyncStorage

□ 20.3  Deep-link handlers validate/allowlist before any privileged action
        → security.md § MOBILE APP SAFETY item 3
        VERIFY: every deep-link entry point re-validates the link and its parameters server-side
                before performing auth, navigation-to-privileged-screen, or a data mutation

□ 20.4  Biometric unlock is a local-UX gate only, never a substitute for server-side session auth
        → security.md § MOBILE APP SAFETY item 4
        VERIFY: Face ID/fingerprint unlock gates local app access only; every privileged API call
                still requires a valid server-side session/token independent of biometric state
```

---

## SECTION 21 — TENANT RBAC & CUSTOM ROLES (V32.25 — Rule 34)

Run for every multi-tenant app (the default multi-tenancy strategy). Verifies the 3-tier backbone,
one-owner-per-tenant enforcement, matrix-driven custom roles, and the guardrails.
→ security.md § L3 — TENANT RBAC STANDARD + `.ai_prompt/rbac.md`.

```
□ 21.1  One-owner-per-tenant enforced at the DB layer by a PARTIAL unique index
        → security.md § L3 — TENANT RBAC STANDARD
        VERIFY: `one_tenant_superadmin_per_tenant` exists as
                unique(tenant_id) WHERE role='tenant_superadmin' AND tenant_id IS NOT NULL —
                inserting a 2nd tenant_superadmin for the same tenant is rejected; platform
                tenant_manager rows (tenant_id=NULL) are unaffected

□ 21.2  Role-enum renames are data-preserving (ALTER TYPE … RENAME VALUE), never DROP/CREATE
        → security.md § L3 — TENANT RBAC STANDARD
        VERIFY: the RBAC migration renames enum values in place; no existing user lost their
                (renamed) role; there is no DROP TYPE / CREATE TYPE on the role enum

□ 21.3  The 3 fixed system tiers exist with correct semantics
        → security.md § L3 — TENANT RBAC STANDARD
        VERIFY: tenant_manager (platform, tenant_id=NULL), tenant_superadmin (tenant owner),
                tenant_admin (below owner) are present; app domain roles sit below tenant_admin

□ 21.4  Deny-by-default matrix enforcement at tRPC procedures
        → security.md § L3 — TENANT RBAC STANDARD
        VERIFY: privileged procedures resolve permission via hasPermission(role, feature, action)
                (matrixProcedure factory) and DENY when no matching grant exists — not allow-by-default

□ 21.5  Deny-by-default matrix enforcement at route middleware
        → security.md § L3 — TENANT RBAC STANDARD
        VERIFY: protected route prefixes (e.g. /users, /settings, feature routes) deny by default
                and admit only roles the matrix grants; an unlisted role is blocked

□ 21.6  Sidebar / nav visibility is filtered by the matrix `view` permission
        → security.md § L3 — TENANT RBAC STANDARD
        VERIFY: menu items render only when the current role has `view` on that feature; hiding a nav
                item is UX only — the tRPC + middleware checks (21.4/21.5) are the real gate

□ 21.7  A custom role can NEVER escalate past the tenant_admin ceiling
        → security.md § L3 — TENANT RBAC STANDARD
        VERIFY: the role-builder rejects (or the resolver ignores) any custom-role grant that would
                exceed tenant_admin capabilities; custom roles are strictly ≤ tenant_admin

□ 21.8  Billing + User-Management are exclusive to tenant_superadmin
        → security.md § L3 — TENANT RBAC STANDARD
        VERIFY: neither tenant_admin nor any custom role can be granted Billing or User-Management;
                these capabilities resolve TRUE only for tenant_superadmin (and platform tenant_manager)

□ 21.9  Only tenant_superadmin (+ platform tenant_manager) can create/edit/assign custom roles
        → security.md § L3 — TENANT RBAC STANDARD
        VERIFY: the role-builder + role-assignment endpoints authorize to tenant_superadmin /
                tenant_manager only; tenant_admin and below cannot mint or assign roles

□ 21.10 Succession is authorized AND audited, both directions
        → security.md § L3 — TENANT RBAC STANDARD
        VERIFY: break-glass reassign (platform tenant_manager) + owner-transfer (promote-then-demote)
                are authz-gated, write an L5 AuditLog entry, and never violate the one-owner index
                mid-transfer; reassigning to a non-existent tenant is rejected

□ 21.11 Roles are ALWAYS server-derived, never trusted from the client
        → security.md § L3 — TENANT RBAC STANDARD (inherits AGENT PROHIBITION #1)
        VERIFY: role/permission is read from the server session, never from a client-sent field,
                header, or form value

□ 21.12 Per-env seeded credentials come from the vault; no secrets committed
        → security.md § L3 — TENANT RBAC STANDARD
        VERIFY: the 3-tier seed accounts read passwords from env (bcryptjs, never hardcoded/argv);
                dev weak creds gate on SEED_DEV_ACCOUNTS=true; values live only in the Server-Setups
                vault (universal-login-credentials.enc.yaml), never pasted into the repo
```

---

## HOW TO USE THIS CHECKLIST

**After Phase 4 (initial scaffold):**
Run ALL 21 sections. Every item applies. This is the most critical audit — the scaffold
defines the security posture for the entire project lifecycle.

**After Phase 7 (Feature Update):**
Run only the sections relevant to the feature:
- Added a new tRPC router? → Sections 2, 3, 4, 5, 8, 16
- Added file uploads? → Section 6
- Added background jobs? → Section 7
- Added external webhook integration? → Section 10
- Changed auth config? → Section 1
- Personal data feature added or changed? → Section 14
- Added an LLM / agent / tool / MCP surface? → Section 15
- Added/changed JWT issuance or an OAuth/SSO login flow? → Section 17
- Added a shell-out, eval, or dynamic-code path? → Section 18
- Added or changed AWS/R2/MinIO cloud storage credentials? → Section 19
- Added native mobile (Expo) features? → Section 20
- Added/changed roles, RBAC, user-management, custom-role builder, or role succession? → Sections 2, 21
- Always run Section 13 (Phase 5 commands) regardless

**Cross-AI audit loop:**
1. Claude Code generates the code (MiniMax M2.5)
2. Copy this checklist + relevant code files to ChatGPT or Claude
3. Ask: "Run every item in this checklist against the code. Report PASS/FAIL per item."
4. Fix all FAILs before squash-merge

---

*Part of the Spec-Driven Platform V31 deliverable set.*
*Companion to the SECURE CODE GENERATION section in Master_Prompt.md.*
*Maintained by Claude on behalf of Bonito — Powerbyte IT Solutions, Lipa City, Philippines.*

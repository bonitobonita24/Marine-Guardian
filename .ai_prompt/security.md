# Spec-Driven Platform V31 — Security Rules

> Loaded contextually by CLAUDE.md when the current task involves security,
> code generation, or any phase that produces source code.
> This file is the sole authority for security constraints.

---

## SECURE CODE GENERATION — MANDATORY FOR ALL PHASES

Every line of generated code MUST follow these constraints. No exceptions. No shortcuts.
If a secure implementation is complex, implement it correctly — never simplify for convenience.
If any requirement conflicts with a feature, security wins.

**AGENT PROHIBITIONS — never do any of these:**
```
1. NEVER trust client-sent role, plan, tier, or privilege fields. Derive from server session only.
2. NEVER skip tenant scoping on any query for convenience — even "simple lookups."
3. NEVER implement auth or authorization checks in frontend-only code.
4. NEVER expose secrets, tokens, or API keys in frontend bundles, logs, or error responses.
5. NEVER disable validation (e.g. z.any()) to resolve a type error — fix the schema instead.
6. NEVER use insecure library defaults without explicitly configuring secure settings.
7. NEVER generate placeholder security logic (e.g. "// TODO: add auth check here").
8. NEVER use Prisma $queryRaw or $executeRaw unless fully parameterized. Prefer Prisma Client API.
9. NEVER return Prisma errors, stack traces, or internal IDs to the client in production responses.
10. NEVER store sensitive data (passwords, tokens, PII) in plaintext in queues or cache.
11. NEVER create a Next.js Route Handler (src/app/api/**/route.ts) for app logic.
    Route Handlers bypass tRPC — meaning L1 tenant scoping, L3 RBAC, and rate limiting are all inactive.
    ONLY allowed for: webhook endpoints, health check (/api/health), and auth callbacks.
    Every Route Handler MUST manually verify auth + tenant. Add comment: "// Non-tRPC: manual auth required"
12. NEVER create a Server Action that performs a mutation without manually checking auth + tenant.
    Server Actions bypass tRPC middleware. If you use a Server Action, it MUST:
    (a) call getServerSession() and verify the session is valid
    (b) extract tenantId from the session — never from the form data
    (c) check role permissions before executing
13. NEVER return tenantId in API response objects to the client.
    Use Prisma select or omit to exclude tenantId from all query results sent to the frontend.
    tenantId is an internal isolation key — the client never needs it and should never see it.
```

**INPUT VALIDATION — enforce on every tRPC procedure:**
```
1. ALL inputs validated with strict Zod schemas. No z.any(), no z.unknown() on user-facing inputs.
2. Reject unknown fields — use .strict() on Zod object schemas.
3. Validate enum values explicitly — no open string types where a fixed set exists.
4. Bound numeric values — no negative quantities, no unbounded page sizes.
5. Validate that resource IDs belong to the requesting tenant BEFORE returning data.
   → This prevents IDOR (Insecure Direct Object Reference) — the #1 API vulnerability.
   → Even with L6 Prisma guardrails, add an explicit ownership check in the resolver.
6. Paginate ALL list endpoints — no unbounded result sets. Default limit: 50. Max limit: 200.
7. Batch operations (bulk delete, bulk update) that accept an array of IDs:
   → Verify EVERY ID in the array belongs to the requesting tenant before executing.
   → Do NOT rely solely on L6 for deleteMany/updateMany with { id: { in: [...] } }.
   → Add an explicit count check: fetch count where id IN ids AND tenantId = ctx.tenantId.
     If count !== ids.length → at least one ID belongs to another tenant → reject entire batch.
```

**DATABASE SAFETY — enforce on every write operation:**
```
1. Use Prisma transactions for ANY multi-step write (e.g. transfer, order creation, inventory update).
2. Handle race conditions with optimistic locking or SELECT FOR UPDATE:
   → Inventory decrements: read quantity → check > 0 → decrement in transaction → retry on conflict.
   → Billing/credits: same pattern. Never decrement without a transactional guard.
3. ALL writes enforce ownership + tenant constraints — L6 auto-injects, but verify manually on sensitive ops.
4. Define unique constraints in Prisma schema wherever business logic requires uniqueness.
5. ALL foreign key relationships enforced — no orphaned records allowed.
6. Critical operations (payments, role changes, deletions) MUST be idempotent — safe to retry.
7. Prisma include/select with nested relations — SECURITY WARNING:
   L6 injects tenantId into the TOP-LEVEL query only. Nested includes (e.g. { include: { customer: true } })
   follow foreign keys directly — they do NOT re-check tenantId on the related record.
   → For sensitive data: use separate queries with explicit tenantId on each related entity.
   → For non-sensitive data: nested includes are acceptable IF the foreign key integrity is guaranteed
     (i.e. the related record was created within the same tenant — enforced by L6 on create).
   → NEVER use nested includes to fetch records from a configurable or user-editable foreign key
     without verifying the related record's tenantId matches.
8. Seed script tenant isolation — MANDATORY:
   Every seeded record MUST have a valid tenantId that matches the tenant it belongs to.
   Every foreign key in seed data MUST resolve to a record within the SAME tenant.
   NEVER create a record in Tenant A that references a record in Tenant B.
   Validate: after seeding, run a query that joins every FK and checks tenantId matches on both sides.
9. Data migration scripts and one-off patches — tenant safety:
   ANY script that runs outside of tRPC (prisma db execute, seed scripts, data patches):
   → MUST iterate over tenants explicitly: for each tenant → scope all queries to that tenant.
   → MUST NOT use unscoped updateMany/deleteMany across all tenants.
   → MUST log which tenant each operation affected.
   → Test on a single tenant first before running across all tenants.
10. Export and report queries — tenant scoping MANDATORY:
    CSV exports, PDF reports, dashboard aggregations, and analytics queries
    MUST include tenantId in every WHERE clause — even on count() and aggregate().
    L6 covers these if using $allOperations (V25), but add explicit tenantId as defence-in-depth.
    An export without tenant scoping leaks every tenant's data into one file.
```

**FILE UPLOAD SAFETY — enforce when packages/storage/ is generated:**
```
1. Whitelist allowed MIME types explicitly — reject everything else. Default: images + PDF + common docs.
2. Validate MIME type server-side (magic bytes) — NEVER trust file extension alone.
3. Enforce file size limits per upload type. Default max: 10 MB. Configurable in inputs.yml.
4. Randomize stored filenames — never use the original user-submitted filename.
5. Storage paths MUST include tenantId: ${tenantId}/${entityType}/${randomFilename}.
6. SVG and HTML uploads are BLOCKED by default — they can contain embedded JavaScript (XSS vector).
7. Uploaded files MUST NOT be served with executable content-type headers.
8. File DOWNLOAD endpoints MUST verify the requesting user's tenantId matches the file's storage path prefix.
   → Extract tenantId from the storage key (first path segment).
   → Compare against ctx.tenantId from the authenticated session.
   → If mismatch → return 404 (not 403 — do not confirm the file exists).
   → NEVER serve a file by accepting a raw storage key from the client without this check.
```

**QUEUE AND CACHE SAFETY — enforce when packages/jobs/ is generated:**
```
1. ALL BullMQ job payloads MUST include tenantId and userId — no tenant-blind jobs.
2. Workers MUST validate tenantId before processing — reject jobs with missing or invalid tenantId.
3. ALL Valkey cache keys MUST be prefixed with tenantId: ${tenantId}:${keyName}.
4. Jobs MUST be idempotent — safe to retry on failure without side effects.
5. No PII, passwords, or tokens stored in plaintext in job payloads or cache values.
6. DLQ (dead letter queue) entries MUST be tenant-scoped and never expose cross-tenant data.
7. Cron jobs and scheduled tasks — SPECIAL HANDLING:
   Cron jobs run on a timer — they have NO HTTP request, NO session, NO user, NO tenant context.
   → A cron job MUST iterate over all active tenants explicitly:
     const tenants = await prisma.tenant.findMany({ where: { isActive: true } });
     for (const tenant of tenants) {
       await processForTenant(tenant.id);  // every query inside scoped to this tenantId
     }
   → NEVER run a cron job that queries without tenant context — it returns data from ALL tenants.
   → Log each tenant iteration separately for audit trail.
```

**PRODUCTION ERROR HANDLING — enforce in every tRPC router:**
```
1. NEVER return raw Prisma errors, stack traces, or internal details to the client.
2. Wrap all tRPC error responses in generic messages for production:
   → BAD_REQUEST: "Invalid input."
   → NOT_FOUND: "Resource not found."
   → FORBIDDEN: "Access denied."
   → INTERNAL_SERVER_ERROR: "Something went wrong. Please try again."
3. Log the FULL error (including stack trace) server-side for debugging.
4. NEVER include table names, column names, or constraint names in client-facing errors.
5. Auth error messages MUST NOT reveal whether the account, tenant, or email exists:
   → Login failure: "Invalid credentials." (not "User not found" or "Wrong password" or "Organization not found")
   → Password reset: "If that email exists, a reset link has been sent." (not "Email not found")
   → Tenant resolution: "Access denied." (not "Organization does not exist")
   This prevents enumeration attacks where an attacker discovers valid emails, usernames, or tenant slugs
   by observing different error messages for existing vs non-existing values.
```

**WEBHOOK SAFETY — enforce when any external integration is implemented:**
```
1. ALL incoming webhooks MUST verify the provider's signature before processing.
2. Webhook handlers MUST be idempotent — duplicate delivery must not cause duplicate side effects.
3. Webhook secrets MUST be stored in environment variables only — never hardcoded.
```

**SSRF PREVENTION — enforce when server-side code makes outbound HTTP requests (NEW V28):**
```
1. NEVER pass user-supplied URLs directly to fetch(), axios, got, or any HTTP client on the server.
   → If the app fetches external resources (avatar URLs, webhook callbacks, import URLs, link previews):
     validate the URL against an allowlist of approved domains, OR
     reject private/internal IP ranges before making the request.
2. Blocked IP ranges (reject if resolved hostname falls within):
   → 127.0.0.0/8 (loopback)
   → 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (private RFC 1918)
   → 169.254.0.0/16 (link-local / cloud metadata — AWS 169.254.169.254 attack vector)
   → ::1, fc00::/7 (IPv6 loopback and private)
   → 0.0.0.0/8 (unspecified)
3. URL parsing: use `new URL(input)` and check the `.hostname` property.
   NEVER use regex to validate URLs — regex cannot handle all URL encoding edge cases.
   Resolve the hostname to an IP address BEFORE making the request (DNS rebinding prevention).
4. If fetching user-provided URLs is a core feature (e.g. link previews, RSS import):
   → Use a sandboxed proxy service or dedicated worker with network restrictions.
   → Apply request timeout (≤10 seconds) and response size limit (≤5 MB).
   → Strip credentials from redirects — do not follow redirects to internal networks.

**Auth DEFAULTS — do not override these Auth.js v5 secure defaults:**
```
1. Session cookies: HttpOnly=true, Secure=true (production), SameSite=lax. Do NOT change these.
2. Password reset tokens: MUST be time-limited (max 1 hour) and single-use.
3. Email verification: enforce before any privileged action (role assignment, data export, billing).
4. Logout: MUST invalidate the session server-side — not just clear the frontend cookie.
5. Auth secrets: MUST exist in env vars only. NEVER import or reference in any client-side file.
6. Session invalidation on role or tenant change (NEW V28):
   → When a user's role changes, tenant membership changes, or account is deactivated:
     force-invalidate ALL active sessions for that user immediately.
   → Implement via Auth.js session callback: store a `securityVersion` (integer) on the User model.
     Increment it on every role/tenant/status change. In the session callback, compare
     session.securityVersion against the DB value — if stale → force sign-out.
   → NEVER allow a session with stale role/tenant data to persist — the user must re-authenticate.
   → This covers: role escalation/de-escalation, tenant removal, account suspension, password change.
```

**CSRF PROTECTION — framework posture (NEW V28):**
```
tRPC uses POST-based RPC for all mutations. Combined with Auth.js v5 SameSite=lax cookies,
the standard tRPC + Auth.js stack is inherently CSRF-resistant — no additional CSRF tokens needed.

WHY: Traditional CSRF attacks exploit GET-based state changes or cookie-based POST to a different origin.
tRPC mutations are POST-only to /api/trpc/* with JSON Content-Type. SameSite=lax prevents the browser
from sending cookies on cross-origin POST requests. Together these eliminate the CSRF vector.

EXCEPTION — Route Handlers (/api/**/route.ts):
Route Handlers bypass tRPC and receive raw HTTP requests. If a Route Handler:
  (a) accepts POST/PUT/DELETE with cookie-based auth, AND
  (b) performs a state-changing operation (not just webhook receipt)
→ It MUST implement one of:
  - Double-submit cookie pattern (CSRF token in both cookie and header)
  - Origin/Referer header validation against known domains
  - Custom X-Requested-With header check
Webhook endpoints are exempt — they use signature verification (x-callback-token, HMAC) instead.

DO NOT add CSRF tokens to tRPC procedures — it adds complexity with zero security benefit.
DO verify CSRF protection on every non-tRPC Route Handler that mutates state.
```

**TENANT MIDDLEWARE SAFETY — enforce in src/middleware.ts:**
```
1. URL-derived tenant slug (from path or subdomain) MUST be cross-checked against the session.
   → After resolving the tenant from the URL, verify session.user.tenantId === resolved tenant ID.
   → If mismatch → redirect to the user's actual tenant URL. Do NOT serve the requested tenant's data.
   → This prevents the tenant-switching attack: user types /other-tenant/settings in the URL bar
     and gets access to another tenant because middleware trusts the URL without session verification.
2. If the user has access to multiple tenants (e.g. superadmin):
   → The session MUST contain the CURRENTLY ACTIVE tenantId, not a list of all accessible tenants.
   → Tenant switching MUST go through an explicit API call that updates the session's active tenantId.
   → The URL slug is a display convenience — the session is the source of truth for tenant context.
```

**SUPERADMIN AND PLATFORM-LEVEL ROLES — enforce when any cross-tenant role exists:**
```
1. Superadmin queries that bypass tenant scoping MUST use a dedicated Prisma client instance
   WITHOUT the L6 tenant-guard extension — never an inline if/else in resolvers.
   → Create: const platformPrisma = new PrismaClient();  // NO tenant extension
   → Use platformPrisma ONLY in superadmin-specific routers.
   → Regular tenant-scoped routers continue using the guarded prisma instance.
2. ALL superadmin operations MUST be logged to AuditLog with action prefix "PLATFORM:" to distinguish
   from tenant-scoped operations. Example: "PLATFORM:VIEW_ALL_TENANTS", "PLATFORM:DISABLE_TENANT".
3. Superadmin routers MUST be in a separate tRPC router file (e.g. src/server/trpc/routers/platform.ts)
   with its own middleware that checks for the platform-level role — never mixed into tenant routers.
4. NEVER add an inline `if (isSuperadmin) skip tenant filter` inside a regular tenant-scoped resolver.
   This pattern spreads across every resolver over time and becomes impossible to audit.
```

**REALTIME CONNECTION SAFETY — enforce when WebSocket or SSE features exist:**
```
1. WebSocket/SSE connections authenticate at handshake. But sessions can be revoked mid-connection.
   → Implement a heartbeat check (every 30–60 seconds) that re-validates the session:
     if session expired, revoked, or tenant membership changed → close the connection server-side.
   → NEVER assume a WebSocket connection remains authorized for its entire lifetime.
2. Real-time event broadcasts MUST be scoped by tenantId.
   → Use channel naming: ${tenantId}:${eventType} — e.g. "tenant-abc:order-updated"
   → NEVER broadcast to a global channel that all connected clients receive.
3. When a user's role changes or they are removed from a tenant:
   → Force-close their active WebSocket/SSE connections immediately.
   → Do NOT wait for the next heartbeat — role changes are security-critical.
```

**XENDIT PAYMENT WEBHOOK SECURITY — CONDITIONAL (only when payment.gateway: xendit):**
```
1. EVERY incoming Xendit webhook MUST verify the x-callback-token header:
   → Compare request.headers['x-callback-token'] against XENDIT_WEBHOOK_TOKEN env var
   → Use constant-time comparison (crypto.timingSafeEqual or equivalent) — never ===
   → Reject immediately with HTTP 401 if token does not match
   → Log rejection to audit trail (IP, timestamp, attempted payload — NOT the token value)

2. Webhook handlers MUST be idempotent:
   → Store the transaction ID (payment_id / invoice_id) with a processed flag
   → On duplicate webhook: return HTTP 200 (acknowledge) but skip business logic
   → Use DB unique constraint on transaction_id to enforce at storage level
   → Xendit retries up to 6 times with exponential backoff on non-2xx responses

3. Webhook handlers MUST validate payload integrity:
   → Verify the payment amount matches what YOUR system requested (not what webhook says)
   → Verify the transaction ID exists in your DB (was created by your system)
   → NEVER trust webhook payload alone for product/service provisioning

4. Webhook endpoint security:
   → Route: /api/webhooks/xendit (tRPC bypassed — raw HTTP handler for webhook)
   → Method: POST only
   → No auth middleware (Xendit cannot provide JWT) — x-callback-token IS the auth
   → Rate limited separately from user-facing endpoints
   → NEVER expose webhook endpoint URL in client-side code

5. Xendit API key handling:
   → Secret key: server-side ONLY — never in NEXT_PUBLIC_* env vars, never in client bundles
   → Public key: safe for client-side tokenization (card data capture) — but still stored in .env
   → Auth format: Basic Auth with secret key as username, empty password, Base64 encoded
   → NEVER log API keys in CHANGELOG_AI, agent-log, or any governance doc

6. Queue webhook processing (RECOMMENDED for production):
   → Receive webhook → validate x-callback-token → enqueue to BullMQ → return 200 immediately
   → Worker processes the payment update asynchronously (prevents timeout on slow DB writes)
   → This matches Xendit's own recommendation for high-volume merchants

Xendit docs: https://docs.xendit.co/docs/handling-webhooks
Xendit API: https://docs.xendit.co/apidocs
Integration security: https://docs.xendit.co/docs/integration-security
```

**CLOUDFLARE TURNSTILE BOT PROTECTION — FRAMEWORK DEFAULT (V27):**
```
Turnstile is the framework default bot protection. It replaces CAPTCHA with invisible or managed
challenges. Enabled by default on all public-facing forms. WCAG 2.2 AAA compliant.

1. WHICH PAGES TO PROTECT (strategy to stay within FREE tier — 1 widget, 3 hostnames):
   ALWAYS PROTECT (public-facing, unauthenticated):
   → Login page (/login) — prevents credential stuffing
   → Registration page (/register) — prevents mass fake account creation
   → Password reset (/forgot-password) — prevents email enumeration
   → Contact / inquiry forms — prevents spam
   → Payment pages (if Xendit enabled) — prevents card testing
   → Any public API endpoint that accepts unauthenticated POST input
   DO NOT PROTECT (already behind auth — use rate limiting instead):
   → Authenticated dashboard pages (user already proved they're human at login)
   → Internal admin pages behind RBAC (protected by L3 RBAC + L5 AuditLog)
   → API endpoints called by authenticated frontend (JWT + rate limiting suffices)
   → Mobile API endpoints (use mobile implementation pattern instead if needed)

2. WIDGET BUDGET STRATEGY (FREE tier: 20 widgets, 10 hostnames per widget):
   DEFAULT: 1 widget per app. Same sitekey on all protected pages.
   Hostnames on REAL widget: ${prod_domain} ONLY (dev + staging use test keys — no hostname needed).
   This means 1 of 10 hostname slots used per app. Maximum budget efficiency.
   MULTI-TENANT SaaS with custom domains:
   → If tenants use subdomains of YOUR domain (e.g. *.yourapp.com): 1 widget, add *.yourapp.com
   → If tenants bring their own custom domains: each unique domain = 1 hostname.
     Up to 9 custom domains + your prod domain = 10 hostnames on 1 widget.
     More than 9 custom domains = need a 2nd widget (still within 20 widget budget).
   → Ask during Phase 2 Section H: "How many unique hostnames will your app use?"
   → Lock hostname plan in DECISIONS_LOG.md under "Turnstile widget allocation"

3. CLIENT-SIDE IMPLEMENTATION (Next.js + React):
   → Use explicit rendering via @marsidev/react-turnstile (React component — npm install)
   → Render <Turnstile siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} /> in protected forms
   → Widget mode: "managed" (default — Cloudflare decides whether to show checkbox)
   → On success: callback returns token string → include in form submission or tRPC mutation
   → On expiry: token expires after 300 seconds — call turnstile.reset() to regenerate
   → The api.js script MUST be loaded from https://challenges.cloudflare.com/turnstile/v0/api.js
     NEVER proxy, cache, or self-host this script — Turnstile will break on updates
   → CSP: add challenges.cloudflare.com to script-src. Turnstile supports strict-dynamic with nonce.
   → Performance hint: add <link rel="preconnect" href="https://challenges.cloudflare.com"> in <head>

4. SERVER-SIDE VALIDATION (MANDATORY — client-side widget alone provides NO protection):
   → Create a shared tRPC middleware or utility function: verifyTurnstileToken(token, remoteIp)
   → POST to: https://challenges.cloudflare.com/turnstile/v0/siteverify
     Body: { secret: TURNSTILE_SECRET_KEY, response: token, remoteip: clientIp }
   → Response: { success: boolean, error-codes: string[], challenge_ts: string, hostname: string }
   → On success=false: reject the request with HTTP 400 — do NOT proceed with form logic
   → Token characteristics: max 2048 chars, valid 300 seconds, SINGLE USE (cannot validate twice)
   → Validate hostname in response matches expected domain (prevents token replay across sites)
   → TURNSTILE_SECRET_KEY is server-only — NEVER in NEXT_PUBLIC_* env vars

5. DEV + STAGING ENVIRONMENTS (test keys — no real Cloudflare widget needed):
   → .env.dev AND .env.staging both use Cloudflare's official test keys (always passes)
   → This means only production needs real keys — saves hostname budget on the widget
   → Test sitekey 1x00000000000000000000AA + secret 1x0000000000000000000000000000000AA
   → For testing failure: use 2x00000000000000000000AB + 2x0000000000000000000000000000000AB
   → For testing interactive challenge: use 3x00000000000000000000FF
   → Staging is a real-world environment but Turnstile test keys still work — they always pass
     This is intentional: staging tests your app logic, not Cloudflare's bot detection

6. CONTENT SECURITY POLICY (update security headers when Turnstile enabled):
   → script-src: add https://challenges.cloudflare.com (or use strict-dynamic with nonce)
   → frame-src: add https://challenges.cloudflare.com
   → Phase 4 Part 3 (security headers) must include these CSP entries when turnstile.enabled: true

Docs: https://developers.cloudflare.com/turnstile/
Client-side: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
Server-side: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
Testing: https://developers.cloudflare.com/turnstile/troubleshooting/testing/
CSP: https://developers.cloudflare.com/turnstile/reference/content-security-policy/
```

**SECURE PRODUCTION DEFAULTS — verify before any deployment:**
```
1. Prisma Studio: NEVER exposed in staging or production. Dev only.
2. pgAdmin port: restricted by firewall — never open to public internet (Scenario 25).
3. Debug endpoints (/api/debug, /api/test): MUST NOT exist in production builds.
4. Feature flags: default to OFF. Enable explicitly per environment.
5. CORS: restricted to known domains per environment. NEVER use wildcard (*) in production.
6. Dev-only env vars (NEXT_PUBLIC_DEBUG, etc.): stripped from staging/prod .env files.
7. Rate limiting: ALL public-facing routes MUST have rate limiting — not just auth endpoints (NEW V28).
   → Auth endpoints (login, register, password reset): strict — ≤10 req/min per IP.
   → Authenticated API (tRPC protectedProcedure): moderate — ≤100 req/min per user.
   → Public pages and unauthenticated endpoints: lenient — ≤300 req/min per IP.
   → Use a tiered middleware approach. The rate limiter generated in Phase 4 Part 5 already
     has `rateLimiters.auth`, `.api`, `.public`, `.upload` tiers — ensure ALL tRPC procedures
     use the appropriate tier, not just auth endpoints.
```

---

## SYSTEM HARDENING ADDITIONS (V25)

These four rules consolidate and surface the enforcement mechanisms already present in V23+. They are not new concepts — they are explicit, named, machine-enforceable rules so every agent can reference them by name.

---

### H1 — Global Authority Order (Rule 28 reference)

When any two sources conflict, the higher-priority source wins. No exceptions. No agent discretion.

```
PRIORITY  SOURCE                  ENFORCED BY
────────  ──────────────────────  ───────────────────────────────────
1         Safety constraints      All agents — never expose credentials,
                                  never delete without confirm, never harm data
2         CLAUDE.md rules         This file — all 30 rules
3         Active phase rules      Numbered steps of the current phase
4         docs/PRODUCT.md         Feature intent — what to build
5         docs/DECISIONS_LOG.md   Locked decisions — never re-decide
6         inputs.yml              Tech stack config
7         SKILL.md packs          Domain knowledge only — never overrides
                                  governance or CLAUDE.md rules
8         User message            Current session request
```

On conflict: follow higher-priority source AND append to agent-log.md:
`CONFLICT: [source A] vs [source B] — followed [source A] per H1 priority order`

IF an agent cannot determine priority → STOP and ask human. Never guess.

---

### H2 — Determinism Enforcement

Three mechanisms activate together. All are non-negotiable. All must pass.

```
MECHANISM          ENFORCED BY             WHAT IT PREVENTS
─────────────────  ──────────────────────  ─────────────────────────────────────
Rule 29            WHO YOU ARE             Fuzzy language, guessing, assumption.
(no fuzzy)         + .clinerules           Banned: "probably", "seems like",
                                           "I assume", "typically", "usually"
4 output types     STANDARD OUTPUT         Free-form phase output. Only these
                   TYPES section           4 formats allowed: SUCCESS_OUTPUT /
                                           GAP_REPORT / HANDOFF_OUTPUT /
                                           PHASE_COMPLETE
Phase output       Each phase section      Silent partial completion. Every
contracts          (□ checkboxes + gate)   critical phase has a □ checklist
                                           that must fully pass before done.
```

A response that passes Rule 29 but uses a non-standard output format **violates H2**.
A phase that clears its output contract but used fuzzy reasoning to skip a checkbox **violates H2**.
All three must pass simultaneously.

---

### H3 — Partial Phase Recovery

When a Claude Code session ends before a Phase 4 Part completes:

```
STEP  ACTION
────  ──────────────────────────────────────────────────────────────
1     On next session start: FRESH-START SAFETY reads STATE.md first
2     IF STATE.md PHASE contains "PARTIAL" → do NOT start new Part
3     Run: git status  — identify files written before interruption
4     Run: git stash list — check for uncommitted work
5a    IF files committed but branch not merged:
        → squash-merge existing branch → verify output contract → Part N+1
5b    IF files written but NOT committed:
        → commit what exists → pnpm lint + typecheck → fix errors → squash-merge
5c    IF nothing committed (very early interruption):
        → checkout existing branch (do NOT create new) → restart Part from scratch
6     Rewrite STATE.md: remove PARTIAL flag → set LAST_DONE → NEXT correctly
```

IF STATE.md is missing entirely → write HANDOFF_OUTPUT → stop → ask human which phase to resume.
NEVER overwrite committed work. NEVER restart a Part that has merged commits.

---

### H4 — Agent Responsibility Isolation

Each agent has a hard phase boundary. Operating outside it is a violation.

```
AGENT         PERMITTED PHASES            HARD STOP IF OUTSIDE
────────────  ──────────────────────────  ──────────────────────────────────────
Claude Code   ALL phases (V31 primary).   IF asked to rewrite PRODUCT.md →
              Bootstrap through Phase 8,  output: "⚠ PRODUCT.md is human-owned.
              Feature Updates, Resume,    Describe the change and I will list
              Gov Sync, Retro.            the exact edit needed."
Cline         ⚠ DEPRECATED (V31).         IF any instruction routes to Cline →
              Do not use. Claude Code     treat as Claude Code instruction.
              handles all work Cline      Never execute Cline-specific behavior.
              used to handle.             .clinerules file stays generated but unread.
Copilot       Inline autocomplete,        IF generating governance docs or
              PR review only             phase scaffold → defer to Claude Code
Planning      PRODUCT.md writing +       IF asked to generate inputs.yml,
Assistant     Phase 2.8 mockup (V31)     code, or scaffold → output: "I only
              (no code, no config,       produce PRODUCT.md and ephemeral HTML
              no inputs.yml, mockup      mockups. Take this spec to your project
              is ephemeral)              and run Phase 2 in Claude Code."
```

File ownership enforcement (already in .clinerules) is the file-level companion to this rule.
H4 is the phase-level enforcement. Both apply simultaneously.

---

# Spec-Driven Platform V31 — Templates & Reference

> Loaded contextually when generating config files, env templates,
> compose files, or when needing the detailed file ownership reference.
> Also contains the full .clinerules embedded content for Cline users.

---

## STANDARD OUTPUT TYPES — Reference

```
SUCCESS_OUTPUT
  Use when: phase or task completed, all output contracts met
  Format:
  ✅ [Phase/Task] complete.
     [What was done — 1–3 bullets]
     Next: [what runs next or what human should do]

GAP_REPORT
  Use when: gaps, missing info, or spec failures found
  Format:
  🔴 [N] gap(s) found.
  ─────────────────────────────────────────
  GAP 1:
    SECTION:  [which document or section]
    PROBLEM:  [one sentence — what is missing or wrong]
    FIX:      [exact text to add or exact action to take]
  ─────────────────────────────────────────
  [repeat per gap]
  NEXT STEP: [what human must do before agent can continue]

HANDOFF_OUTPUT
  Use when: agent stuck, cannot resolve after 2 attempts (TYPE 1 recovery)
  Format:
  🛑 HANDOFF — [timestamp]
  ─────────────────────────────────────────
  DOING:      [what task was in progress]
  ERROR:      [full error text]
  ATTEMPT 1:  [what was tried]
  ATTEMPT 2:  [what was tried differently]
  ROOT CAUSE: [best hypothesis]
  NEXT STEP:  [exact action for human to take]
  ─────────────────────────────────────────
  File written to: .cline/handoffs/[timestamp]-error.md

PHASE_COMPLETE
  Use when: a phase is fully done, governance verified, ready for next phase
  Format:
  ✅ [Phase N] complete — all output contracts met.
     Governance verified: CHANGELOG ✓  IMPLEMENTATION_MAP ✓  STATE.md ✓
     Next phase: [Phase N+1 name and trigger]
```

---

## QUICK REFERENCE — The 3 rules of adding anything

```
┌─────────────────────────────────────────────────────────────┐
│  RULE A: Always start in PRODUCT.md                         │
│          Never touch inputs.yml, source files, or migrations │
│          directly. PRODUCT.md is your only interface.        │
├─────────────────────────────────────────────────────────────┤
│  RULE B: Describe WHAT, not HOW                             │
│          Write what the feature does for the user.           │
│          The agent decides the implementation details.       │
├─────────────────────────────────────────────────────────────┤
│  RULE C: Always run governance tools after applying changes  │
│          pnpm tools:check-product-sync                       │
│          pnpm typecheck                                      │
│          pnpm test                                           │
│          pnpm build                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## PROMPT VERSIONING CONVENTION

Files named: `Master_Prompt_v29.md`, `Master_Prompt_v30.md`, `Master_Prompt_v31.md`, etc.
All 16 files in the complete set always share the same version number.

Version increments when: new Rule added, new Phase added, new Scenario added,
new recovery procedure added, or agent stack changes.
Version stays same for: wording fixes, clarifications, side note updates.

**Adopting a new version on an existing project:**
```
1. cp "Master Prompt v31.md" ./CLAUDE.md
   Also copy to .specstory/specs/v31-master-prompt.md
2. Update .specstory/config.json → set autoInjectSpec: "v31-master-prompt.md"
3. Open new session → immediately run "Resume Session" + 3 docs
4. Never re-run Phase 2, 3, or 4 when adopting a new version.
   Resume Session is always sufficient to reconnect to your existing project.
5. V27: Traefik reverse proxy — update staging/prod compose files: add Traefik labels + proxy external network to app service, remove ports: from app. Add TRAEFIK_NETWORK=proxy and APP_DOMAIN to .env.staging/.env.prod. Dev compose unchanged.
6. V27: Komodo deployment model — set auto_update: true on staging Stack, auto_update: false on prod Stack. Remove webhook step from docker-publish.yml if present. Webhook GitHub Secrets now optional.
7. V27: Xendit payment gateway — if app accepts payments, add XENDIT_SECRET_KEY, XENDIT_PUBLIC_KEY, XENDIT_WEBHOOK_TOKEN to .env files (dev=TEST keys, staging/prod=LIVE keys). Run Bootstrap Step 18 Section 4.5 to collect keys. Add Xendit section to CREDENTIALS.md.
8. V27: Cloudflare Turnstile — add NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY to all .env files (dev+staging=test keys, prod=real keys from dash.cloudflare.com → Turnstile). Add widget with hostname: prod domain only. Update CSP headers to allow challenges.cloudflare.com.
9. V25: WSL2 native only — no devcontainer. No setup change needed for existing WSL2 projects.
8. V25: System Hardening H1–H4 active — auto-enforced, no action needed.
9. V23: Bootstrap Step 18 Credential Gate active — if not yet run, run Bootstrap first.
10. V23: Context7 Rule 30 active — append "use context7" to any library task in Claude Code (Cline deprecated V31).
11. V22: Docker pipeline active — push.sh + COMMANDS.md generated when docker.publish: true.
12. V22: Start dev: bash deploy/compose/start.sh dev up -d. Push image: bash deploy/compose/push.sh dev
13. V21: Rule 29 active — no fuzzy reasoning in Claude Code (Cline deprecated V31). Auto-enforced via WHO YOU ARE.
14. V21: Edge case recovery active — Scenario 29 has procedures for 5 failure modes.
15. V20: Global priority ladder visible in WHO YOU ARE — no action needed, auto-enforced
16. V19 skills: mkdir -p .github/skills/spec-driven-core then write SKILL.md from Bootstrap Step 17 template.
   Optional packs: see Scenario 27
17. V19 Phase 2.7: say "Re-run Phase 2.7" in Claude Code to stress-test your existing PRODUCT.md.
   To disable: set vibe_test.enabled: false in inputs.yml
18. V19 model (historical — Cline deprecated V31): update OpenRouter model to minimax/minimax-m2.5 if using Cline
19. V18: Security headers + rate limiter + DOMPurify + pnpm audit — always-on defaults
   Verify: curl -I http://localhost:${APP_PORT} | grep x-frame
20. V17: CREDENTIALS.md generated by Phase 3 — strictly gitignored, never read into context
   Verify: grep CREDENTIALS .gitignore
21. V16: pgAdmin on all environments — check .env.dev for PGADMIN_PORT and credentials
22. V15 optional: docker.publish: true in inputs.yml → Dockerfile + docker-publish.yml generated
   Add DOCKERHUB_USERNAME + DOCKERHUB_TOKEN secrets in GitHub repo settings
23. V14 optional: UI UX Pro Max skill + code-review-graph + Section K → Phase 2.6
24. V11: .specstory/config.json already exists — just update the autoInjectSpec value
```


**v22 → v23 upgrade notes — Context7 + Design quality + Accessibility:**
- Rule 30 (Context7 live docs): always append "use context7" to tasks involving external libraries
- Bootstrap Step 10: .vscode/mcp.json now includes Context7 MCP entry alongside SocratiCode
- Bootstrap Step 17: frontend-design plugin (Anthropic official) + a11y skill (conditional) added
- Phase 2.6: Vercel Web Interface Guidelines embedded in MASTER.md (interactions, forms, animations, a11y, dark mode)
- Phase 2.6: shadcnblocks catalog registered if skill installed (2500+ blocks)
- Phase 2.6: a11y enforcement block added when accessibility: wcag_aa declared in PRODUCT.md
- Phase 7 Stage 2: code-simplifier checklist added (DRY, YAGNI, extract helpers, no-value wrappers)
- Scenario 31: Context7 usage walkthrough with worked examples for full stack
- inputs.yml: context7 + accessibility fields added
- Bootstrap Step 18 (NEW V23): Credential Collection Gate — blocking step after Bootstrap Step 17.
  Collects: GitHub account + token, Docker Hub username + token, SMTP credentials, Komodo webhook URLs, third-party API keys.
  Generates: all service passwords at 22-char minimum (PostgreSQL, PgBouncer, Valkey, MinIO, pgAdmin, Auth secrets, webmaster).
  Writes: complete CREDENTIALS.md before Phase 2 can begin (Phase 1 dev setup is optional — skip if already configured). Step count: 17 → 18.
- Scenario 32: full Komodo deployment guide — Core+Periphery install, Stack config, GitHub Actions webhook, rollback, monitoring
- CREDENTIALS.md: Komodo section added (KOMODO_PASSKEY, WEBHOOK_SECRET, JWT_SECRET, stack webhook URLs)

**v23 → v25 — devcontainer removal + hardening (V25):**
- ARCH CHANGE: Devcontainer (MODE B) fully removed from all files. WSL2 native (MODE A) is the only supported dev environment. No .devcontainer/ folder, no devcontainer.json, no DinD.
- Rule 8 rewritten: "WSL2 native is the only supported dev environment" — replaces devcontainer MODE B rules
- Rule 22: renamed + Part B (DinD) removed entirely — ports/container naming rule only
- Bootstrap Step 1: mkdir -p .devcontainer removed
- Bootstrap Step 9: devcontainer template removed — replaced with WSL2 dev env DECISIONS_LOG entry
- Bootstrap lessons.md template: devcontainer gotcha entry replaced with WSL2 native gotchas
- Phase 1: MODE B section removed — WSL2 native only
- Phase 5/6 headers: devcontainer terminal references removed
- Phase 6: MODE B DinD block removed
- Phase 6.5: 5 devcontainer-specific triage categories removed (DOCKER_SOCKET_PERMISSION, POSTCREATECMD_EACCES, SHELL_SERVER_TERMINATED_4294967295, DOCKER_OUTSIDE_OF_DOCKER_INCOMPATIBLE, HOME_DIR_PERMISSION). Category count: 19 → 16 (PORT_ALREADY_BOUND + PGADMIN_UNREACHABLE from V16 remain).
- Phase 2: CREDENTIALS.md pre-flight gate added (was missing — Phase 3 had it, Phase 2 did not)
- Phase 2 Section I: dev environment question removed (pre-locked at Bootstrap, never re-ask)
- Phase 3: devcontainer.json generation step removed
- Development Commands header: devcontainer terminal removed
- ACTIVE DEV MODE in clinerules: fixed to MODE A only
- .clinerules WATCH MODE: devcontainer terminal removed
- code-review-graph build note: devcontainer terminal removed
- File Ownership table: .devcontainer/** entry removed
- Session banner: .devcontainer bullet replaced with WSL2 native statement, Phase 1 routing updated
- SYSTEM HARDENING ADDITIONS section added (4 rules: Global Authority Order, Determinism Enforcement, Partial Phase Recovery, Agent Responsibility Isolation)
- Rule count: 30 (unchanged). Phase count unchanged. Version bump: V23 → V25 ✅

**v25 → v26 — cross-alignment audit fixes + staging domain convention (V26):**
- AUDIT FIX: Phase 5 command count corrected in all embedded .clinerules copies (was "8", now "9" — pnpm audit added in V18 but embedded copies never updated)
- AUDIT FIX: Phase 4 stale "Run all 8 parts sequentially" in embedded .clinerules replaced with Rule 24 fresh-context per-Part instruction
- AUDIT FIX: .env.local stale references replaced with .env.dev in 3 Master Prompt locations (Phase 6 output, Phase 6.5 PORT_ALREADY_BOUND, README template) and 1 Presentation location
- AUDIT FIX: Phase 6.5 category count corrected — Quick Start said "14" (now 16), Feature Index header said "All 20" (now "All 16")
- AUDIT FIX: Deliverable set count updated from "6-file" to "7-file" — Post-Generation Security Checklist is now officially part of the deliverable set
- AUDIT FIX: "stage." normalized to "staging" in all templates (Planning Assistant, Presentation, Quick Start were inconsistent with Master Prompt)
- NEW: Staging domain convention — Phase 2 Section A now asks for production domain AND staging domain as two explicit questions. Agent writes both values to .env.staging, .env.prod, Komodo Scenario 32 env vars, CORS origins, and SMTP_FROM. No TLD/subdomain detection logic — human provides both URLs directly.
- Phase 3 .env.staging/.env.prod templates updated: NEXTAUTH_URL and SMTP_FROM now use ${staging_domain_from_product_md} and ${prod_domain_from_product_md} instead of hardcoded "yourdomain.com"
- Komodo Scenario 32 staging+prod env var templates updated with same domain variable pattern
- Planning Assistant: interview Step 7 adds prod+staging domain question, PRODUCT.md template updated, CORS template updated, Phase 2 Alignment Check updated
- Quick Start FIMS example corrected: stage.fims.powerbyte.app → staging-fims.powerbyte.app
- Rule count: 30 (unchanged). Scenario count: 32 (unchanged). Bootstrap: 18 steps (unchanged). Version bump: V25 → V26 ✅

**v26 → v27 — Komodo auto-update + Traefik reverse proxy (V27):**
- DEPLOYMENT MODEL CHANGE: Komodo staging Stack now uses auto_update: true — polls Docker Hub for newer :staging-latest digests. No webhook needed. Production uses manual deploy from Komodo UI (auto_update: false). Docker Hub is the handoff point between CI and deployment. GitHub Actions never contacts Komodo.
- docker-publish.yml: now pushes :staging-latest tag alongside :latest and :sha-{hash}. Two primary tags: :staging-latest (Komodo auto-update) and :latest (manual prod deploy). No webhook step in GitHub Actions.
- TRAEFIK REVERSE PROXY: Staging and prod app services now use Traefik labels for automatic HTTPS routing. App service no longer exposes host ports — Traefik routes traffic via Docker internal network. Dev compose unchanged (direct port mapping). Locked decision: TRAEFIK_NETWORK=proxy.
- Traefik labels on app service: traefik.enable, Host() router rule, websecure entrypoint, letsEncrypt certresolver, loadbalancer port=3000
- .env.staging/.env.prod: added TRAEFIK_NETWORK=proxy and APP_DOMAIN env vars
- .clinerules DOCKER COMPOSE RULES: added Traefik note for staging/prod vs dev distinction
- Bootstrap Step 18 Section 4: webhook fields 4b/4c/4d marked OPTIONAL (recommended auto-update model)
- CREDENTIALS.md template Komodo section: webhook fields marked OPTIONAL, Required? column added
- GitHub Actions Secrets table: 3 Komodo webhook secrets marked OPTIONAL
- Phase 3 pre-flight: Komodo webhook secrets grouped under OPTIONAL with note
- Phase 2 Section I: Komodo note updated to reflect V27 auto-update model
- Scenario 24: Step 3 rewritten — Option B is now Komodo auto-update (recommended), Option C is webhook (legacy)
- Scenario 32: FULL REWRITE — Part A credentials simplified (webhooks optional), Part B/C staging+prod compose files updated with Traefik labels + external network + no host ports on app, Part D replaced with V27 flow (D1-D3 auto-update + manual deploy, D4 optional webhook path preserved), Part E verification updated (app shows no host port, curl through Traefik), Part G added (Traefik reference with prerequisites and docs links)
- Scenario 30: staging note updated — :staging-latest tag also pushed by GitHub Actions
- Prompt versioning: V27 adoption step added (Traefik network + deployment model)
- Rule count: 30 (unchanged). Scenario count: 32 (unchanged). Bootstrap: 18 steps (unchanged). Version bump: V26 → V27 ✅
- XENDIT PAYMENT GATEWAY (V27 — framework default for SEA markets):
  Xendit is the default payment gateway for all apps that accept payments (conditional on payment.gateway: xendit in inputs.yml).
  Phase 2 Section G2 added — payment gateway interview questions (methods, recurring, refunds, multi-currency).
  Bootstrap Step 18 Section 4.5 added — collects 5 Xendit credentials (test secret, live secret, test public, live public, webhook token).
  CREDENTIALS.md template — dedicated Xendit section with all keys per environment.
  .env.dev/.env.staging/.env.prod templates — XENDIT_SECRET_KEY, XENDIT_PUBLIC_KEY, XENDIT_WEBHOOK_TOKEN (conditional).
  .env.example — Xendit placeholders with correct key format (xnd_development_*, xnd_public_development_*).
  SECURE CODE GENERATION — Xendit Webhook Security subsection added (6 rules: x-callback-token verification, idempotency, payload validation, endpoint security, key handling, queue recommendation).
  spec-driven-payments plugin updated — Xendit-first instead of Stripe-first.
  Third-party API key examples updated — Xendit has its own dedicated section in CREDENTIALS.md.
- CLOUDFLARE TURNSTILE BOT PROTECTION (V27 — framework default for all apps):
  Turnstile replaces CAPTCHA with invisible/managed challenges. Enabled by default on all public-facing forms. WCAG 2.2 AAA compliant.
  Phase 2 Section H adds Turnstile interview — protected pages, widget mode, hostname budget for SaaS.
  Bootstrap Step 18 Section 4.6 collects Site Key + Secret Key. Test keys pre-filled for dev.
  CREDENTIALS.md template — dedicated Turnstile section with test/live keys per environment.
  .env templates — NEXT_PUBLIC_TURNSTILE_SITE_KEY (public, client-safe) + TURNSTILE_SECRET_KEY (server-only).
  .env.example — test keys pre-filled with replacement note.
  SECURE CODE GENERATION — Turnstile Bot Protection subsection (6 rules): page protection strategy (login, register, password reset, contact, payment), FREE tier widget budget (1 widget/app, prod-only hostname — dev+staging use test keys for 0 hostname usage), client-side React (@marsidev/react-turnstile), server-side siteverify validation (mandatory — client alone provides no protection), dev+staging test keys, CSP updates (challenges.cloudflare.com in script-src + frame-src).
  Security headers (Phase 4 Part 3): CSP must include challenges.cloudflare.com when turnstile.enabled: true.

**v27 → v28 — security hardening: CSRF + SSRF + session invalidation + global rate limiting (V28):**
- SECURE CODE GENERATION: CSRF PROTECTION subsection added — documents why tRPC + SameSite=lax is inherently CSRF-resistant and requires no additional tokens. Route Handlers that mutate state MUST implement double-submit cookie or Origin validation. Webhook endpoints exempt (use signature verification).
- SECURE CODE GENERATION: SSRF PREVENTION subsection added — 4 rules: reject private IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16), use new URL() for parsing (never regex), resolve hostname before request (DNS rebinding prevention), sandbox user-provided URL fetches.
- SECURE CODE GENERATION: AUTH DEFAULTS item 6 added — session invalidation on role/tenant change via securityVersion field on User model, checked in Auth.js session callback. Covers: role change, tenant removal, account suspension, password change.
- SECURE CODE GENERATION: SECURE PRODUCTION DEFAULTS item 7 added — tiered global rate limiting: auth ≤10/min per IP, API ≤100/min per user, public ≤300/min per IP. All tRPC procedures must use appropriate tier — not just auth endpoints.
- STALE REF FIX: Quick Start copy commands referenced "v25" — fixed to "v28" in 3 locations (Bootstrap cp, Version Adoption cp, specstory specs path).
- STALE REF FIX: Security Checklist footer referenced "Master_Prompt_v26.md" — fixed to v28.
- STALE REF FIX: AI Tools Reference referenced "Post_Generation_Security_Checklist_v26.md" — fixed to v28.
- Security Checklist: item 9.8 added — non-auth rate limiting verification (moderate tier ≤100/min per user).
- Security Checklist: explicit total count added to header — 84 items across 13 sections.
- Presentation: "84 verification items" count now correct (was displayed as 84 in V27 but actual count was 83).
- Rule count: 30 (unchanged). Scenario count: 32 (unchanged). Bootstrap: 18 steps (unchanged). Security Checklist: 83 → 84 items. Version bump: V27 → V28 ✅

**v28 → v29 — shadcn/ui ecosystem enforcement (V29):**
- UI COMPONENT RULES section added — 10 mandatory rules enforcing shadcn/ui as the ONLY component library. Covers: components, charts (Recharts only), theming (CSS variables only), forms (React Hook Form + Zod), data tables (TanStack Table via shadcn), maps (Leaflet default, mapcn conditional), complex components (Kibo UI first), blocks, icons (lucide-react only), monorepo integration.
- Bootstrap Step 10: shadcn MCP server added to .vscode/mcp.json — agents search and install shadcn/ui components via natural language during Phase 4 and Phase 7.
- Phase 4 Part 5: shadcn/ui init step added before any UI generation — npx shadcn@latest init + base component install (button, card, dialog, input, label, select, textarea, toast, sonner). Conditional installs for chart, data-table, form, sidebar based on PRODUCT.md.
- Planning Assistant: Step 6 adds UI-specific questions (charts needed? maps needed? complex components?). PRODUCT.md template Tech Stack section expanded with UI ecosystem fields. Design Identity references shadcn/ui theming docs.
- AI Tools Reference: shadcn/ui URL appendix expanded (components, theming, charts, MCP, forms, registry, directory, monorepo, dark mode, llms.txt). Kibo UI, mapcn, awesome-shadcn-ui, shadcnregistry.com added as community registries.
- Feature Index: UI Ecosystem section added documenting the full shadcn/ui resource hierarchy.
- LOCKED LIBRARIES (MIT, free, open source only): shadcn/ui (core), Recharts (charts via shadcn), lucide-react (icons), Kibo UI (complex components), mapcn (maps conditional). EXCLUDED: MUI, Ant Design, Chakra, Chart.js, D3 (standard charts), heroicons, react-icons.
- Rule count: 30 (unchanged). Scenario count: 32 (unchanged). Bootstrap: 18 steps (unchanged). Security Checklist: 84 items (unchanged). Secure Code Gen: 16 sub-sections (was 14 — corrected count: V27 added Xendit+Turnstile, V28 added CSRF+SSRF). Version bump: V28 → V29 ✅

**v21 → v22 upgrade notes — Docker image build pipeline + COMMANDS.md:**
- docker-compose.app.yml (dev): now includes build: + image: keys — builds from source, tags locally for push
- docker-compose.app.yml (stage/prod): uses image: only — pulls from Docker Hub, never builds on server
- push.sh: NEW — manual image promotion: dev (build+test+push) → staging (re-tag+push) → prod (re-tag+push)
- start.sh: updated — dev environment passes --build flag to app service (always rebuilds from source)
- COMMANDS.md: NEW — master reference of all dev commands generated at project root
- inputs.yml docker section: NEW field dev_build: true
- Scenario 30: NEW — full pipeline walkthrough (dev build → staging → production → rollback)
- GitHub Actions docker-publish.yml: UNCHANGED — still auto-pushes :latest and :sha on push to main
- File ownership table: push.sh + COMMANDS.md added as AGENT-owned files
- Phase 4 Part 7: updated to generate push.sh + COMMANDS.md
- 29 rules unchanged. Scenario count: 29 → 30. Version bump: V21 → V22 ✅

**v20 → v21 upgrade notes — no fuzzy reasoning + edge case recovery:**
- Rule 29 added: No Fuzzy Reasoning — deterministic decision engine. Banned phrases: "seems like", "probably", "typically", "I assume", "usually", "most apps", "standard setup". Agent must ask — never guess.
- Rule 29 added to .clinerules as NO FUZZY REASONING — MANDATORY block
- Scenario 29 added: 5 edge case recovery procedures (mid-Part interruption, missing inputs.yml, existing branch, HIGH CVE no fix, STATE.md vs DECISIONS_LOG conflict)
- Phase 7 PRE-FLIGHT CHECK added: inputs.yml existence + schema validation + existing branch detection before every Feature Update
- MID-PART INTERRUPTION RECOVERY added to .clinerules PHASE 4 EXECUTION RULES
- Phase 5 CVE resolution decision tree: 3-step path for HIGH CVE with no fix → mitigation documented in DECISIONS_LOG
- STATE.md vs DECISIONS_LOG conflict resolution rule added to FRESH-START SAFETY
- Session banner: V21 bullets added. Phase menu: Edge Case entry added.
- 9 governance docs unchanged. No new phases. Version bump: V20 → V21 ✅

**v19 → v20 upgrade notes — determinism + MiniMax M2.5 reliability:**
- Rule 28 added: Global Instruction Priority Order — 8-level conflict resolution table in WHO YOU ARE
- CHANGE-01: Phase 4 contradiction fixed — .clinerules PHASE 4 EXECUTION RULES now says PART-BY-PART ONLY, superseding old "run all 8 sequentially" instruction
- CHANGE-02: Phase output contracts added to Phase 2.7, Phase 3, Phase 4 (per Part), Phase 5, Phase 7
- CHANGE-03: Governance self-check added to Phase 7 step 12 — agent self-verifies before squash-merge
- CHANGE-04: Global priority ladder injected into WHO YOU ARE section (above all rules)
- CHANGE-05: Secret hallucination guard added to Phase 3 credential generation (CRITICAL — MANDATORY EXECUTION block)
- CHANGE-05: Verification loop added to Phase 4 Parts (find command to confirm files exist)
- CHANGE-06: Phase 7 Step 11 linearized into 11a (TEST) → 11b (IMPLEMENT) → 11c (METADATA) → 11d (PERSISTENCE) → 11e (COMMIT)
- CHANGE-07: Four-type recovery model replaces old 3-attempt rule in .clinerules ERROR RECOVERY (TYPE 1/2/3/4 + 2-strike pivot)
- CHANGE-08: "Skip gracefully" → explicit IF/THEN/STOP in Rule 21; "skim rest" → keyword-matching instruction in Rule 4
- CHANGE-09: Instruction labels standardized to MANDATORY/CONDITIONAL/OPTIONAL across all .clinerules sections
- CHANGE-10: FILE OWNERSHIP ENFORCEMENT added to .clinerules — hard stop before writing HUMAN-owned files
- CHANGE-11: Rule 10 expanded with 5 high-risk inference domains (auth, tenancy, storage, compliance, DB isolation)
- CHANGE-12: FRESH-START SAFETY added to .clinerules BEFORE ANY ACTION section — STATE.md validation before every task
- CHANGE-13: STANDARD OUTPUT TYPES section added — 4 named formats (SUCCESS_OUTPUT, GAP_REPORT, HANDOFF_OUTPUT, PHASE_COMPLETE)
- CHANGE-14: Planning Assistant improved — Situation C detection, interview pacing, output gate, internal state tracking
- 9 governance docs unchanged

**v18 → v19 upgrade notes — skills architecture + spec integrity gate:**
- Rule 26 added: .github/skills/ as cross-agent standard skill location (Cline, Claude Code, Copilot, VS Code)
- Rule 26: SKILL.md format — name+description frontmatter required, 500-line limit, imperative numbered steps
- Rule 27 added: Plugin format — .claude-plugin/marketplace.json manifest, /plugin install command
- Rule 27: 4 framework-native domain packs: spec-driven-aws, spec-driven-payments, spec-driven-govt, spec-driven-erp
- Phase 2.7 added: Spec Stress-Test Gate — runs automatically after Phase 2.6 (or Phase 2.5 if 2.6 skipped)
- Phase 2.7: 4-category checklist: completeness, consistency, ambiguity, security/compliance
- Phase 2.7: blocks Phase 3 if gaps found — outputs SECTION/PROBLEM/FIX per gap — re-runnable
- Phase 2.7: disable via vibe_test.enabled: false in inputs.yml
- Phase 3: inputs.yml gets vibe_test section (enabled: true by default)
- Bootstrap Step 17 added: .github/skills/spec-driven-core/SKILL.md + .gitkeep + agent-log entry
- Bootstrap complete message: Step 7 added — domain pack discovery
- .clinerules: SKILLS CHECK block added — contextual loading, frontmatter-only read, no crash on missing SKILL.md
- Session banner: Rules 26+27 + Phase 2.7 added to active rules list
- Phase menu: Phase 2.7 entry added
- Phase 2.5: confirmation sequence updated to mention Phase 2.7
- Scenario 27 added: installing and using framework skill packs (methods, verification, custom skills, removal)
- Scenario 28 added: spec stress-test re-run mid-project (triggers, gap examples by category, what it does not catch)
- Tool Setup Guide: .github/skills/ section added
- File Ownership: .github/skills/ entries added
- MiniMax M2.5 replaces MiniMax M1 as default execution model across all references
- Deliverable set: 5 files (Master Prompt + Planning Assistant + Presentation HTML + Quick Start HTML + Feature Index)
- 9 governance docs unchanged

**v17 → v18 upgrade notes — security hardening defaults:**
- Phase 4 Part 5 updated: next.config.ts now includes 6 HTTP security headers (always-on, every route)
- Phase 4 Part 5 updated: src/server/lib/rate-limit.ts generated — in-memory LRU limiter, 4 pre-configured tiers
- Phase 4 Part 5 updated: src/server/lib/sanitize.ts generated — DOMPurify XSS sanitizer, 2 exported functions
- Phase 4 Part 5 updated: isomorphic-dompurify + lru-cache added to web app package.json dependencies
- Phase 4 Part 8 updated: ci.yml security job added — pnpm audit --audit-level=high blocks on HIGH/CRITICAL CVEs
- Phase 5 updated: 8 validation commands → 9 (pnpm audit --audit-level=high added as 9th)
- Scenario 26 added: security hardening reference — headers, rate limiting, XSS, dependency audit
- All 3 layers are always-on defaults — no PRODUCT.md flag needed, no opt-in required
- CSP in next.config.ts starts permissive (unsafe-inline allowed in dev) — tighten per Scenario 26 for prod
- Rate limiter uses in-memory LRU by default — upgrade to Redis store for multi-instance (Feature Update)
- 9 governance docs unchanged

**v16 → v17 upgrade notes — CREDENTIALS.md master credentials file:**
- Phase 3 updated: CREDENTIALS.md generated after env files — all credentials for all envs in one table
- Phase 3 gitignore block updated: CREDENTIALS.md added as mandatory gitignored file
- Phase 3 hard rules added: 6 absolute rules — STOP if not gitignored, never read into context, never in governance docs, git rm --cached if tracked
- Bootstrap Step 16 updated: CREDENTIALS.md added to initial gitignore
- .clinerules updated: ENV FILE RULES section — CREDENTIALS.md gitignore check + never-read-into-context rule
- File Ownership Reference updated: CREDENTIALS.md listed as AGENT/GITIGNORE
- Session banner updated: V17 CREDENTIALS.md bullet added
- 9 governance docs unchanged

**v15 → v16 upgrade notes — pgAdmin integrated database management:**
- Rule 22 updated: pgAdmin port offset added (base + 7 for dev, standard 5050 for staging/prod)
- Phase 3 updated: PGADMIN_EMAIL + PGADMIN_PASSWORD generated for all 3 environments
- Phase 3 secret generation rules updated: pgAdmin email pattern + 16-char password
- Phase 4 Part 7 updated: docker-compose.pgadmin.yml template added (all environments)
- Phase 4 Part 7 updated: pgadmin-servers.json pre-configured server registration file added
- Phase 4 Part 7 updated: start.sh now includes docker-compose.pgadmin.yml for all environments
- Phase 6.5: PGADMIN_UNREACHABLE triage category added (20th category)
- Scenario 25 added: pgAdmin access, credentials, common tasks, troubleshooting, credential rotation
- README.md template: pgAdmin URL added to Service URLs section
- pgAdmin uses Docker internal network hostname to connect to PostgreSQL — no localhost routing needed
- pgAdmin credentials are per-environment and separate from DB credentials
- 9 governance docs unchanged

**v14 → v15 upgrade notes — Docker Hub image pipeline:**
- Phase 2 Section I updated: Docker Hub publishing question added (hub_repo, image_name, publish flag)
- Phase 3 updated: inputs.yml docker section generated (publish, registry, hub_repo, image_name, platforms)
- Phase 3 updated: docker hub_repo + image_name locked in DECISIONS_LOG.md after Phase 3
- Phase 4 Part 5 updated: multi-stage Dockerfile generated per web app (conditional on docker.publish: true)
- Phase 4 Part 5 updated: .dockerignore generated alongside Dockerfile
- Phase 4 Part 5 updated: next.config.ts gets output: standalone
- Phase 4 Part 8 updated: docker-publish.yml GitHub Actions workflow generated (conditional)
- Phase 4 Part 8 updated: DECISIONS_LOG.md entry for Docker image publishing added
- Scenario 24 added: full Docker Hub pipeline + Komodo deployment walkthrough
- docker-compose.app.yml for staging/prod now pulls from Docker Hub (image: not build:)
- Rolling back via immutable sha-tagged images documented in Scenario 24
- 9 governance docs unchanged

**v13 → v14 upgrade notes — git strategy, fresh context, two-stage review:**
- Rule 23 added: branch-per-feature git strategy (feat/{slug}, scaffold/part-{N}, squash-merge)
- Rule 24 added: fresh context per Phase 4 Part — 8 separate task files replace 1 autorun file
- Rule 24 added: STATE.md as session-zero quick-read file — read before 9 governance docs
- Rule 25 added: two-stage code review (spec compliance → code quality) on every Feature Update
- TDD enforcement added to Rule 25: write failing test first, always. Deletes code without tests.
- Bootstrap Step 16 added: git init + STATE.md creation
- Bootstrap Step 4 updated: 8 part task files (phase4-part1.md through phase4-part8.md)
- Bootstrap Step 3 (.clinerules) updated: STATE.md read first (step 0), git rules added
- Bootstrap Step 12 updated: STATE.md + git/model DECISIONS_LOG entries
- Phase 2 Section I updated: git strategy + model routing questions added
- Phase 3 updated: inputs.yml git section + models section generated
- Phase 4 header updated: fresh-context Part-by-Part approach documented
- Phase 7 updated: git branch creation (step 8), TDD step, two-stage review (step 10), squash-merge (step 13) — steps renumbered 1→16
- Phase 8 updated: adaptive replanning block after every batch
- Scenario 22 added: git branching + two-stage review walkthrough
- Scenario 23 added: fresh context session management for Phase 4
- MiniMax M2.5 replaces MiniMax M1 as default execution model (upgraded free tier, Cline via OpenRouter)
- Model routing formalised in inputs.yml: planning/execution/governance assignments
- Stuck detection hardened: output-artifact verification added (not just error-absence check)
- Adaptive replanning: Phase 8 roadmap reassessment after each batch

**v12 → v13 upgrade notes — devcontainer + WSL2 fixes:**
- Devcontainer postCreateCommand: `corepack enable` replaced with `npm install -g pnpm` — avoids EACCES symlink permission error with non-root node user in WSL2
- docker-outside-of-docker devcontainer feature explicitly banned — WSL2 + Docker Desktop incompatible; use socket bind-mount instead
- /home/node directory creation added to Dockerfile as required step
- Bootstrap Step 5 pre-seeds lessons.md with this devcontainer gotcha to prevent repeat failures
- Phase 6.5: POSTCREATECMD_EACCES, DOCKER_OUTSIDE_OF_DOCKER_INCOMPATIBLE, HOME_DIR_PERMISSION triage categories added
- Rule 8 updated: WSL2 compatibility rules baked in as permanent reminders
- MODE A (WSL2 native) added as default dev environment — devcontainer (MODE B) now optional
- Phase 1 rewritten: MODE A recommended for solo Windows developers
- Rule 22 split: Part A = unique random ports (all modes), Part B = DinD (MODE B only)
- All devcontainer refs across 88 locations audited and qualified as MODE A or MODE B

**v12 → v13 upgrade notes — new features:**
- code-review-graph added as structural blast-radius MCP layer (dev machine only — not staging/production)
- Phase 7 step 2 extended: Claude Code runs get_impact_radius_tool before implementing any Feature Update
- How To Use rebuilt as full launch sequence with embedded Planning Assistant + Master Prompt prompts
- Tool Setup Guide: code-review-graph entry added
- Bootstrap agent-log.md now includes code-review-graph post-Phase-4 instructions
- All current version references updated from V12 to V13
- 9 governance docs unchanged from V12
- Rule 22 added: unique random ports per project + Docker-in-Docker for devcontainer (MODE B dev/test only)
- Phase 6 rewritten: MODE A runs from WSL2 terminal, MODE B runs from devcontainer via DinD
- Phase 3 extended: generates non-standard port assignments into inputs.yml + .env.example
- Devcontainer Dockerfile: Docker CLI + socket mount added for MODE B DinD support
- Phase 6.5: DOCKER_SOCKET_PERMISSION + PORT_ALREADY_BOUND triage categories added

**v11 → v12 upgrade notes:**
- Rule 21 added: design-system/MASTER.md as UI governance artifact (optional, graceful degradation)
- Section K (Design Identity) added to PRODUCT.md as optional section
- Phase 2.6 added: automated design system generation (auto after Phase 2.5 "confirmed")
- Phase 0 Bootstrap: design-system/pages/ folder added to Step 1, Step 14 skill check added
- Phase 3: conditional MASTER.md entry in .claude/settings.json (only if file exists)
- Phase 4 Part 7: MERGE instruction added for .socraticodecontextartifacts.json
- Phase 7 step 1b added: conditional design system read before UI-touching features only
- Phase 6.5: DESIGN_SYSTEM_MISSING triage category added (14th)
- Phase 2 interview: Section K questions added (skip if not in PRODUCT.md)
- File Ownership: design-system/MASTER.md + design-system/pages/*.md entries added
- Scenario 20 added: UI UX Pro Max setup, generation, page overrides, graceful degradation
- Session banner: Rule 21 bullet + Phase 2.6 menu entry added
- Tool Setup Guide: UI UX Pro Max entry added
- 9 governance docs unchanged — MASTER.md is a SocratiCode context artifact, not a session doc
- All V11 content preserved exactly — nothing removed
- Graceful degradation: entire V12 UI feature is opt-in — V11 behavior preserved if skill absent
- Log Lesson command added: scripts/log-lesson.sh + .vscode/tasks.json written by Bootstrap Step 15
- Human can now log personal discoveries to lessons.md in Rule 18 typed format without waiting for agent
- README.md template: Log Lesson command added under Governance Tools

**v10 → v11 upgrade notes (preserved for reference):**
- Rule 18 added: structured typed lessons.md format (🔴/🟡/🟤/⚖️/🟢)
- Rule 19 added: SpecStory elevated to Passive Change Capture Layer
- Rule 20 added: `<private>` tag support in PRODUCT.md
- Rule 3/15 updated: attribution expanded (COPILOT | HUMAN | UNKNOWN), non-blocking writes
- Rule 4 updated: lessons.md read order — 🔴 first, 🟤 second, rest by relevance
- Phase 0 Bootstrap: writes .specstory/config.json and typed lessons.md template
- Phase 7 step 6 added: Rule 20 private tag strip before processing
- Phase 7 step 9 updated: governance writes explicitly non-blocking
- Governance Sync updated: reads .specstory/history/ for attribution reconciliation
- Phase 6.5: PRIVATE_TAG_LEAKED triage category added
- Scenario 17 added: SpecStory unattributed diff reconciliation
- Scenario 18 added: Copilot attribution and governance workflow
- Tool Setup Guide: SpecStory elevated from "with Copilot" to its own dedicated entry
- File Ownership: .specstory/** entries added
- Governance Retro: unattributed SpecStory diffs count added to health metrics
- README.md template: SpecStory section added
- All V10 content preserved exactly — nothing removed

---

---

---

## FILE DELIVERY RULES

When via Claude.ai or Copilot: deliver downloadable ZIP per phase with `MANIFEST.txt`.
Phase 7: delta ZIP with `DELTA_MANIFEST.txt` (added/modified/deleted per file).
When via Claude Code: files written directly to workspace. No ZIP needed. (Cline deprecated V31.)

---


---

## FULL RULE DETAILS (reference — compact versions are in CLAUDE.md)

## GLOBAL RULES

### Rule 1 — PRODUCT.md is the sole source of truth

`docs/PRODUCT.md` is the one and only file a human should ever touch.
All feature descriptions, architecture decisions, and workflow descriptions live here.
If the user wants to add a feature, change a flow, add a module, or remove anything —
they edit PRODUCT.md first. The agent propagates every change to all other files.

### Rule 2 — Agents own the spec files

`inputs.yml` and `inputs.schema.json` are generated and maintained exclusively
by agents. Humans never edit these files. They are always regenerated from PRODUCT.md.

### Rule 3 — Log every change with agent attribution

Every change must update:
- `docs/CHANGELOG_AI.md` — include which agent made the change
- `docs/DECISIONS_LOG.md` — only when an architectural decision was made or changed
- `docs/IMPLEMENTATION_MAP.md` — rewritten to reflect current state after every change

**Agent attribution values (detection priority order):**
```
CLAUDE_CODE  → self-reported: Claude Code writes its own entries. (Cline deprecated V31; .clinerules still generated by Bootstrap but unused.)
COPILOT      → inferred: SpecStory diff present, no Claude Code session active
HUMAN        → inferred: SpecStory diff present, no agent session active, manual edit
UNKNOWN      → SpecStory diff exists but source cannot be determined
```

**Governance writes are non-blocking.** Never hold up implementation waiting for a
CHANGELOG_AI or agent-log write. Append governance docs after the implementation step,
not before or during.

### Rule 4 — Read all 9 context documents before changing anything

**MANDATORY SEQUENCE — DO NOT SKIP, DO NOT REORDER, DO NOT PROCEED UNTIL COMPLETE:**

Read these 9 files in this exact order before taking ANY action:

1. `.cline/memory/lessons.md` — READ FIRST. Read ALL 🔴 gotcha entries in full. Then ALL 🟤 decision entries in full. For remaining entries: read ONLY entries whose title contains a keyword matching the current task domain. Skip all others.
2. `docs/PRODUCT.md` — the feature specification
3. `inputs.yml` — the locked tech stack and app spec
4. `inputs.schema.json` — validation schema
5. `docs/CHANGELOG_AI.md` — what has already been done and by whom
6. `docs/DECISIONS_LOG.md` — locked decisions. Never re-ask about anything listed here.
7. `docs/IMPLEMENTATION_MAP.md` — current build state
8. `project.memory.md` — active rules and agent stack
9. `.cline/memory/agent-log.md` — running log of every agent action

**Rule: Do not write a single line of code until all 9 files are read.**
**Rule: If any file does not exist yet — note it as missing and continue reading the rest.**
**Rule: If DECISIONS_LOG.md contains the answer to a question — do not ask it again.**

When running via Copilot or Claude Code: attach all 9 docs before sending any message.

### Rule 5 — Compose-first, AWS-ready by default

Docker Compose is the default for dev, stage, and prod.
Infrastructure is split into **separate compose files per service group**.

```
deploy/compose/[env]/
  docker-compose.db.yml       — PostgreSQL + PgBouncer      → Amazon RDS
  docker-compose.storage.yml  — MinIO (S3-compatible)       → Amazon S3
  docker-compose.cache.yml    — Valkey (cache + BullMQ)     → Amazon ElastiCache
  docker-compose.infra.yml    — MailHog dev / SMTP relay    → Amazon SES
  docker-compose.app.yml      — Next.js app(s) + worker(s)  → ECS / EC2
  .env
```

`docker-compose.db.yml` always starts first — it creates the shared Docker network.
All other compose files reference it as `external: true`.

```yaml
networks:
  app_network:
    name: ${COMPOSE_PROJECT_NAME}_network
    driver: bridge
```

One-command startup: `bash deploy/compose/start.sh dev up -d`

**Dev/Test — Docker command location:**
MODE A (WSL2 native — the only supported dev environment):
  All `docker compose` commands run from the WSL2 Ubuntu terminal directly.
  Docker Desktop socket is available natively in WSL2. No DinD needed.
Staging and production: standard Docker on host or CI.

**Dev/Test — Non-standard ports to avoid conflicts:**
All dev services use non-standard ports (not 5432, 6379, 3000, 9000, 8025, 9090, etc.)
to prevent conflicts with other services already running on the developer machine.
Port assignments are generated during Phase 3 and locked in inputs.yml + .env.example.
Staging and production use standard ports. AWS migration = zero port changes in source code.

AWS migration = stop one compose service + update `.env` + restart app. Zero code changes.

### Rule 6 — K8s scaffold is inactive by default

K8s only activates when `deploy.k8s.enabled: true` is set in `inputs.yml`.

### Rule 7 — Multi-tenant database strategy and security stack

Tenancy is controlled by `tenancy.mode: single | multi` in `inputs.yml`.

#### 7A — Always shared schema + tenant_id

One database, one schema, tenant isolation via `tenant_id` column.
Never separate databases or schemas per tenant.
Exception: modules handling payroll, banking, or medical data MAY use a separate PostgreSQL schema per tenant — but ONLY when explicitly declared in PRODUCT.md AND confirmed during Phase 2.7 stress-test. This exception must be written to DECISIONS_LOG.md before Phase 3. If not declared in PRODUCT.md, Claude Code MUST use shared schema — no exceptions, no guessing.

#### 7B — Single-tenant scaffold

Even in single mode, ALL entities get `tenantId` as a nullable UUID field
and RLS policies written as SQL comments (not yet active).

Security layers — always active vs deferred in single mode:
```
L1 — tRPC tenantId scoping    DEFERRED   (only meaningful with 2+ tenants)
L2 — PostgreSQL RLS           DEFERRED   (written as comments, enabled on upgrade)
L3 — RBAC middleware          ACTIVE     (prevents privilege escalation in any app)
L4 — PgBouncer pool limits    DEFERRED   (only meaningful with 2+ tenants)
L5 — Immutable AuditLog       ACTIVE     (every mutation logged — privacy + traceability)
L6 — Prisma query guardrails  ACTIVE     (prevents developer mistakes from leaking data)
```

L3, L5, L6 are always active — single or multi. Upgrading to multi only activates
L1, L2, L4 which are already scaffolded but dormant. No new columns, no table rewrites.

Prisma pattern (single mode):
```prisma
model Entity {
  id        String   @id @default(cuid())
  // DO NOT REMOVE — enables zero-migration upgrade to multi-tenant
  tenantId  String?  @map("tenant_id")
  tenant    Tenant?  @relation(fields: [tenantId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([tenantId])
}
```

#### 7C — Multi-tenant scaffold

When `tenancy.mode: multi`:
- `tenantId` is NOT NULL on every entity
- RLS policies enabled (not commented)
- All 6 security layers fully wired (L1–L6)
- JWT always includes `{ userId, tenantId, roles[] }`

Prisma pattern (multi mode):
```prisma
model Entity {
  id       String @id @default(cuid())
  tenantId String @map("tenant_id")   // NOT NULL in multi mode
  tenant   Tenant @relation(fields: [tenantId], references: [id])
  // ... entity fields
  @@index([tenantId])
}
```

Tenant table always scaffolded (single and multi):
```prisma
model Tenant {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique  // used for subdirectory or subdomain routing
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```
In single mode: one Tenant row seeded in the seed script.
In multi mode: Tenant rows created via admin onboarding flow.

#### 7D — Upgrade path: single → multi

Trigger: change `tenancy.mode` in PRODUCT.md → run Feature Update.
⚠️ Run data migration BEFORE schema migration — otherwise NOT NULL fails on existing rows.

#### 7E — All 6 security layers (multi mode — all required)

```
L1 — App layer       tRPC queries scoped by tenantId from session
L2 — DB layer        PostgreSQL RLS with SET LOCAL app.current_tenant_id
L3 — RBAC            Role checked before any resolver runs
L4 — Pool limits     Per-tenant connection limits via PgBouncer
L5 — Audit           Immutable AuditLog on every mutation
L6 — Guardrails      Prisma extension ($allOperations) auto-injects tenantId on every query
```

### Rule 8 — WSL2 native is the only supported dev environment (V25)

This system uses **MODE A (WSL2 native) exclusively**. There is no MODE B. There is no devcontainer.

**Why:** Devcontainer on WSL2 + Docker Desktop adds 4 layers of virtualisation (Windows → WSL2 → Docker Desktop → devcontainer). Every layer is a source of permission errors, EACCES failures, shell server crashes, and socket mount failures. MODE A eliminates all of this.

**What this means for every agent:**
- Do NOT scaffold `.devcontainer/` — skip the folder entirely
- Do NOT generate `devcontainer.json` or `.devcontainer/Dockerfile`
- Do NOT reference DinD (Docker-in-Docker) — not needed in WSL2 native
- All `docker compose` commands run from the WSL2 Ubuntu terminal directly
- Docker Desktop provides the Docker socket to WSL2 natively — no socket mounts needed

**Dev setup (one-time in WSL2 Ubuntu terminal):**
```bash
nvm install 22 && nvm use 22
npm install -g pnpm
```
Open project in VS Code with Remote-WSL extension. That is the entire setup.

### Rule 9 — Bidirectional governance

Direction A: PRODUCT.md changes → must update inputs.yml + schema + changelog + map.
Direction B: inputs.yml changes → PRODUCT.md must justify it.
Violation → REFUSE and cite Rule 9. Enforced by `tools/check-product-sync.mjs`.

### Rule 10 — Never infer missing information

Any required PRODUCT.md section blank or "TBD" → list what is missing → REFUSE to proceed.

**MANDATORY — never infer these domains, even when the answer seems obvious:**
```
Auth strategy        → always ask, even if the app type seems standard
Tenancy mode         → always ask, even if only one client is mentioned
File storage need    → always ask, even if uploads are implied by the domain
Compliance flag      → always ask (GDPR/DICT/PCI — never assume based on industry)
DB isolation         → always ask (payroll/banking/medical — never assume "probably needed")
```
For each: if not declared in PRODUCT.md or DECISIONS_LOG.md → ask explicitly → block output until answered.

### Rule 11 — Feature removal requires full cleanup

Removal from PRODUCT.md → delete source files + down-migration + log + map update + user confirmation.

### Rule 12 — TypeScript everywhere, always

`"strict": true` in every tsconfig. No `any` types. Typed env vars, DB results, API contracts.
Tools in `tools/` may use `.mjs` — the only exception.

### Rule 13 — Multi-app monorepo support

All apps in `inputs.yml apps:` list. Mobile apps NEVER access DB directly — API only.

### Rule 14 — OSS-first stack by default

Default: Valkey+BullMQ (MIT fork of Redis), Auth.js (MIT), Keycloak (Apache 2.0), MinIO (AGPL).
Avoid Clerk by default (proprietary, per-user fees).
Non-OSS choice: accept, note tradeoff, document in DECISIONS_LOG.md.

### Rule 15 — Agent attribution in every CHANGELOG_AI.md entry

```markdown
## YYYY-MM-DD — [Phase or Feature Name]
- Agent:               CLAUDE_CODE | COPILOT | HUMAN | UNKNOWN
- Why:                 reason for the change
- Files added:         list or "none"
- Files modified:      list or "none"
- Files deleted:       list or "none"
- Schema/migrations:   list or "none"
- Errors encountered:  list or "none"
- Errors resolved:     how each was fixed, or "none"
```

Attribution detection priority: CLAUDE_CODE (self-reported) → COPILOT (inferred from SpecStory,
no agent session) → HUMAN (inferred, manual edit) → UNKNOWN (SpecStory diff, source unclear).
(Cline deprecated V31 — no longer part of active attribution chain.) See Rule 3 for full detection logic.

### Rule 16 — Visual QA after every Phase 6 and major Phase 7

After Docker services are healthy, Claude Code runs a browser QA pass against the app URL using the Playwright-based browser tool.
URL is: `http://localhost:${APP_PORT}` where APP_PORT comes from inputs.yml (e.g. `apps[0].port`) — never hardcoded.
Example: if ports.dev.app = 43827 then QA runs against http://localhost:43827

**Minimum checks every time:**
- App loads without 5xx errors
- Login page renders and is interactive
- No console errors on the main landing page
- Auth flow: login → redirect to dashboard completes without error
- Health endpoint: `GET /api/health` returns 200

**Extended checks after Phase 7 feature updates:**
- Every page touched by the feature update loads correctly
- No new console errors introduced
- Any new form renders and accepts input
- API endpoints added by the feature return expected responses

If a check fails: Claude Code logs the failure to `.cline/memory/lessons.md` (typed as 🔴 gotcha),
attempts one auto-fix, and retries. If still failing after retry → writes
a handoff file in `.cline/handoffs/` describing the visual failure.

### Rule 17 — Search before reading (SocratiCode — V10)

When exploring the codebase — finding where a feature lives, understanding a
module, tracing a data flow — always use `codebase_search` BEFORE opening files.

**Mandatory search-first workflow:**
```
1. codebase_search { query: "conceptual description" }
   → returns ranked snippets from across the entire codebase in milliseconds
   → 61% less context consumed vs grep-based file reading

2. codebase_graph_query { filePath: "src/..." }
   → see what a file imports and what depends on it BEFORE reading it

3. Read files ONLY after search results point to 1–3 specific files
   → never open files speculatively to find out if they're relevant

4. For exact symbol/string lookups: grep is still faster — use it
   → use codebase_search for conceptual/natural-language queries
   → use grep for exact identifiers, error strings, regex patterns
```

**When to use each SocratiCode tool:**
```
codebase_search         → "how is auth handled", "where is rate limiting", "find payment flow"
codebase_graph_query    → see imports + dependents before diving into a file
codebase_graph_circular → when debugging unexpected behavior (circular deps cause subtle bugs)
codebase_context_search → find database schemas, API specs, infra configs by natural language
codebase_status         → check index is up to date (run after large refactors)
```

**SocratiCode is a system-level MCP service — not a project dependency:**
- Install once: add `"socraticode": { "command": "npx", "args": ["-y", "socraticode"] }` to MCP settings
- Bootstrap (Phase 0) writes `.vscode/mcp.json` with this entry automatically
- Phase 4 Part 7 writes `.socraticodecontextartifacts.json` pointing at Prisma schema + docs
- Phase 7 runs `codebase_update` after every implementation to keep index live
- Requires Docker running (manages its own Qdrant + Ollama containers)

### Rule 18 — Structured lessons.md with typed entries (NEW V11)

Every entry in `.cline/memory/lessons.md` must use one of these 5 types:

```
🔴 gotcha          — critical edge case, pitfall, or blocker. ALWAYS read first.
🟡 fix             — bug fix or problem-solution pair
🟤 decision        — locked architectural or design decision. Read before any major change.
⚖️ trade-off       — deliberate compromise with known downsides
🟢 change          — code or architecture change worth remembering
```

**Entry format (mandatory):**
```markdown
## YYYY-MM-DD — [TYPE ICON] [Short title]
- Type:       🔴 gotcha | 🟡 fix | 🟤 decision | ⚖️ trade-off | 🟢 change
- Phase:      [Phase or Feature where this occurred]
- Files:      [affected files, or "none"]
- Concepts:   [keywords: auth, migration, docker, prisma, etc.]
- Narrative:  [What happened. What the fix or decision was. Why it matters.]
```

**Read order at Phase 7 start (Rule 4 priority):**
1. All 🔴 gotcha entries — read every time, no exceptions
2. All 🟤 decision entries — read before any feature touching that domain
3. Remaining entries — skim for relevance to current feature

**Bootstrap writes a structured template with this format.**
**Claude Code writes a new entry in this format after every error resolved, every locked decision made.**
**Never write free-form text to lessons.md — always use the typed entry format.**

### Rule 19 — SpecStory is the passive change capture layer (NEW V11)

SpecStory is not just autocomplete fallback. It is the **unified change capture system**
that bridges attribution gaps between all agents and manual edits.

**What SpecStory captures automatically (zero config):**
- Every Claude Code session conversation → `.specstory/history/YYYY-MM-DD_HH-mm_[session].md`
- Every Claude Code session conversation → `.specstory/history/`
- Every file change regardless of which agent or human made it → git-tracked diff

**How this powers Governance Sync (Rule 19 + Scenario 17):**
When Governance Sync runs, it reads `.specstory/history/` for diffs not already attributed
in `CHANGELOG_AI.md`. It then:
1. Matches diffs to active agent sessions (Claude Code log entries; Cline deprecated V31)
2. If no session match → infers COPILOT (if Copilot was active) or HUMAN (manual edit)
3. Writes reconciliation entry to CHANGELOG_AI.md with correct attribution

**Bootstrap writes `.specstory/specs/v31-master-prompt.md`** — copy of the master prompt
that SpecStory uses for automatic context injection into every session.

**SpecStory config written by Bootstrap:**
```json
// .specstory/config.json
{
  "captureHistory": true,
  "historyDir": ".specstory/history",
  "specsDir": ".specstory/specs",
  "autoInjectSpec": "v31-master-prompt.md"
}
```

**Never delete `.specstory/history/` contents.** This is the passive audit trail of
everything every agent and human has done. Treat it as append-only.

### Rule 20 — Private tag support in PRODUCT.md (NEW V11)

Content wrapped in `<private>...</private>` tags in `docs/PRODUCT.md` is **sensitive**
and must never be stored in, propagated to, or referenced in any governance document,
changelog, agent-log, lessons file, or generated source file.

**What this protects:**
- Business logic that should not appear in agent logs
- Commercial terms, pricing strategies, client names
- Security configurations that should not be committed
- Any content Bonito marks as confidential

**Agent behavior:**
```
When reading PRODUCT.md:
  Strip <private>...</private> blocks before processing
  Treat the stripped content as if it does not exist
  Never include private content in inputs.yml, CHANGELOG_AI, or any generated file
  Never summarize, reference, or paraphrase private content in governance docs

When outputting PRODUCT.md (Planning Assistant):
  Preserve <private> tags exactly as written — never remove or alter them
  The tags are owned by the human author
```

**Private tags are validated at Phase 5:**
`tools/check-product-sync.mjs` flags any governance doc that contains text
matching patterns inside `<private>` blocks. This is a CI gate — it will fail the build.


### Rule 21 — Design system as a UI governance artifact (NEW V12)

`design-system/MASTER.md` is generated during Phase 2.6 using the
**UI UX Pro Max** skill and governs all visual decisions — colors, typography,
spacing, layout patterns, and UI anti-patterns — for every Feature Update.

**Agent behavior:**
```
When generating UI components, pages, or any visual output:
  1. Check if design-system/MASTER.md exists
  2. If YES → read it before opening any component or page files
     If design-system/pages/[page].md also exists → that file overrides
     MASTER.md for that specific page only
  3. Never choose arbitrary colors, fonts, or layout patterns —
     derive all visual decisions from MASTER.md
  4. If a Feature Update deviates from MASTER.md (e.g. the product owner
     explicitly requested something different) → log as ⚖️ trade-off in lessons.md
  5. If design-system/MASTER.md does NOT exist → continue immediately. Use shadcn/ui defaults. Do not output any warning. Do not block the task.
```

**MASTER.md is agent-owned:**
- Human never edits design-system/MASTER.md directly
- To change the design system: update the Design Identity section in PRODUCT.md
  then say "Feature Update" → Claude Code regenerates MASTER.md automatically
- design-system/pages/*.md follow the same rule — agent-owned, never edit manually

**MASTER.md is a SocratiCode context artifact — not a governance session doc:**
- It lives in `.socraticodecontextartifacts.json` (5th entry, added by Phase 2.6)
- Accessible via `codebase_context_search` — Claude Code searches it like the Prisma schema
- It is NOT added to the Rule 4 mandatory 9-doc read list
- The 9 governance docs remain unchanged from V12

**Graceful degradation — this rule is fully optional:**
- If UI UX Pro Max skill is not installed → Phase 2.6 skips, no MASTER.md is created
- Framework builds exactly as V12 — no errors, no blocked phases, no warnings
- Install the skill and run Phase 2.6 any time to activate design intelligence

### Rule 22 — Unique random dev ports + container naming per project (NEW V13)

Every project gets its own randomly generated port set AND unique container identity during Phase 3.
This prevents port conflicts AND container name conflicts when multiple projects run simultaneously.
Never use the same port set for two projects. Never use standard default ports in dev.

**Port generation algorithm (Phase 3):**
```
For each service, pick a random base in range 40000–49999, add service offset:
  base = random integer from 40000 to 49999 (unique per project, generated once)

  PostgreSQL:    base + 0    (e.g. base=42731 → 42731)
  PgBouncer:     base + 1    (e.g. 42732)
  Valkey:        base + 2    (e.g. 42733)
  MinIO API:     base + 3    (e.g. 42734)
  MinIO Console: base + 4    (e.g. 42735)
  MailHog SMTP:  base + 5    (e.g. 42736)
  MailHog UI:    base + 6    (e.g. 42737)
  pgAdmin:       base + 7    (e.g. 42738)
  App (Next.js): base + 10   (e.g. 42741)
  Worker:        base + 11   (e.g. 42742)
  Prisma Studio: base + 20   (e.g. 42751)
  Admin app:     base + 12   (e.g. 42743, if declared)
```
Stored in `inputs.yml` under `ports.dev.*` and written to `.env.dev` and `.env.example`.
All source files read ports from env vars — never hardcode any port number.
Staging and production use standard ports — zero code changes when migrating.

**Container naming — every project gets a unique Docker identity (Phase 3):**

Docker uses the folder name as the default Compose project name. If two projects share a
similar folder name, their containers and networks collide. This is prevented by:

1. Setting `COMPOSE_PROJECT_NAME` in every env file:
   ```
   COMPOSE_PROJECT_NAME=${app_slug}_${env}
   # e.g. myapp_dev, myapp_staging, myapp_prod
   ```
   This makes Docker group ALL containers for this project under one named group:
   `myapp_dev` — visible in `docker ps` and Docker Desktop as a clean project group.

2. Setting explicit `container_name` on every service in every compose file:
   ```
   container_name: ${COMPOSE_PROJECT_NAME}_postgres
   container_name: ${COMPOSE_PROJECT_NAME}_valkey
   container_name: ${COMPOSE_PROJECT_NAME}_minio
   container_name: ${COMPOSE_PROJECT_NAME}_pgbouncer
   container_name: ${COMPOSE_PROJECT_NAME}_app
   container_name: ${COMPOSE_PROJECT_NAME}_worker
   container_name: ${COMPOSE_PROJECT_NAME}_mailhog   # dev only
   ```
   Result example for myapp in dev: `myapp_dev_postgres`, `myapp_dev_valkey`, `myapp_dev_minio`
   Result example for otherapp in dev: `otherapp_dev_postgres`, `otherapp_dev_valkey`
   No two projects ever share a container name — even if they run the same services.

3. Networks are also project-scoped:
   ```
   name: ${COMPOSE_PROJECT_NAME}_network
   # e.g. myapp_dev_network, myapp_staging_network
   ```

4. Volumes are also project-scoped (already defined in Phase 4 Part 7):
   ```
   name: ${COMPOSE_PROJECT_NAME}_postgres_data
   name: ${COMPOSE_PROJECT_NAME}_valkey_data
   name: ${COMPOSE_PROJECT_NAME}_minio_data
   ```

**Staging and production:** Use the same naming convention with their own env:
`myapp_staging_postgres`, `myapp_prod_postgres` — no conflicts even if staging and prod
run on the same server (though that is not recommended).

**AWS migration:** stop compose service → update `.env` → restart. Zero port changes in code.


### Rule 23 — Git branching strategy (NEW V14)

Every project uses branch-per-feature git with squash merge. This replaces the previous no-strategy default.

**Branch naming convention (locked in inputs.yml as `git.branch_pattern`):**
```
Feature branches:  feat/[feature-slug]           e.g. feat/user-auth
Phase 4 branches:  scaffold/part-[N]             e.g. scaffold/part-3
Fix branches:      fix/[issue-slug]              e.g. fix/login-redirect
```

**Phase 3 generates into inputs.yml:**
```yaml
git:
  default_branch: main
  branch_pattern: feat/{slug}
  commit_style: conventional  # feat:, fix:, chore:, docs:
  squash_merge: true
```

**Rules — every agent follows these without exception:**
1. NEVER commit directly to main. Always branch first.
2. Phase 4: each Part gets its own branch (`scaffold/part-1` through `scaffold/part-8`). Squash-merge each Part to main after Phase 5 passes for that Part.
3. Feature Updates (Phase 7): create `feat/[slug]` before any file change. Squash-merge after two-stage review passes (Rule 25).
4. Commit messages use conventional format: `feat(module): description` — never vague messages like "update" or "changes".
5. After squash-merge: delete the feature branch. Keep main clean.
6. Bootstrap Step 16 (NEW V14): Claude Code runs `git init && git checkout -b main` if no git repo exists, and writes `.gitignore` with standard entries.

**Git worktree for isolation (optional but recommended for Phase 4):**
If `git.use_worktrees: true` in inputs.yml, Claude Code creates a worktree per Part:
```bash
git worktree add .worktrees/part-1 -b scaffold/part-1
# work in .worktrees/part-1 — isolated from other parts
git worktree remove .worktrees/part-1   # after merge
```
This prevents Part N's incomplete scaffold from breaking Part N+1's validation.


### Rule 24 — Fresh context per Phase 4 Part + STATE.md (NEW V14)

**The context accumulation problem:** When Claude Code runs all 8 Phase 4 Parts in one continuous session, early scaffold decisions bleed into later ones, quality degrades across the session, and errors in Part 3 corrupt Parts 4–8. V14 solves this by treating each Part as an independent task.

**STATE.md — the quick-read session file (NEW V14):**
Bootstrap Step 16 creates `.cline/STATE.md`. Every agent reads this FIRST (before the 9 governance docs) to orient instantly.

STATE.md format (Claude Code rewrites after every task):
```
# Project State — [App Name]
# Auto-generated. Never edit manually.
# Updated: [timestamp] by [AGENT]

PHASE:        [current phase, e.g. "Phase 4 Part 3 of 8"]
              Add "PARTIAL" suffix if session interrupted mid-Part — e.g. "Phase 4 Part 3 PARTIAL"
              PARTIAL flag triggers TYPE 2 recovery on next session start (FRESH-START SAFETY)
LAST_DONE:    [one sentence — what just completed]
NEXT:         [one sentence — what runs next]
BLOCKERS:     [any known blockers, or "none"]
GIT_BRANCH:   [current branch name]
PORTS:        APP=[port] DB=[port] CACHE=[port]
MODELS:
  planning:   [model name]
  execution:  [model name — default Claude Sonnet 4.6 via Claude Code (V31 primary; Cline deprecated)]
  governance: [model name — cheapest available]
```

**MANDATORY: Read STATE.md before the 9 docs. It answers "where am I?" in one file.**
**MANDATORY: Rewrite STATE.md after every completed task — non-blocking, append after implementation.**
**MANDATORY: If STATE.md does not exist yet → create it during Bootstrap Step 16.**

**Fresh context for Phase 4 Parts:**
Each Part runs as a separate Claude Code task invocation. Bootstrap Step 4 generates 8 task files (not 1):
```
.cline/tasks/
  phase4-part1.md    ← scaffold/part-1 branch
  phase4-part2.md    ← scaffold/part-2 branch
  ...
  phase4-part8.md    ← scaffold/part-8 branch
```
Each task file contains: the Part instructions, the current STATE.md content (pre-inlined), and exactly the governance docs that Part needs — not all 9.

**Per-Part context injection (what each task file pre-inlines):**
```
Part 1 (root config):    inputs.yml + PRODUCT.md only
Part 2 (shared/api):     inputs.yml + Part 1 summary
Part 3 (packages/db):    inputs.yml + PRODUCT.md (entities section) + Part 1-2 summaries
Part 4-6 (apps):         inputs.yml + DECISIONS_LOG.md + Part 1-3 summaries
Part 7 (deploy/tools):   inputs.yml + all prior summaries
Part 8 (CI/governance):  all 9 docs + IMPLEMENTATION_MAP.md
```

**After each Part completes:**
1. Claude Code runs Phase 5 validation for that Part only (not the full 8-command suite — only lint + typecheck for the files changed in this Part).
2. Claude Code squash-merges `scaffold/part-N` to main.
3. Claude Code rewrites STATE.md with PHASE = "Phase 4 Part N+1 of 8".
4. Human (or automation) opens the next task file to start Part N+1 in a fresh session.

**MiniMax M2.5 optimization:** Fresh context per Part is especially important for MiniMax M2.5. Keeping each task under ~3,000 lines of context ensures MiniMax M2.5 produces correct output for the entire Part without quality degradation.


### Rule 25 — Two-stage code review on every Feature Update (NEW V14)

Replaces the single-stage Visual QA (Rule 16) for Phase 7 Feature Updates.
Rule 16 Visual QA still runs after Phase 6 initial startup. Rule 25 runs after every Phase 7 Feature Update.

**STAGE 1 — Spec compliance check (runs first, always):**
```
SPEC CHECK — [feature name]
──────────────────────────────────────────
PRODUCT.md declares:    [what the feature should do]
Implementation found:   [what actually exists in the code]

For each declared behaviour:
  ✅ [behaviour] — implemented at [file:line]
  ❌ [behaviour] — MISSING or WRONG

VERDICT: PASS (all behaviours present) | FAIL (list missing items)
```
If FAIL: fix the missing items before proceeding to Stage 2. Do not skip to governance writes.

**STAGE 2 — Code quality check (runs only if Stage 1 passes):**
```
QUALITY CHECK — [feature name]
──────────────────────────────────────────
TypeScript:   [ ] No any types introduced
              [ ] No type assertions (as X) without comment explaining why
Tests:        [ ] Tests written BEFORE implementation (RED→GREEN verified)
              [ ] All changed files have test coverage
              [ ] No test stubs — tests actually assert behaviour
Scope:        [ ] Only files in blast-radius were modified (Rule 17 / Step 3)
              [ ] No unrelated files touched
Commits:      [ ] Conventional commit format used
              [ ] No "update", "fix", "changes" as full commit messages
Simplicity    [ ] No function does more than one thing (NEW V23)
(code-        [ ] No repeated logic ≥2 occurrences — extract to shared helper
simplifier):  [ ] No wrapper functions that add zero value beyond the wrapped call
              [ ] No single-use variables that obscure rather than clarify

VERDICT: PASS | FAIL (list specific items)
SIMPLIFY:     [list any extraction/dedup opportunities found — fix before governance writes]
```
If FAIL: fix before writing governance docs.
If SIMPLIFY items found: fix them inline — do not defer to "future refactor".

**TDD enforcement (NEW V14 — from Superpowers):**
- Write the failing test FIRST. Run it. Confirm it is RED.
- Write the minimal implementation to make it GREEN.
- Refactor only after GREEN.
- If Claude Code finds code that was written before its corresponding test: DELETE the code, write the test first, then rewrite the code.
- This rule has no exceptions. No "I'll add tests later."

**After both stages pass → proceed to governance writes (Rule 3, non-blocking).**


### Rule 26 — Skills live in `.github/skills/` (NEW V19)

Every project skill file uses the cross-agent standard location so skills work in Claude Code
and GitHub Copilot without any path changes. (Cline deprecated V31; the `.github/skills/` layout
remains agent-agnostic so skills stay portable.)

**Required directory layout — written by Bootstrap Step 17:**
```
.github/skills/
  spec-driven-core/
    SKILL.md          ← always-on core framework compact rules card
  [domain-pack]/      ← optional: one folder per installed domain skill pack
    SKILL.md
    references/       ← optional: additional reference docs for the skill
```

**SKILL.md format — exact structure, no deviations:**
```markdown
---
name: [kebab-case-unique-name]
description: [one sentence — what it does AND when to trigger it. This is the agent's activation signal.]
---

# [Skill Title]

[Numbered steps. Imperative commands. No prose paragraphs. Under 500 lines total.]
```

**Rules — enforce without exception:**
1. Every SKILL.md MUST have a `name` and `description` frontmatter block.
2. Description is the activation trigger — write it so the agent knows exactly when to load it.
3. Keep SKILL.md under 500 lines — longer files degrade MiniMax M2.5 output quality.
4. Helper scripts go in `.github/skills/[name]/scripts/`. Reference them from SKILL.md numbered steps.
5. Skills are instruction files, NOT executable code. The agent reads them and follows steps.
6. `.claude/skills/` is the legacy path — still supported, but `.github/skills/` is canonical in V19+.
7. Bootstrap Step 17 writes `.github/skills/spec-driven-core/SKILL.md` — compact framework rules card.
8. Skills are loaded contextually: scan `.github/skills/` at task start, read each description, load full SKILL.md only when description matches the task. Never load all skills at once.
9. If a skill directory exists but has no SKILL.md → log 🔴 gotcha to lessons.md. Do not crash.

**File ownership:**
```
.github/skills/spec-driven-core/SKILL.md   AGENT    Written by Bootstrap Step 17. Never edit manually.
deploy/compose/push.sh                     AGENT    Phase 4 Part 7 (conditional: docker.publish: true). Human may edit credentials at top.
COMMANDS.md                                AGENT    Phase 4 Part 7 (conditional: docker.publish: true). Human may add custom entries at bottom.
.github/skills/[user-installed]/            HUMAN    Installed via /plugin install or manual copy.
.github/skills/.gitkeep                     AGENT    Keeps directory tracked in git. Never delete.
```


### Rule 27 — Plugin format for domain skill packs (NEW V19)

Skill packs bundle a SKILL.md and optional MCP configs into an installable unit.
This formalises the install path for domain-specific knowledge packs.

**Plugin manifest — `.claude-plugin/marketplace.json` (in the plugin repo, not your project):**
```json
{
  "name": "[pack-name]",
  "version": "1.0.0",
  "description": "[one sentence]",
  "plugins": [
    {
      "id": "[pack-id]",
      "name": "[Pack Name]",
      "description": "[what it adds]",
      "skills": [".github/skills/[pack-id]/"]
    }
  ]
}
```

**Install via Claude Code terminal:**
```
/plugin marketplace add [github-org]/[repo]
/plugin install [pack-id]@[repo]
```

**Framework-native domain packs (all optional — install only what your app needs):**
```
spec-driven-aws        → AWS CDK patterns, cost estimation, Serverless/EDA, Bedrock AgentCore
spec-driven-payments   → Xendit webhooks (x-callback-token verification), idempotency keys, PCI scope isolation, refund flows, SEA payment methods (V27 — Xendit is framework default gateway)
spec-driven-govt       → Audit trail hardening, DICT compliance, fisherfolk/MPA domain terms,
                          multi-level governance patterns (apex org → national agency → LGU)
spec-driven-erp        → Payroll tax rules, AP/AR double-entry ledger, POS session patterns,
                          separate-schema isolation for payroll/banking data
```

**Rules:**
1. Plugin install is ALWAYS optional. Core framework ships without any domain pack.
2. A plugin adds `.github/skills/[id]/SKILL.md`. It does NOT modify any governance doc.
3. If a plugin declares MCP servers, they are wired into `.vscode/mcp.json` via Bootstrap Step 17.
4. Agents detect an installed plugin by checking `.github/skills/[id]/SKILL.md` exists.
5. Skills from installed plugins load contextually — never injected globally.
6. Plugin install never interrupts an active build phase.
7. Core framework rules (CLAUDE.md) always override domain pack instructions on conflict.


### Rule 28 — Global instruction priority order (NEW V20)

When any two sources conflict, the GLOBAL INSTRUCTION PRIORITY ORDER declared in
WHO YOU ARE is the tiebreaker. This rule makes the priority order binding for all agents.

**Enforcement:**
- Every agent reads the priority table before starting any task (it is part of WHO YOU ARE).
- Every `.github/skills/[pack]/SKILL.md` MUST include this line in its frontmatter:
  `priority: supplemental  # never overrides CLAUDE.md rules`
- If a SKILL.md instruction conflicts with a CLAUDE.md rule: follow CLAUDE.md. Log the conflict.
- User instructions (priority 8) are always followed UNLESS they conflict with safety (priority 1)
  or CLAUDE.md rules (priority 2). Never tell the user their instruction was ignored silently —
  always explain which rule took precedence.


### Rule 29 — No fuzzy reasoning — deterministic decision engine (NEW V21)

When any information required to proceed is absent, ambiguous, or inferrable-but-not-declared,
the agent MUST ask — never guess, never interpret, never assume.

**Banned reasoning patterns — never use these as a basis for any decision:**
```
BANNED PHRASE          WHY IT IS BANNED
─────────────────────  ──────────────────────────────────────────────────
"seems like"           Interpretation — not a declared fact
"probably"             Inference — not confirmed by the user
"typically"            Pattern assumption — this app may not be typical
"I assume"             Explicit guessing — Rule 10 prohibits this
"usually"              Default-filling — inputs.yml defines defaults, not assumptions
"most apps like this"  Context hallucination — never compare to other apps
"standard setup"       Vague default — all defaults are declared in inputs.yml
```

**Enforcement — MANDATORY:**
```
IF the agent would use any banned phrase to justify a decision:
1. STOP. Do not proceed with that decision.
2. Identify the specific missing information.
3. Ask the user for that specific information only.
4. Wait for the answer.
5. Only then proceed.

IF the answer IS already in PRODUCT.md, DECISIONS_LOG.md, or inputs.yml:
→ Use it. Do not ask again. (Rule 10 — never re-ask locked decisions.)

IF the answer is NOT declared anywhere:
→ Ask. Always. Even if the answer seems obvious.
```

**Applies to all agents:** Claude Code (V31 primary), Copilot, Planning Assistant. (Cline deprecated V31 — rule still applies if ever re-enabled as emergency fallback.)
**Applies to all domains:** tech stack, tenancy, auth, compliance, infrastructure, mobile, file storage.
**No exceptions.** "The user probably meant X" is never acceptable reasoning.

### Rule 30 — Context7 live docs for library work (NEW V23)

Before writing code that uses any external library, invoke Context7 MCP to pull current version-specific documentation. Never rely on training data alone for library APIs.

**The problem this solves:** LLM training data has a cutoff. Next.js App Router patterns, Prisma schema conventions, Auth.js v5 breaking changes, tRPC v11 APIs — all change faster than training data updates. Without Context7, generated code may use deprecated methods that fail Phase 5 validation.

**Trigger:** Any task involving an external dependency declared in `package.json`.

**How to invoke — append "use context7" to the task:**
```
"Add rate limiting to the auth endpoints using Valkey. use context7"
"Implement soft deletes in Prisma with schema isolation. use context7"
"Set up Auth.js v5 Credentials provider with bcrypt. use context7"
"Configure BullMQ worker with Redis-compatible Valkey. use context7"
```

**Context7 executes two MCP tool calls automatically:**
1. `resolve-library-id` — matches the library name to its Context7 registry ID
2. `query-docs` — fetches current version-matched documentation and code examples

**Priority libraries for this stack — always use context7:**
```
Library          Context7 ID
───────────────  ─────────────────────────────
Next.js          /vercel/next.js
Prisma           /prisma/prisma
Auth.js v5       /nextauthjs/next-auth
tRPC             /trpc/trpc
shadcn/ui        /shadcn-ui/ui
BullMQ           /taskforcesh/bullmq
Expo             /expo/expo
WatermelonDB     /nozbe/watermelondb
Valkey           Use Redis docs (compatible): /redis/redis
```

**Context7 is MCP — already in `.vscode/mcp.json` (Bootstrap Step 10).**
No separate installation needed per project. Zero API key required.

**Rule 30 in .clinerules:** See `CONTEXT7 LIVE DOCS — MANDATORY` section.


---


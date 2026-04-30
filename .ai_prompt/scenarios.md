# Spec-Driven Platform V31 — Scenarios 1-34

> Loaded contextually when user triggers a named scenario.
> Read ONLY the scenario matching the user's request.
> Never load this entire file for a non-scenario task.

---

### SCENARIO 1 — Add a feature to an existing module
```
1. Edit docs/PRODUCT.md — add feature to relevant sections. Save.
2. In Claude Code: say "Feature Update"
   In Copilot/Claude Code: say "Feature Update" + attach all 9 docs (Rule 4)
3. Claude Code MUST:
   a. Read all 9 governance docs (lessons.md first — ALL 🔴 gotchas → ALL 🟤 decisions)
   b. Run blast-radius check if code-review-graph installed (step 3 of Phase 7)
   c. Run codebase_search before opening any file (Rule 17)
   d. Implement only files in blast-radius scope
   e. Run Visual QA after implementation (Rule 16)
   f. Append to CHANGELOG_AI.md after implementation (non-blocking)
   g. Run codebase_update to refresh SocratiCode index
4. You verify: pnpm tools:check-product-sync && pnpm typecheck && pnpm test
```

### SCENARIO 2 — Add a brand new module
```
1. Edit docs/PRODUCT.md — add module across ALL relevant sections
2. Feature Update → agent generates entity, migration, API module, pages, types
```

### SCENARIO 3 — Change an existing entity
```
1. Edit Core Entities in docs/PRODUCT.md
2. Feature Update → agent generates nullable column + migration (up + down)
```

### SCENARIO 4 — Remove a feature or module
```
1. Delete or comment out the section in docs/PRODUCT.md
2. Feature Update → agent lists what will be deleted and asks confirmation
3. Reply "yes" → agent deletes files + writes down-migration + updates index
```

### SCENARIO 5 — Change a tech stack decision (rare)
```
1. Update Tech Stack Preferences in docs/PRODUCT.md
2. Feature Update → agent flags locked DECISIONS_LOG entry → asks confirmation
3. Confirm → agent replaces all affected files + updates DECISIONS_LOG
⚠️ Run full test suite after stack changes.
```

### SCENARIO 6 — Enable an optional toggle (K8s, jobs, storage, multi-tenancy)
```
1. Add requirement to docs/PRODUCT.md
2. Feature Update → agent activates the toggle in inputs.yml + generates files
```

### SCENARIO 7 — Add a mobile app to an existing project
```
1. Add mobile app to Connected Apps in docs/PRODUCT.md
2. Add mobile-specific workflows
3. Feature Update → agent:
   ✓ Adds mobile app to inputs.yml apps list
   ✓ Scaffolds apps/mobile/ with Expo + TypeScript
   ✓ Generates eas.json for App Store + Play Store builds
   ✓ Wires to packages/api-client/ (NEVER packages/db/ — Rule 13)
   ✓ Adds offline sync queue in apps/mobile/src/sync/ (if declared)
   ✓ Adds Expo Push / FCM+APNs notification setup (if declared)
   ✓ Updates all governance docs
⚠️ Mobile apps NEVER import from packages/db/. API only.
```

### SCENARIO 8 — Change tenant URL routing (subdomain ↔ subdirectory)
```
1. Update Tenancy Model + Domain sections in docs/PRODUCT.md
2. Feature Update → agent flags locked routing decision → asks confirmation
3. Confirm → agent rewrites middleware, auth callbacks, next.config, compose env
⚠️ Auth provider redirect URIs must be updated manually.
```

### SCENARIO 9 — Audit multi-tenant security layers
```
1. Confirm Security Requirements section in PRODUCT.md lists all 6 layers:
   L1 — tRPC tenantId scoping (app layer)
   L2 — PostgreSQL RLS (database layer)
   L3 — RBAC middleware (role guard — always active)
   L4 — PgBouncer pool limits (connection isolation)
   L5 — Immutable AuditLog (always active)
   L6 — Prisma query guardrails (always active)
2. Feature Update → agent checks which layers are missing → generates only those
3. L3, L5, L6 are always active in single AND multi mode — never skip these.
```

### SCENARIO 10 — Migrate a service to AWS
```
Zero code changes. Stop compose service → update .env → restart app compose.
PostgreSQL → RDS: update DATABASE_URL
MinIO → S3: update STORAGE_ENDPOINT + STORAGE_ACCESS_KEY + STORAGE_SECRET_KEY
Valkey → ElastiCache: update REDIS_URL=rediss://<endpoint>:6379
⚠️ Drain BullMQ jobs before migrating Valkey.
```

### SCENARIO 11 — Upgrade single-tenant to multi-tenant
```
1. Change Tenancy Model to multi in docs/PRODUCT.md
2. Feature Update → agent generates data migration + schema migration + all L1-L6
3. Run IN THIS ORDER:
   pnpm db:migrate:data   ← FIRST: assign existing rows to default tenant
   pnpm db:migrate        ← SECOND: NOT NULL constraint + RLS enabled
⚠️ Schema first = NOT NULL failure on existing rows.
```

### SCENARIO 12 — Governance Sync: code drifted, docs are stale
```
CASE A — code drifted, PRODUCT.md untouched:
  "Governance Sync" + attach 9 docs
  Agent reads .specstory/history/ to attribute unlogged changes.
  Shows reconciliation table with agent attribution → ask confirmation → updates all docs.

CASE B — code AND PRODUCT.md both changed:
  "Governance Sync — conflict resolution" + 9 docs
  Agent shows conflict table. You resolve each contradiction.

Prevention: run Phase 7 for any change > 5 lines. One Governance Sync per day max.
```

### SCENARIO 13 — Claude Code wrote a handoff file (Cline deprecated)
```
1. Find: .cline/handoffs/<timestamp>-<e>.md
   Contains: what Claude Code was doing, full error, 3 fix attempts, root cause, what to do.

2. Options:
   A. Fix yourself based on diagnosis → tell Claude Code "Resume from handoff: <filename>"
   B. Paste handoff into Copilot/Claude Code → "Read this handoff and resolve"
   C. Fix .env/config manually → tell Claude Code "Resume from handoff: <filename>"

3. After resolution: Claude Code appends to lessons.md (🟡 fix format — Rule 18).
   SpecStory captures the full resolution session automatically.
```

### SCENARIO 14 — Visual QA failed
```
1. Find handoff: .cline/handoffs/<timestamp>-visual-qa.md
2. Common causes:
   - Page not loading: check pnpm db:seed was run, check auth config in .env
   - Console error: missing env var or API endpoint not scaffolded
   - Login fails: verify AUTH_SECRET and NEXTAUTH_URL in .env
   - 404 on route: check Next.js page was scaffolded correctly in Phase 4
3. After fix: tell Claude Code "Resume from handoff: <filename>"
4. Claude Code writes 🔴 gotcha entry to lessons.md (Rule 18) if this was a new failure pattern.
```

### SCENARIO 15 — Run a Governance Retro
```
1. Say "Governance Retro" in Claude Code (no docs attachment needed)
2. Claude Code outputs the structured retro (built, errors, velocity, health)
3. Retro includes "Unattributed SpecStory diffs reconciled" count
4. Use "Recommended Focus" to plan your next Phase 7 or Phase 8
```

### SCENARIO 16 — SocratiCode: setup, indexing, and usage (V10)
```
SETUP (one-time per machine — not per project):
  Ensure Docker is running.
  .vscode/mcp.json was already created by Bootstrap — no extra install needed.
  On first use in any project, SocratiCode auto-pulls Docker images (~5 min).

FIRST-TIME INDEX (after Phase 4 completes):
  Ask Claude Code: "Index this codebase"
  → codebase_index {}
  Poll status: → codebase_status {}  (check until complete)
  Then: → codebase_context_index {}

DAILY USAGE (automatic via Rule 17):
  Claude Code calls codebase_search before opening files during Phase 7.
  Claude Code calls codebase_update after every Feature Update.

IF SEARCH RETURNS NO RESULTS:
  → codebase_status {}  (check if project is indexed)
  → codebase_index {}   (re-index if needed)

INDEX IS STALE (after large refactor or schema change):
  → codebase_update {}
  → codebase_context_index {}
```

### SCENARIO 17 — SpecStory captured changes not attributed to any agent (NEW V11)
```
WHEN THIS HAPPENS:
  - You made inline edits manually or via Copilot autocomplete
  - No Claude Code session was active at the time
  - CHANGELOG_AI.md has no entry for the change
  - .specstory/history/ has a diff showing the change

HOW TO RECONCILE:
  1. Say "Governance Sync" in Claude Code + attach 9 docs
  Claude Code reads automatically. For Copilot/Claude Code: attach all 9 docs manually.
  2. Claude Code reads .specstory/history/ and finds unattributed diffs
  3. Claude Code shows you a reconciliation table:
     - File changed: [filename]
     - Change type: [added/modified/deleted]
     - Inferred agent: COPILOT | HUMAN | UNKNOWN
     - Suggested CHANGELOG entry: [preview]
  4. Confirm → Claude Code writes attributed entries to CHANGELOG_AI.md
  5. IMPLEMENTATION_MAP.md updated if structural changes were made

PREVENTION:
  For any change > 5 lines: use Phase 7 so attribution is automatic.
  For small Copilot fixes: let them accumulate, run Governance Sync at end of day.
```

### SCENARIO 18 — Copilot made inline changes — attribution and governance (NEW V11)
```
WHAT COPILOT CAN AND CANNOT DO:
  ✓ Inline autocomplete (always on) — SpecStory captures all diffs
  ✓ Copilot Chat with edits — SpecStory captures all diffs
  ✓ PR reviews on GitHub — no file changes, no attribution needed
  ✗ Cannot self-report to CHANGELOG_AI.md (no agentic loop)
  ✗ Cannot read governance docs autonomously
  ✗ Cannot run Phase 7 steps automatically

COPILOT'S ROLE IN THE ATTRIBUTION CHAIN:
  Copilot makes a change
       ↓
  SpecStory captures the file diff to .specstory/history/
       ↓
  Governance Sync (Scenario 17) attributes it as COPILOT
       ↓
  CHANGELOG_AI.md updated: Agent: COPILOT

BEST PRACTICE FOR COPILOT CHANGES:
  Use Copilot freely for inline fixes and autocomplete.
  At end of each day or coding session: run "Governance Sync" in Claude Code.
  This reconciles all Copilot and manual changes in one pass.
  Never try to manually edit CHANGELOG_AI.md to attribute Copilot — use Governance Sync.

WHEN COPILOT MAKES A LARGER CHANGE (via Chat):
  After Copilot Chat finishes edits:
  1. Review the changes in VS Code diff view
  2. Say "Feature Update" in Claude Code — paste a description of what Copilot changed
  3. Claude Code reads the diff, validates governance alignment, updates all docs
  This gives Copilot changes the same governance treatment as Claude Code changes.
```

### SCENARIO 19 — Cline is deprecated — use Claude Code (with Copilot as emergency fallback)
```
WHEN THIS APPLIES:
  You're about to make any change to the codebase. Cline is ⚠ DEPRECATED as of V31
  in-place update — do not use it. Claude Code is the primary agent for ALL work.
  Copilot remains as emergency fallback if Claude Code is genuinely unreachable.

RULE: Does the change affect WHAT the app does?
  YES (new feature, behaviour change) → update PRODUCT.md first via the Planning Assistant
       chat on claude.ai, then apply the feature to your project via Claude Code
  NO (bug fix, type error, config fix) → skip PRODUCT.md, describe fix directly to Claude Code

USING CLAUDE CODE (primary path for all work — V31 in-place update):
  1. Run "claude" in project terminal — CLAUDE.md loads automatically
  2. "Resume Session" + attach 3 docs: project.memory.md + IMPLEMENTATION_MAP.md + DECISIONS_LOG.md
  3. After context confirmed: "Feature Update" + describe change + attach all 9 docs if needed
  4. After implementation: Claude Code updates governance docs automatically (Rule 15 format)
  5. Run: pnpm tools:check-product-sync && pnpm typecheck && pnpm test
  6. Commit + push. No Cline session needed afterwards — Cline is deprecated.

USING COPILOT (emergency fallback only — use when Claude Code is unavailable):
  1. Attach ALL 9 docs + say "Resume Session"
  2. After context confirmed: "Feature Update" + describe change
  3. Review all diffs in VS Code diff view before accepting
  4. After implementation: "Update governance docs for all changes just made. Agent: COPILOT" (Rule 15)
  5. Run: pnpm tools:check-product-sync && pnpm typecheck && pnpm test

NEVER use Copilot for Phase 4, 5, or 6 as primary — these chains only work correctly in Claude Code.
Copilot is for small surgical fixes only, never for multi-step scaffold work.

HISTORICAL NOTE: Before V31 in-place Cline deprecation, this scenario was titled "No Cline credits"
and described Claude Code + Copilot as fallbacks when Cline ran out of budget. With Cline deprecated,
the polarity inverted — Claude Code became primary and Cline is no longer used at all.
```


### SCENARIO 20 — UI UX Pro Max: design system generation and usage (NEW V12)
```
SETUP (one-time per project, optional):
  In Claude Code terminal:
  /plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
  /plugin install ui-ux-pro-max@ui-ux-pro-max-skill
  Prerequisite: Python 3 — check with: python3 --version

ACTIVATE DESIGN INTELLIGENCE:
  1. Add Section K (Design Identity) to docs/PRODUCT.md:
     ## Design Identity
     Brand feel:         [professional/enterprise | friendly/consumer | premium/luxury | technical/developer]
     Target aesthetic:   [plain English description]
     Industry category:  [e.g. SaaS, Healthcare, Fintech, E-commerce, Government]
     Dark mode required: [yes / no / optional toggle]
     Key constraint:     [e.g. WCAG AA / internal tool / low-end device support]
  2. Phase 2.6 runs automatically when you say "confirmed" after Phase 2.5
  3. design-system/MASTER.md created — Claude Code reads it before every UI Feature Update

REGENERATE AFTER BRAND CHANGE:
  1. Update Design Identity section in docs/PRODUCT.md
  2. "Feature Update" in Claude Code → detects Design Identity changed
     → reruns Phase 2.6 automatically → MASTER.md regenerated
  Or run manually:
  python3 .claude/skills/ui-ux-pro-max/scripts/search.py     "[industry] [brand feel] [aesthetic]" --design-system --persist -p "[AppName]"

ADD PAGE-SPECIFIC DESIGN OVERRIDES (page-specific override files):
  python3 .claude/skills/ui-ux-pro-max/scripts/search.py     "[page description]" --design-system --persist -p "[AppName]" --page "[page-name]"
  Creates: design-system/pages/[page-name].md
  Phase 7 automatically uses page override when building that specific page

VIEW CURRENT DESIGN SYSTEM:
  cat design-system/MASTER.md

IF SKILL NOT INSTALLED — GRACEFUL DEGRADATION:
  Framework continues working exactly as prior version
  Claude Code uses shadcn/ui defaults with neutral color palette
  No errors, no blocked phases, no warnings
  Install the skill and run Phase 2.6 any time to activate
  All existing projects: zero changes needed — framework continues without design system
```

### SCENARIO 21 — code-review-graph: setup, indexing, and usage (NEW V13)
```
INSTALL (one-time per machine — not per project):
  In Claude Code terminal (anywhere):
  claude plugin add tirth8205/code-review-graph
  Prerequisites: Python 3.10+ and uv (curl -LsSf https://astral.sh/uv/install.sh | sh)
  Restart Claude Code after install. Verify 8 MCP tools appear.
  Dev/Test machine only — never install in staging or production.

PER-PROJECT SETUP (after Phase 6 completes):
  From WSL2 terminal:
  code-review-graph build    # initial parse ~10s for 500 files
  code-review-graph status   # verify graph is healthy

WATCH MODE (keep running in background WSL2 terminal):
  code-review-graph watch    # auto-updates graph on every file save and git commit

DAILY USAGE (automatic via Phase 7 step 1c):
  Before every Feature Update, Claude Code calls:
  → get_impact_radius_tool { files: [changed files] }
    Returns: all callers, callees, tests, and dependents affected by the change
  → get_review_context_tool { files: [impacted files] }
    Returns: token-efficient context bundle — only what matters, not the whole repo
  Claude Code reads only impacted files, not the entire codebase. 5–10x fewer tokens.

8 MCP TOOLS AVAILABLE:
  build_or_update_graph_tool  → full or incremental graph build
  get_impact_radius_tool      → blast radius: what's affected by a change
  query_graph_tool            → callers, callees, tests, imports for any symbol
  get_review_context_tool     → token-optimised review context bundle
  semantic_search_nodes_tool  → search by name, keyword, or semantic similarity
  embed_graph_tool            → vector embeddings for semantic search (optional)
  list_graph_stats_tool       → graph health check and statistics
  get_docs_section_tool       → retrieve documentation with minimal tokens

IF GRAPH IS STALE (after large refactor or schema change):
  code-review-graph update    # incremental update — changed files only
  code-review-graph status    # verify graph is current

GRAPH STORAGE (add to .gitignore):
  .code-review-graph/         # machine-local SQLite — never commit this
  .code-review-graphignore    # exclude generated/vendor files from graph

CREATE .code-review-graphignore at project root:
  node_modules/**
  dist/**
  .next/**
  .turbo/**
  *.generated.ts
  coverage/**
```


### SCENARIO 22 — Git branching and two-stage review workflow (NEW V14)
```
ADDING A FEATURE (full V14 workflow):
  1. Edit docs/PRODUCT.md — describe the feature. Save.
  2. Claude Code: "Feature Update" (reads STATE.md first, then 9 docs)
  3. Claude Code creates branch: feat/[feature-slug]
  4. Claude Code runs blast-radius check (code-review-graph) + SocratiCode search
  5. Claude Code writes failing tests FIRST (RED)
  6. Claude Code implements (GREEN)
  7. Claude Code runs two-stage review:
     Stage 1 — spec compliance: every PRODUCT.md behaviour is present
     Stage 2 — quality: no any types, tests before code, blast-radius scope only
  8. Claude Code squash-merges feat/[slug] to main. Deletes branch.
  9. Claude Code rewrites STATE.md with LAST_DONE and NEXT.
  10. You verify: pnpm tools:check-product-sync && pnpm test

IF STAGE 1 FAILS:
  Claude Code lists missing behaviours → implements them → re-runs Stage 1.
  Does NOT proceed to governance writes until Stage 1 passes.

IF STAGE 2 FAILS:
  Claude Code fixes specific items (no any type → fix type, stub test → real assertion).
  Does NOT merge until Stage 2 passes.

BRANCH NAMING QUICK REFERENCE:
  Feature:       feat/user-auth-module
  Phase 4 Part:  scaffold/part-3
  Bug fix:       fix/login-redirect-loop
  Chore:         chore/update-dependencies
```

### SCENARIO 23 — Fresh context session management for Phase 4 (NEW V14)
```
STARTING PHASE 4 (V14 Part-by-Part approach):
  Do NOT say "Start Phase 4" as one command.
  Instead, for each Part:
    1. Open a NEW Claude Code session (close the previous one first)
    2. Claude Code auto-reads CLAUDE.md
    3. Say: "Start Part [N]" — Claude Code reads .cline/tasks/phase4-part[N].md
    4. Claude Code reads STATE.md → confirms LAST_DONE matches previous Part
    5. Claude Code creates branch, builds, validates, squash-merges, rewrites STATE.md
    6. Claude Code outputs: "✅ Part [N] complete. Open phase4-part[N+1].md in a NEW session."
    7. Close this Claude Code session. Open new one. Repeat.

VERIFYING STATE BETWEEN PARTS:
  - Check .cline/STATE.md after each Part
  - PHASE should say "Phase 4 Part N complete"
  - If it says Part N-1 still: the previous Part didn't finish — resume it before starting N

IF A PART FAILS:
  - Check .cline/handoffs/ for the error handoff
  - Fix the issue manually or via Claude Code "Resume from handoff: [filename]"
  - Part stays on its branch — do not squash-merge until all checks pass
```


### SCENARIO 26 — Security hardening: headers, rate limiting, XSS, and dependency audit (NEW V18)
```
WHAT THIS COVERS:
  Three security layers added in V18. All scaffolded automatically by Phase 4 Part 5 + Part 8.
  No PRODUCT.md change needed — they are always-on defaults for every new project.

LAYER 1 — HTTP SECURITY HEADERS (next.config.ts):
  Automatically applied to every route in every web app.
  Key headers:
    X-Frame-Options: SAMEORIGIN          → blocks clickjacking
    X-Content-Type-Options: nosniff      → blocks MIME sniffing attacks
    Strict-Transport-Security            → forces HTTPS for 1 year
    Content-Security-Policy              → restricts where resources can load from
    Referrer-Policy                      → controls referrer header exposure
    Permissions-Policy                   → disables unused browser APIs
  TIGHTEN CSP after initial dev:
    Replace "unsafe-inline" and "unsafe-eval" with specific hashes or nonces.
    Add any external domains your app loads (fonts, CDN, analytics, etc.).
    Example: script-src 'self' https://cdn.yourdomain.com

LAYER 2 — RATE LIMITING (src/server/lib/rate-limit.ts):
  Pre-configured limiters in rateLimiters export:
    rateLimiters.public   → 30 req/min  (unauthenticated routes)
    rateLimiters.auth     → 10 req/min  (login, register, password reset)
    rateLimiters.api      → 120 req/min (authenticated API calls)
    rateLimiters.upload   → 20 req/min  (file upload endpoints)
  Usage in a tRPC router:
    rateLimiters.auth.check(req.ip ?? 'unknown')
  UPGRADE FOR MULTI-INSTANCE PROD:
    Replace LRUCache store with Redis store using ioredis.
    Change 1 import — the API is identical.
    Feature Update: "upgrade rate limiter to Redis store for multi-instance"

LAYER 3 — XSS PREVENTION (src/server/lib/sanitize.ts):
  Call sanitize() before writing any user-submitted HTML to the database.
  Call sanitizePlainText() for non-HTML fields to strip all tags.
  Usage:
    import { sanitize, sanitizePlainText } from '@/server/lib/sanitize'
    const cleanBio = sanitize(input.bio)            // allows safe HTML
    const cleanName = sanitizePlainText(input.name) // strips ALL tags

LAYER 4 — DEPENDENCY AUDIT (ci.yml + Phase 5):
  Runs automatically on every push to main via GitHub Actions security job.
  Also runs locally as the 9th Phase 5 validation command.
  Blocks merge on HIGH or CRITICAL severity CVEs.
  FIX A VULNERABILITY:
    pnpm audit              → see full vulnerability report
    pnpm audit --fix        → auto-fix where possible
    Manual fix: update the package version in the affected package.json
  OVERRIDE (temporary — never permanent):
    Add to .npmrc: audit-level=critical  (downgrades threshold — use sparingly)

VERIFY HEADERS ARE ACTIVE (after Phase 6 starts the app):
  curl -I http://localhost:${APP_PORT} | grep -E "x-frame|x-content|strict-transport|content-security"
  All 6 headers should appear in the response.
```


### SCENARIO 27 — Installing and using framework skill packs (NEW V19)
```
WHAT ARE SKILL PACKS:
  Optional domain bundles that add .github/skills/[id]/SKILL.md with patterns and
  conventions for a specific domain. Agents load a skill only when its description
  matches the current task. Core framework ships with zero required packs.

INSTALL A SKILL PACK:

  Method A — Plugin marketplace (recommended):
    In Claude Code terminal:
    /plugin marketplace add [github-org]/[repo]
    /plugin install [pack-id]@[repo]

    Framework-native packs:
    spec-driven-aws
      → CDK patterns, cost estimation, Serverless/EDA, Bedrock AgentCore
      → Bundles MCP configs: AWS CDK MCP + AWS Pricing + CloudWatch
    spec-driven-payments
      → Stripe webhooks, idempotency keys, PCI scope isolation, refund flows
    spec-driven-govt
      → Audit hardening, DICT compliance, fisherfolk/MPA domain terms,
         multi-level governance (apex org → national agency → LGU)
    spec-driven-erp
      → Payroll tax rules, AP/AR double-entry ledger, POS session patterns,
         separate-schema isolation for payroll/banking data

  Method B — Manual install:
    1. mkdir -p .github/skills/[pack-id]
    2. Write SKILL.md following Rule 26 format (frontmatter + numbered steps under 500 lines)
    3. Add helper scripts to .github/skills/[pack-id]/scripts/ if needed
    4. Agent discovers skill on next task start via .github/skills/ directory scan

VERIFY INSTALL:
  ls .github/skills/
  → Should list: spec-driven-core/ plus any installed packs
  head .github/skills/[pack-id]/SKILL.md
  → Confirm: name: and description: frontmatter present

HOW AGENTS USE INSTALLED SKILLS:
  1. Task start: list .github/skills/ (directory names only)
  2. For each directory: read description: frontmatter line only
  3. IF description matches current task → read full SKILL.md → follow numbered steps
  4. IF no match → proceed with CLAUDE.md rules only
  Never load all skills simultaneously. Contextual only.
  Core framework rules (CLAUDE.md) always override domain pack on conflict.

WRITING A CUSTOM SKILL:
  1. Create .github/skills/[skill-name]/SKILL.md
  2. Follow Rule 26 format: frontmatter + numbered imperative steps + under 500 lines
  3. Test: say "Feature Update" describing a task matching the description line
     → Claude Code should load the skill. If not: tighten the description.

UPGRADING OR REMOVING:
  Upgrade: overwrite SKILL.md. Skills are stateless — no migration needed.
  Remove:  rm -rf .github/skills/[pack-id]/
           Append to agent-log.md: "Skill [pack-id] removed. Reason: [reason]"
           No Phase 7 trigger needed — skills are not governance docs.
```


### SCENARIO 31 — Context7 live docs in practice (NEW V23)
```
OVERVIEW:
  Context7 MCP injects current version-specific library documentation into Claude Code's context
  before generating code. Prevents hallucinated deprecated APIs — the most common cause of
  Phase 5 validation failures on fast-moving libraries.

SETUP (done once at bootstrap — already in .vscode/mcp.json):
  No per-project setup needed. Bootstrap Step 10 writes the mcp.json entry automatically.
  Verify it works: ask Claude Code "use context7 to look up next.js middleware" — you should see
  Context7 resolve the library and return current docs.

HOW TO USE — append "use context7" to any Claude Code task:

  EXAMPLE 1 — Auth.js v5 setup:
  "Set up Auth.js v5 Credentials provider with bcrypt password hashing. use context7"
  Context7 fetches /nextauthjs/next-auth docs for the v5 API before Claude Code writes any code.
  Without context7: Claude Code may use the v4 authorize() pattern, causing runtime errors.

  EXAMPLE 2 — Prisma schema + multi-tenant isolation:
  "Add a soft-delete pattern to the User model with tenant-scoped RLS. use context7"
  Context7 fetches /prisma/prisma for current schema directives and client API.

  EXAMPLE 3 — tRPC v11 procedure:
  "Create a tRPC procedure for paginated list with cursor. use context7"
  Context7 fetches /trpc/trpc for the v11 procedure API (initTRPC, publicProcedure pattern).

  EXAMPLE 4 — BullMQ worker:
  "Implement a BullMQ worker with exponential backoff and DLQ. use context7"
  Context7 fetches /taskforcesh/bullmq for current Worker, Queue, and QueueEvents API.

  EXAMPLE 5 — Expo + WatermelonDB offline:
  "Set up WatermelonDB sync adapter for Expo with conflict resolution. use context7"
  Context7 fetches /nozbe/watermelondb for current sync API and schema setup.

USING SPECIFIC VERSIONS:
  Mention the version in the prompt — Context7 matches automatically:
  "Configure Next.js 15 middleware to check JWT in cookies. use context7"
  → Context7 fetches Next.js 15 docs specifically, not latest.

MANUAL LOOKUP (without triggering full task):
  In Claude Code: "/context7:docs prisma soft delete"
  → Returns just the documentation — no code generation. Use for quick reference.

WHEN CONTEXT7 CANNOT RESOLVE A LIBRARY:
  Some libraries are not in the Context7 index (rare, usually very new releases).
  If resolve-library-id returns no match:
  → Fall back to web_search MCP for current docs
  → Log 🟡 fix to lessons.md: "Library [name] not in Context7 — use web_search"
  → Continue — never block on missing Context7 entry.

PAIRING WITH SOCRATICODE:
  Context7 = library/framework documentation (external)
  SocratiCode = your codebase search (internal)
  Use both together for maximum accuracy:
  "Find existing auth middleware in our codebase (SocratiCode), then add JWT refresh
   using Auth.js v5 token rotation. use context7"
  → SocratiCode searches your code, Context7 fetches current Auth.js docs.
```

### SCENARIO 30 — Dev image build + push pipeline (NEW V22)
```
OVERVIEW:
  Dev → Docker Hub (dev tag) → staging server (staging tag) → prod server (prod tag)
  Same image flows through all environments. No rebuilds after dev testing passes.
  GitHub Actions still auto-pushes from main to Docker Hub (:latest) in parallel.

PREREQUISITES:
  1. docker.publish: true in inputs.yml
  2. Dockerfile exists in apps/[web]/ (Phase 4 Part 5)
  3. push.sh exists in deploy/compose/ (Phase 4 Part 7)
  4. DOCKERHUB_USERNAME in your shell: export DOCKERHUB_USERNAME=yourusername
  5. Logged in: docker login

STEP 1 — Start dev environment + test everything:
  bash deploy/compose/start.sh dev up -d
  pnpm test && pnpm typecheck && pnpm lint
  # Verify app at http://localhost:${APP_PORT}
  # Verify pgAdmin, MinIO, MailHog are all healthy

STEP 2 — Build + push dev image (manual gate — you decide when dev is ready):
  bash deploy/compose/push.sh dev
  This:
  → Builds the app image from source (Dockerfile multi-stage build)
  → Runs full-stack tests inside the container against real services
  → If tests pass: pushes two tags to Docker Hub:
       yourusername/appname:dev-latest        (mutable — always latest dev build)
       yourusername/appname:dev-sha-{hash}    (immutable — traceable to commit)
  → If tests fail: aborts push. Fix tests before retrying.

STEP 3 — Promote to staging (re-tag, no rebuild):
  bash deploy/compose/push.sh staging
  This re-tags dev-latest → staging-latest + staging-sha-{hash} and pushes.
  Note: GitHub Actions also pushes :staging-latest on every merge to main (V27).
  push.sh staging is useful when promoting a dev build that was NOT merged to main yet.
  On your STAGING SERVER (Komodo or any host):
    # If using Komodo auto-update (V27 recommended): Komodo auto-detects new :staging-latest — no manual pull needed.
    # If NOT using auto-update: pull and restart manually:
    docker compose -f deploy/compose/stage/docker-compose.app.yml pull
    docker compose -f deploy/compose/stage/docker-compose.app.yml up -d
    # To pin a specific version: set APP_IMAGE_TAG=staging-sha-{hash} in .env.staging first
  Verify staging at https://${staging_domain_from_product_md}

STEP 4 — Promote to production (re-tag, no rebuild):
  bash deploy/compose/push.sh prod
  This re-tags staging-latest → :latest + prod-sha-{hash} and pushes.
  On your PRODUCTION SERVER (Komodo):
    # Image tag defaults to :latest in .env.prod — always the newest prod build
    # Just pull and restart — no source code, no build, no git clone:
    docker compose -f deploy/compose/prod/docker-compose.app.yml pull
    docker compose -f deploy/compose/prod/docker-compose.app.yml up -d
    # To pin a specific version: set APP_IMAGE_TAG=prod-sha-{hash} in .env.prod first

ROLLBACK:
  Every push produces an immutable sha-tagged image.
  To rollback staging: change image tag in docker-compose.app.yml:
    image: yourusername/appname:staging-sha-{previous-hash}
  To rollback prod:
    image: yourusername/appname:prod-sha-{previous-hash}
  Then: docker compose up -d

GITHUB ACTIONS COEXISTENCE:
  GitHub Actions still runs docker-publish.yml on every push to main.
  It pushes :latest, :staging-latest, and :sha-{hash} tags automatically (V27).
  Manual push.sh and GitHub Actions push to the SAME Docker Hub repo.
  They do not conflict — push.sh uses :dev-*/staging-*/prod-* tags,
  GitHub Actions uses :latest, :staging-latest, and :sha-{hash}.
  Komodo staging auto-update watches :staging-latest — either path keeps staging current.
  Production servers always pull :latest — either path keeps them current.

COMMANDS.md:
  All push commands are also documented in COMMANDS.md at project root.
  See the Image Build & Push section for a quick reference.
```


### SCENARIO 29 — Edge case recovery: interrupted Parts, missing inputs.yml, existing branch, unfixed CVE, STATE.md conflict (NEW V21)
```
EDGE CASE 1 — Phase 4 Part interrupted mid-session (session closed, crash, power loss):
  On next Claude Code session: read STATE.md → detect PHASE = "[Part N] PARTIAL"
  1. Run: git status (identify what was written before interruption)
  2. Run: git stash list (check for uncommitted work)
  3. IF work committed but not merged → squash-merge → verify output contract → proceed to Part N+1
  4. IF work written but not committed → commit → lint/typecheck → fix errors → squash-merge
  5. IF nothing committed (very early interruption) → restart Part N on the same branch
  6. Rewrite STATE.md: remove PARTIAL → set LAST_DONE correctly → proceed

EDGE CASE 2 — inputs.yml missing when Phase 7 starts:
  Phase 7 pre-flight check detects it.
  → Output GAP_REPORT → STOP → wait for human to restore from git or re-run Phase 3
  → After restore: re-run pnpm tools:validate-inputs → confirm clean → proceed

EDGE CASE 3 — feat/[slug] branch already exists when Phase 7 creates it:
  Phase 7 pre-flight check detects it.
  → DO NOT error. Run: git checkout feat/[slug]
  → Log: "Resumed existing branch feat/[slug]" in agent-log.md
  → Inspect git log for partial work → continue from Phase 7 step 4

EDGE CASE 4 — pnpm audit HIGH CVE with no available fix:
  1. Try pnpm audit --fix → IF resolves: proceed
  2. Try upgrading to latest major version → IF resolves: proceed
  3. IF no fix anywhere:
     → Write DECISIONS_LOG.md entry (CVE ID, package, mitigation, risk accepted)
     → Add audit-level=critical to .npmrc
     → Add 🔴 gotcha to lessons.md
     → Output warning → proceed with mitigation documented
  CRITICAL CVE: NEVER accept. Always escalate to human via HANDOFF_OUTPUT.

EDGE CASE 5 — STATE.md and DECISIONS_LOG.md disagree about phase completion:
  STATE.md = authoritative for PHASE POSITION
  Governance docs = authoritative for CONTENT
  IF STATE.md says complete but governance has no entry:
    → Read git log to confirm merge → write missing governance entry → proceed to next phase
  IF unsure what happened:
    → Run Governance Sync first → reconcile → then proceed
```


### SCENARIO 28 — Spec stress-test: running and re-running Phase 2.7 (NEW V19)
```
WHEN TO RUN OR RE-RUN:
  First run: automatic — triggered after Phase 2.6 (or Phase 2.5 if 2.6 skipped).
  Re-run manually when you:
    - Add a new module to PRODUCT.md before Phase 4 completes
    - Expand scope significantly after Phase 2.5 confirmation
    - Receive a requirement that contradicts an existing decision
    - Suspect Phase 4 will halt due to a PRODUCT.md gap

TRIGGER:
  Say "Re-run Phase 2.7" in Claude Code
  → reads current PRODUCT.md → runs 4-category check → reports gaps or confirms pass

COMMON GAPS BY CATEGORY:

  COMPLETENESS GAP example:
  GAP 1:
    SECTION:  Core Entities
    PROBLEM:  Entity "FisherfolkProfile" appears in workflows but no fields are declared
    FIX:      Add to Core Entities: "FisherfolkProfile: id, fisherfolkId, fullName,
              boatRegistration, contactNumber, gearType, status, createdAt"

  CONSISTENCY GAP example:
  GAP 2:
    SECTION:  Roles + Permissions
    PROBLEM:  Role "LGU Inspector" used in patrol workflows but not declared in Roles section
    FIX:      Add to Roles: "LGU Inspector — can create patrol reports and view violations.
              Cannot approve, reject, or delete records."

  AMBIGUITY GAP example:
  GAP 3:
    SECTION:  Core User Flows
    PROBLEM:  "Admin can manage users" is too vague — Claude Code cannot determine which operations apply
    FIX:      Replace with: "Admin can create, deactivate, and reassign roles to users.
              Admin cannot permanently delete users — only deactivate (soft delete)."

  SECURITY GAP example:
  GAP 4:
    SECTION:  Non-functional Requirements
    PROBLEM:  App handles financial transaction data but no data retention period is declared
    FIX:      Add to NFR: "Financial records retained 7 years per BIR regulations.
              GDPR right-to-erasure applies to personal profile data only, not transaction records."

MID-PROJECT USE (after Phase 4 is already running):
  IF gaps found AFTER Phase 4 started:
    - DO NOT re-run Phase 3 or Phase 4.
    - Fix docs/PRODUCT.md only.
    - Use "Feature Update" in Claude Code to implement changes on top of existing scaffold.
  Phase 2.7 is for catching gaps EARLY. It does not roll back builds.

WHAT PHASE 2.7 DOES NOT CATCH:
  - Code-level bugs → Phase 5 + Phase 6.5 triage handles these
  - UX layout issues → Visual QA in Rule 16 handles these
  - Performance requirements → add to NFR section in PRODUCT.md manually
  - Infrastructure config specifics → Phase 2 Section I interview handles these
```


### SCENARIO 25 — pgAdmin: access, manage, and troubleshoot PostgreSQL (NEW V16)
```
ACCESS pgAdmin (all environments):
  Dev:     http://localhost:${PGADMIN_PORT}   (port from .env.dev — check: cat .env.dev | grep PGADMIN_PORT)
  Staging: http://your-staging-server-ip:5050
  Prod:    http://your-prod-server-ip:5050

  ⚠️  SECURITY WARNING for staging and prod:
  Never expose port 5050 directly to the public internet.
  Restrict via firewall to your IP only, or put behind a reverse proxy with auth.
  On Komodo server: ufw allow from YOUR_IP to any port 5050

LOGIN CREDENTIALS (per environment — from your .env.{env}):
  Email:    value of PGADMIN_EMAIL
  Password: value of PGADMIN_PASSWORD
  Both are pre-generated by Phase 3 — check your env file for the actual values.
  Never use the same credentials across dev/staging/prod — each env has unique creds.

SERVER IS PRE-CONFIGURED — no manual setup:
  pgAdmin auto-connects to your PostgreSQL on first launch via pgadmin-servers.json.
  The server appears as "${APP_SLUG} dev|staging|prod" under Servers in the left panel.
  No need to manually register the server or enter host/port/username.

COMMON TASKS:
  View all tables:   Servers → [app] → Databases → [db] → Schemas → public → Tables
  Run a query:       Tools → Query Tool (or Shift+Alt+Q) → type SQL → F5
  View data:         Right-click any table → View/Edit Data → All Rows
  Check connections: Dashboard → Server Activity
  Run EXPLAIN:       Query Tool → type query → Shift+F7 for visual explain plan

IF pgAdmin IS NOT LOADING:
  1. Check container is running:
       docker ps | grep pgadmin
  2. Check logs for errors:
       docker logs ${COMPOSE_PROJECT_NAME}_pgadmin
  3. If volume permissions issue:
       docker compose -f deploy/compose/{env}/docker-compose.pgadmin.yml down
       docker volume rm ${COMPOSE_PROJECT_NAME}_pgadmin_data
       docker compose -f deploy/compose/{env}/docker-compose.pgadmin.yml up -d
  4. Verify pgadmin-servers.json exists:
       ls deploy/compose/{env}/pgadmin-servers.json
  → See PGADMIN_UNREACHABLE in Phase 6.5 for more triage steps.

ROTATE pgAdmin CREDENTIALS:
  1. Update PGADMIN_EMAIL and PGADMIN_PASSWORD in .env.{env}
  2. Remove old pgAdmin data volume (credentials are baked in on first start):
       docker volume rm ${COMPOSE_PROJECT_NAME}_pgadmin_data
  3. Restart pgAdmin: docker compose -f deploy/compose/{env}/docker-compose.pgadmin.yml up -d
  Note: rotating pgAdmin credentials does NOT affect PostgreSQL. DB credentials are separate.
```

### SCENARIO 24 — Docker Hub image pipeline + Komodo deployment (NEW V15)
```
OVERVIEW:
  Dev pushes to main → GitHub Actions builds Docker image → pushes to Docker Hub
  → Komodo (or any host) pulls the image → app is live.
  No more: SSH into server → git pull → pnpm install → pnpm build → restart.

PREREQUISITES:
  1. docker.publish: true in inputs.yml (set during Phase 2 Section I)
  2. Dockerfile exists in apps/[web]/ (generated by Phase 4 Part 5)
  3. docker-publish.yml exists in .github/workflows/ (generated by Phase 4 Part 8)
  4. next.config.ts has output: 'standalone'

STEP 1 — Add secrets to your GitHub repository:
  Go to: GitHub repo → Settings → Secrets and variables → Actions → New repository secret
  Add these two secrets:
    DOCKERHUB_USERNAME   your Docker Hub username
    DOCKERHUB_TOKEN      Docker Hub access token
                         (hub.docker.com → Account Settings → Security → New Access Token)
  ⚠️ Use an access token, NOT your Docker Hub password.

STEP 2 — Push to main triggers the pipeline automatically:
  git push origin main    (or squash-merge a feature branch — Rule 23)
  GitHub Actions runs docker-publish.yml:
    → builds multi-platform image (linux/amd64 + linux/arm64)
    → pushes two tags to Docker Hub:
        yourdockerhubuser/appname:latest       ← always points to latest main
        yourdockerhubuser/appname:sha-abc1234  ← immutable per-commit tag

STEP 3 — Pull the image on your Komodo server:
  Option A — pull and run manually (simplest):
    docker pull yourdockerhubuser/appname:latest
    docker compose -f deploy/compose/prod/docker-compose.app.yml up -d

  Option B — Komodo auto-update (recommended, zero config):
    In Komodo: create a Stack → set image to yourdockerhubuser/appname:staging-latest
    Set auto_update: true on the staging Stack. Komodo polls Docker Hub for new image digests
    on a schedule and auto-redeploys when a newer :staging-latest tag is detected.
    For production: set auto_update: false. Human clicks "Deploy" in Komodo UI after verifying staging.
    See Scenario 32 for full Stack config and environment setup.

  Option C — Komodo webhook (optional, legacy path):
    In Komodo: create a Stack or Container → set image to yourdockerhubuser/appname:latest
    In GitHub Actions: add a webhook step to docker-publish.yml (see Scenario 32 Part D optional section).
    Requires KOMODO_WEBHOOK_URL + KOMODO_WEBHOOK_SECRET as GitHub Secrets.

DOCKER-COMPOSE.APP.YML TEMPLATES (NEW V22 — three distinct patterns):

  DEV (deploy/compose/dev/docker-compose.app.yml):
  Builds from source every time. Tags image locally for push.sh to use.
  ```yaml
  networks:
    app_network:
      name: ${COMPOSE_PROJECT_NAME}_network
      external: true

  services:
    app:
      build:
        context: .
        dockerfile: apps/${APP_NAME}/Dockerfile
      image: ${DOCKERHUB_USERNAME}/${IMAGE_NAME}:dev-latest  # also tags locally
      container_name: ${COMPOSE_PROJECT_NAME}_app
      hostname: ${COMPOSE_PROJECT_NAME}_app
      env_file: ../../.env.dev
      environment:
        - NODE_ENV=development
        - PORT=${APP_PORT}
      ports:
        - "${APP_PORT}:${APP_PORT}"
      networks: [app_network]
      restart: unless-stopped
      depends_on:
        postgres: { condition: service_healthy }
        valkey:   { condition: service_healthy }
      healthcheck:
        test: ["CMD", "wget", "-qO-", "http://localhost:${APP_PORT}/api/health"]
        interval: 30s
        timeout: 10s
        retries: 3
  ```

  STAGING (deploy/compose/stage/docker-compose.app.yml):
  Pulls pre-built image from Docker Hub — NEVER builds from source, NEVER clones from GitHub.
  Image must already exist on Docker Hub before this file is used.
  Tag is read from APP_IMAGE_TAG in .env.staging — Komodo sets this before pulling.
  Traffic routed via Traefik — no host port exposure on app service (V27).
  ```yaml
  networks:
    app_network:
      name: ${COMPOSE_PROJECT_NAME}_network
      external: true
    proxy:
      name: ${TRAEFIK_NETWORK:-proxy}
      external: true

  services:
    app:
      # ⚠ NO build: key — this file ONLY pulls from Docker Hub, never builds
      # Image must be pushed to Docker Hub first (push.sh staging OR GitHub Actions)
      # Tag is controlled by APP_IMAGE_TAG in .env.staging
      # Komodo / server operator sets this tag before running docker compose pull
      # Traffic routed via Traefik reverse proxy — no host port exposure (V27)
      image: ${DOCKERHUB_USERNAME}/${IMAGE_NAME}:${APP_IMAGE_TAG:-staging-latest}
      container_name: ${COMPOSE_PROJECT_NAME}_app
      hostname: ${COMPOSE_PROJECT_NAME}_app
      env_file: ../../.env.staging
      environment:
        - NODE_ENV=production
        - PORT=${APP_PORT}
      # No ports: — Traefik routes traffic via Docker internal network
      networks: [app_network, proxy]
      restart: unless-stopped
      depends_on:
        postgres: { condition: service_healthy }
        valkey:   { condition: service_healthy }
      healthcheck:
        test: ["CMD", "wget", "-qO-", "http://localhost:${APP_PORT}/api/health"]
        interval: 30s
        timeout: 10s
        retries: 3
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.${COMPOSE_PROJECT_NAME}_app.rule=Host(`${APP_DOMAIN}`)"
        - "traefik.http.routers.${COMPOSE_PROJECT_NAME}_app.entrypoints=websecure"
        - "traefik.http.routers.${COMPOSE_PROJECT_NAME}_app.tls.certresolver=letsEncrypt"
        - "traefik.http.services.${COMPOSE_PROJECT_NAME}_app.loadbalancer.server.port=3000"
  ```
  Add to .env.staging:
  ```
  APP_IMAGE_TAG=staging-latest   # or sha-abc1234 for pinned rollback target
  DOCKERHUB_USERNAME=yourusername
  IMAGE_NAME=appname

  # TRAEFIK (V27 — reverse proxy for HTTPS routing)
  TRAEFIK_NETWORK=proxy
  APP_DOMAIN=${staging_domain_from_product_md}
  ```

  PRODUCTION (deploy/compose/prod/docker-compose.app.yml):
  Pulls pre-built image from Docker Hub — NEVER builds from source, NEVER clones from GitHub.
  Image must already exist on Docker Hub before this file is used.
  Tag is read from APP_IMAGE_TAG in .env.prod — Komodo sets this before pulling.
  Traffic routed via Traefik — no host port exposure on app service (V27).
  ```yaml
  networks:
    app_network:
      name: ${COMPOSE_PROJECT_NAME}_network
      external: true
    proxy:
      name: ${TRAEFIK_NETWORK:-proxy}
      external: true

  services:
    app:
      # ⚠ NO build: key — this file ONLY pulls from Docker Hub, never builds
      # Image must be pushed to Docker Hub first (push.sh prod OR GitHub Actions → :latest)
      # Tag is controlled by APP_IMAGE_TAG in .env.prod
      # Komodo / server operator sets this tag before running docker compose pull
      # Default :latest = always the newest image pushed from main branch
      # Pin to sha-{hash} for a specific version (rollback)
      # Traffic routed via Traefik reverse proxy — no host port exposure (V27)
      image: ${DOCKERHUB_USERNAME}/${IMAGE_NAME}:${APP_IMAGE_TAG:-latest}
      container_name: ${COMPOSE_PROJECT_NAME}_app
      hostname: ${COMPOSE_PROJECT_NAME}_app
      env_file: ../../.env.prod
      environment:
        - NODE_ENV=production
        - PORT=${APP_PORT}
      # No ports: — Traefik routes traffic via Docker internal network
      networks: [app_network, proxy]
      restart: unless-stopped
      depends_on:
        postgres: { condition: service_healthy }
        valkey:   { condition: service_healthy }
      healthcheck:
        test: ["CMD", "wget", "-qO-", "http://localhost:${APP_PORT}/api/health"]
        interval: 30s
        timeout: 10s
        retries: 3
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.${COMPOSE_PROJECT_NAME}_app.rule=Host(`${APP_DOMAIN}`)"
        - "traefik.http.routers.${COMPOSE_PROJECT_NAME}_app.entrypoints=websecure"
        - "traefik.http.routers.${COMPOSE_PROJECT_NAME}_app.tls.certresolver=letsEncrypt"
        - "traefik.http.services.${COMPOSE_PROJECT_NAME}_app.loadbalancer.server.port=3000"
  ```
  Add to .env.prod:
  ```
  APP_IMAGE_TAG=latest            # or sha-abc1234 to pin to a specific version
  DOCKERHUB_USERNAME=yourusername
  IMAGE_NAME=appname

  # TRAEFIK (V27 — reverse proxy for HTTPS routing)
  TRAEFIK_NETWORK=proxy
  APP_DOMAIN=${prod_domain_from_product_md}
  ```
  ⚠ CRITICAL: No build: key anywhere in staging or prod compose files.
  These servers NEVER touch your source code. They ONLY pull pre-built images from Docker Hub.
  If you see a build: key in a staging/prod compose file → remove it immediately.

ROLLING BACK TO A PREVIOUS VERSION:
  Every push produces an immutable sha-tagged image.
  To roll back: update the image tag in .env.prod or compose file:
    image: yourdockerhubuser/appname:sha-abc1234   ← previous known-good commit
  Then restart: docker compose -f deploy/compose/prod/docker-compose.app.yml up -d

IF docker.publish: false (opted out):
  Build and deploy traditionally: git pull on server → pnpm install → pnpm build → restart.
  To enable later: set docker.publish: true in inputs.yml → Feature Update → Claude Code generates
  the Dockerfile + docker-publish.yml → add GitHub secrets → push to main → pipeline active.

SEE ALSO — MANUAL PIPELINE (NEW V22):
  This scenario = GitHub Actions auto-push from main (CI/CD path — happens automatically).
  Scenario 30  = Manual push.sh local promotion (dev→hub→staging→prod — you control the gate).
  Both push to the same Docker Hub repo. Use whichever fits your workflow:
    • GitHub Actions: automatic on merge to main — no manual steps
    • push.sh: bash deploy/compose/push.sh [dev|staging|prod] — you decide when to promote
  COMMANDS.md at project root lists all push commands for quick reference.
```


### SCENARIO 32 — Komodo deployment: staging + production with full service isolation (V23, updated V27)
```
CONTEXT:
  You already have Komodo installed and running.
  GitHub Actions builds the Docker image and pushes to Docker Hub.
  Komodo is the deployment operator: it auto-detects new images on Docker Hub (staging)
  or pulls on manual deploy (production). Both environments pull from Docker Hub.
  GitHub Actions never contacts Komodo directly (V27).

  V27 DEPLOYMENT MODEL:
  - STAGING: auto_update: true. Komodo polls Docker Hub for newer :staging-latest digests.
    When GitHub Actions pushes a new :staging-latest tag, Komodo auto-pulls and redeploys.
  - PRODUCTION: auto_update: false. Human clicks "Deploy" in Komodo UI after verifying staging.
    Komodo pulls the image from Docker Hub at that moment.
  - Docker Hub is the handoff point between CI and deployment. No webhooks needed.

  CRITICAL ISOLATION RULE:
  Staging and production MUST have completely separate Docker service groups.
  They share the same physical server (if mono-server setup) but NEVER share:
  - PostgreSQL instances (separate containers, separate volumes, separate DB names)
  - Valkey/Redis instances (separate containers, separate volumes)
  - MinIO instances (separate containers, separate volumes)
  - Docker networks (each environment has its own bridge network)
  - Container names (each prefixed with COMPOSE_PROJECT_NAME)
  This is enforced by the COMPOSE_PROJECT_NAME variable — it namespaces everything.

  The pattern that makes this work:
  COMPOSE_PROJECT_NAME=${app_slug}_staging → all staging containers: nucleus-erp_staging_postgres, etc.
  COMPOSE_PROJECT_NAME=${app_slug}_prod    → all prod containers:    nucleus-erp_prod_postgres, etc.
  Named volumes follow the same pattern:   nucleus-erp_staging_postgres_data (isolated from prod)

═══════════════════════════════════════════════════════════════════
PART A — CREDENTIALS TO ADD BEFORE SETTING UP STACKS
═══════════════════════════════════════════════════════════════════

A1 — Add Docker Hub registry to Komodo (pull credentials):
  Komodo UI → Settings → Providers → Add Docker Registry
  Domain:    docker.io
  Username:  ${DOCKERHUB_USERNAME}          ← your Docker Hub username
  Token:     ${DOCKERHUB_TOKEN}             ← Docker Hub access token (same as GitHub Secret)
  Save. Komodo uses this to pull private images on your servers.

A2 — Verify GitHub Secrets exist (Docker Hub push only — webhooks optional):
  GitHub repo → Settings → Secrets → Actions:
  DOCKERHUB_USERNAME          ← already set from V22 pipeline
  DOCKERHUB_TOKEN             ← already set from V22 pipeline
  OPTIONAL — only if using webhook deploy instead of V27 recommended auto-update model:
    KOMODO_STAGING_WEBHOOK_URL  ← get from: Komodo UI → Stacks → [staging-stack] → Config → Webhooks
    KOMODO_PROD_WEBHOOK_URL     ← get from: Komodo UI → Stacks → [prod-stack] → Config → Webhooks
    KOMODO_WEBHOOK_SECRET       ← same value as KOMODO_WEBHOOK_SECRET in your Komodo Core config
  Note: V27 recommended path needs ONLY DOCKERHUB_USERNAME + DOCKERHUB_TOKEN. No webhook secrets.

A3 — Add Komodo secrets via Variables (for shared values across Stacks):
  Komodo UI → Settings → Variables → New Variable (check "Secret")
  Add each of these as secrets (they interpolate into Stack environment via [[KEY_NAME]]):
  DOCKERHUB_USERNAME   = yourdockerhubusername
  DOCKERHUB_TOKEN      = [Docker Hub access token]
  These can then be referenced in any Stack environment as [[DOCKERHUB_USERNAME]] etc.

═══════════════════════════════════════════════════════════════════
PART B — STAGING STACK SETUP IN KOMODO
═══════════════════════════════════════════════════════════════════

B1 — Create the Staging Stack:
  Komodo UI → Stacks → New Stack
  Name:         ${app_slug}-staging          (e.g. nucleus-erp-staging)
  Server:       [your server name in Komodo]
  Run directory: /opt/stacks/${app_slug}-staging   (Komodo writes compose files here)
  auto_update:  true    ← V27: Komodo polls Docker Hub for new :staging-latest digests and auto-redeploys

B2 — Compose file for staging (paste into Komodo UI → Stack → Compose):
  This is the FULL compose file for staging — ALL services together.
  It uses COMPOSE_PROJECT_NAME to isolate from prod on the same server.
  App service uses Traefik labels for HTTPS routing — no host port exposure (V27).

  ```yaml
  # =============================================================
  # STAGING — ${APP_NAME}
  # All services in ONE compose file — isolated from prod via COMPOSE_PROJECT_NAME.
  # Image pulled from Docker Hub. NO build: key anywhere.
  # Volumes and network are prefixed with COMPOSE_PROJECT_NAME to prevent sharing.
  # App traffic routed via Traefik reverse proxy — no host port exposure (V27).
  # =============================================================

  networks:
    app_network:
      name: ${COMPOSE_PROJECT_NAME}_network
      driver: bridge
    proxy:
      name: ${TRAEFIK_NETWORK:-proxy}
      external: true

  volumes:
    postgres_data:
      name: ${COMPOSE_PROJECT_NAME}_postgres_data
    pgbouncer_data:
      name: ${COMPOSE_PROJECT_NAME}_pgbouncer_data
    valkey_data:
      name: ${COMPOSE_PROJECT_NAME}_valkey_data
    minio_data:
      name: ${COMPOSE_PROJECT_NAME}_minio_data
    pgadmin_data:
      name: ${COMPOSE_PROJECT_NAME}_pgadmin_data

  services:

    postgres:
      image: postgres:16-alpine
      container_name: ${COMPOSE_PROJECT_NAME}_postgres
      hostname: ${COMPOSE_PROJECT_NAME}_postgres
      environment:
        POSTGRES_DB: ${DB_NAME}
        POSTGRES_USER: ${DB_USER}
        POSTGRES_PASSWORD: ${DB_PASSWORD}
      volumes:
        - postgres_data:/var/lib/postgresql/data
      ports:
        - "${DB_PORT}:5432"
      networks: [app_network]
      restart: unless-stopped
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
        interval: 10s
        timeout: 5s
        retries: 5

    pgbouncer:
      image: edoburu/pgbouncer:latest
      container_name: ${COMPOSE_PROJECT_NAME}_pgbouncer
      environment:
        DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@${COMPOSE_PROJECT_NAME}_postgres:5432/${DB_NAME}
        POOL_MODE: transaction
        MAX_CLIENT_CONN: 100
        DEFAULT_POOL_SIZE: 20
        AUTH_TYPE: md5
      ports:
        - "${PGBOUNCER_PORT}:5432"
      networks: [app_network]
      depends_on:
        postgres: { condition: service_healthy }
      restart: unless-stopped

    valkey:
      image: valkey/valkey:7-alpine
      container_name: ${COMPOSE_PROJECT_NAME}_valkey
      command: valkey-server --requirepass ${REDIS_PASSWORD} --appendonly yes
      volumes:
        - valkey_data:/data
      ports:
        - "${REDIS_PORT}:6379"
      networks: [app_network]
      restart: unless-stopped
      healthcheck:
        test: ["CMD", "valkey-cli", "-a", "${REDIS_PASSWORD}", "ping"]
        interval: 10s
        timeout: 5s
        retries: 5

    minio:
      image: minio/minio:latest
      container_name: ${COMPOSE_PROJECT_NAME}_minio
      environment:
        MINIO_ROOT_USER: ${STORAGE_ACCESS_KEY}
        MINIO_ROOT_PASSWORD: ${STORAGE_SECRET_KEY}
      command: server /data --console-address ":9001"
      volumes:
        - minio_data:/data
      ports:
        - "${STORAGE_PORT}:9000"
        - "${STORAGE_CONSOLE_PORT}:9001"
      networks: [app_network]
      restart: unless-stopped
      healthcheck:
        test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
        interval: 30s
        timeout: 10s
        retries: 3

    pgadmin:
      image: dpage/pgadmin4:latest
      container_name: ${COMPOSE_PROJECT_NAME}_pgadmin
      environment:
        PGADMIN_DEFAULT_EMAIL: ${PGADMIN_EMAIL}
        PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_PASSWORD}
        PGADMIN_CONFIG_SERVER_MODE: "False"
        PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED: "False"
      volumes:
        - pgadmin_data:/var/lib/pgadmin
      ports:
        - "${PGADMIN_PORT}:80"
      networks: [app_network]
      depends_on: [postgres]
      restart: unless-stopped

    app:
      # ⚠ NO build: key — image pulled from Docker Hub only
      # Traffic routed via Traefik reverse proxy — no host port exposure (V27)
      image: ${DOCKERHUB_USERNAME}/${IMAGE_NAME}:${APP_IMAGE_TAG:-staging-latest}
      container_name: ${COMPOSE_PROJECT_NAME}_app
      hostname: ${COMPOSE_PROJECT_NAME}_app
      environment:
        NODE_ENV: production
        PORT: "3000"
        DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@${COMPOSE_PROJECT_NAME}_pgbouncer:5432/${DB_NAME}
        REDIS_URL: redis://:${REDIS_PASSWORD}@${COMPOSE_PROJECT_NAME}_valkey:6379
        NEXTAUTH_URL: ${NEXTAUTH_URL}
        AUTH_SECRET: ${AUTH_SECRET}
        STORAGE_ENDPOINT: http://${COMPOSE_PROJECT_NAME}_minio:9000
        STORAGE_BUCKET: ${STORAGE_BUCKET}
        STORAGE_ACCESS_KEY: ${STORAGE_ACCESS_KEY}
        STORAGE_SECRET_KEY: ${STORAGE_SECRET_KEY}
        STORAGE_REGION: ${STORAGE_REGION}
      # No ports: — Traefik routes traffic via Docker internal network
      networks: [app_network, proxy]
      restart: unless-stopped
      depends_on:
        postgres: { condition: service_healthy }
        valkey:   { condition: service_healthy }
      healthcheck:
        test: ["CMD", "wget", "-qO-", "http://localhost:${APP_PORT}/api/health"]
        interval: 30s
        timeout: 10s
        retries: 3
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.${COMPOSE_PROJECT_NAME}_app.rule=Host(`${APP_DOMAIN}`)"
        - "traefik.http.routers.${COMPOSE_PROJECT_NAME}_app.entrypoints=websecure"
        - "traefik.http.routers.${COMPOSE_PROJECT_NAME}_app.tls.certresolver=letsEncrypt"
        - "traefik.http.services.${COMPOSE_PROJECT_NAME}_app.loadbalancer.server.port=3000"
  ```

  NOTE ON NETWORKING: Services talk to each other via container hostname
  (e.g. app connects to pgbouncer via ${COMPOSE_PROJECT_NAME}_pgbouncer:5432).
  This is the Docker internal network — no port exposure needed between services.
  App service also joins the Traefik external network (proxy) for HTTPS routing.

B3 — Staging environment variables (paste into Komodo UI → Stack → Environment):
  Komodo writes these to a .env file and passes via --env-file.
  Use [[SECRET_NAME]] to interpolate Komodo global secrets.

  ```
  # ═══════════════════════════════════════════════════
  # STAGING — ${APP_NAME}
  # COMPOSE_PROJECT_NAME isolates ALL services from prod.
  # Named volumes: ${app_slug}_staging_postgres_data etc.
  # ═══════════════════════════════════════════════════
  COMPOSE_PROJECT_NAME=${app_slug}_staging
  APP_ENV=staging
  APP_PORT=3000              ← internal container port (not exposed to host — Traefik routes traffic)

  # DOCKER HUB IMAGE
  DOCKERHUB_USERNAME=[[DOCKERHUB_USERNAME]]
  IMAGE_NAME=${docker.image_name}
  APP_IMAGE_TAG=staging-latest

  # TRAEFIK (V27 — reverse proxy for HTTPS routing)
  TRAEFIK_NETWORK=proxy
  APP_DOMAIN=${staging_domain_from_product_md}

  # DATABASE (isolated — never shared with prod)
  DB_HOST=${app_slug}_staging_postgres
  DB_PORT=5433               ← different port if staging/prod on same server
  DB_NAME=${app_slug}_staging
  DB_USER=${app_slug}_staging
  DB_PASSWORD=<generated-strong-32-char>
  DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${COMPOSE_PROJECT_NAME}_postgres:5432/${DB_NAME}

  # PGBOUNCER
  PGBOUNCER_PORT=6433        ← different port if same server
  PGBOUNCER_AUTH_PASSWORD=<generated-strong-32-char>
  PGBOUNCER_DATABASE_URL=postgresql://${DB_USER}:${PGBOUNCER_AUTH_PASSWORD}@${COMPOSE_PROJECT_NAME}_pgbouncer:5432/${DB_NAME}

  # VALKEY / CACHE (isolated)
  REDIS_HOST=${app_slug}_staging_valkey
  REDIS_PORT=6380            ← different port if same server
  REDIS_PASSWORD=<generated-strong-32-char>
  REDIS_URL=redis://:${REDIS_PASSWORD}@${COMPOSE_PROJECT_NAME}_valkey:6379

  # MINIO / STORAGE (isolated)
  STORAGE_PORT=9010          ← different port if same server
  STORAGE_CONSOLE_PORT=9011
  STORAGE_ENDPOINT=http://localhost:9010
  STORAGE_BUCKET=${app_slug}-staging
  STORAGE_ACCESS_KEY=<generated-hex-16>
  STORAGE_SECRET_KEY=<generated-strong-32-char>
  STORAGE_REGION=us-east-1

  # PGADMIN (isolated)
  PGADMIN_PORT=5051          ← different port if same server
  PGADMIN_EMAIL=staging-admin@${app_slug}.local
  PGADMIN_PASSWORD=<generated-strong-32-char>

  # AUTH
  AUTH_SECRET=<generated-48-char>
  NEXTAUTH_URL=https://${staging_domain_from_product_md}

  # EMAIL
  SMTP_HOST=smtp.yourdomain.com
  SMTP_PORT=587
  SMTP_USER=noreply@${staging_domain_from_product_md}
  SMTP_PASSWORD=<smtp-password>
  SMTP_FROM=noreply@${staging_domain_from_product_md}
  ```

  ⚠ PORT RULE: If staging and production run on the SAME server,
  every port must be different between them. Use the offset pattern:
  Staging ports start 1 higher or use a different range (e.g. staging DB=5433, prod DB=5432).
  Note: APP_PORT is no longer exposed to the host — Traefik handles routing — but backing
  service ports (DB, Valkey, MinIO, pgAdmin) still need unique host ports if on same server.

═══════════════════════════════════════════════════════════════════
PART C — PRODUCTION STACK SETUP IN KOMODO
═══════════════════════════════════════════════════════════════════

C1 — Create the Production Stack:
  Komodo UI → Stacks → New Stack
  Name:         ${app_slug}-prod             (e.g. nucleus-erp-prod)
  Server:       [your server name in Komodo]
  Run directory: /opt/stacks/${app_slug}-prod
  auto_update:  false   ← NEVER auto-update prod. Human clicks Deploy in Komodo UI after verifying staging.

C2 — Compose file for production (paste into Komodo UI → Stack → Compose):
  IDENTICAL structure to staging compose — same service definitions, same Traefik labels.
  The ONLY difference is COMPOSE_PROJECT_NAME (${app_slug}_prod) which namespaces everything.
  Copy the staging compose exactly and change nothing else — the env vars do the rest.

  ```yaml
  # Production compose is identical to staging compose above.
  # COMPOSE_PROJECT_NAME=${app_slug}_prod makes all containers, volumes,
  # and networks completely independent of staging.
  # Example result:
  #   nucleus-erp_prod_postgres   (different container than nucleus-erp_staging_postgres)
  #   nucleus-erp_prod_postgres_data (different volume than nucleus-erp_staging_postgres_data)
  #   nucleus-erp_prod_network    (different network than nucleus-erp_staging_network)
  #   App connects to: nucleus-erp_prod_pgbouncer:5432 (never talks to staging's pgbouncer)
  #   Traefik routes traffic via APP_DOMAIN env var (prod domain, not staging domain)
  ```

  Paste the exact same compose YAML from B2 — no modifications.
  The environment variables in C3 handle all environment-specific values.

C3 — Production environment variables (paste into Komodo UI → Stack → Environment):

  ```
  # ═══════════════════════════════════════════════════
  # PRODUCTION — ${APP_NAME}
  # COMPOSE_PROJECT_NAME isolates ALL services from staging.
  # Named volumes: ${app_slug}_prod_postgres_data etc.
  # ═══════════════════════════════════════════════════
  COMPOSE_PROJECT_NAME=${app_slug}_prod
  APP_ENV=production
  APP_PORT=3000              ← internal container port (not exposed to host — Traefik routes traffic)

  # DOCKER HUB IMAGE
  DOCKERHUB_USERNAME=[[DOCKERHUB_USERNAME]]
  IMAGE_NAME=${docker.image_name}
  APP_IMAGE_TAG=latest       ← prod always pulls :latest from Docker Hub

  # TRAEFIK (V27 — reverse proxy for HTTPS routing)
  TRAEFIK_NETWORK=proxy
  APP_DOMAIN=${prod_domain_from_product_md}

  # DATABASE (isolated — never shared with staging)
  DB_HOST=${app_slug}_prod_postgres
  DB_PORT=5432               ← standard port on prod
  DB_NAME=${app_slug}_prod
  DB_USER=${app_slug}_prod
  DB_PASSWORD=<generated-strong-32-char — DIFFERENT from staging>
  DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${COMPOSE_PROJECT_NAME}_postgres:5432/${DB_NAME}

  # PGBOUNCER
  PGBOUNCER_PORT=6432
  PGBOUNCER_AUTH_PASSWORD=<generated-strong-32-char — DIFFERENT from staging>
  PGBOUNCER_DATABASE_URL=postgresql://${DB_USER}:${PGBOUNCER_AUTH_PASSWORD}@${COMPOSE_PROJECT_NAME}_pgbouncer:5432/${DB_NAME}

  # VALKEY / CACHE (isolated)
  REDIS_HOST=${app_slug}_prod_valkey
  REDIS_PORT=6379
  REDIS_PASSWORD=<generated-strong-32-char — DIFFERENT from staging>
  REDIS_URL=redis://:${REDIS_PASSWORD}@${COMPOSE_PROJECT_NAME}_valkey:6379

  # MINIO / STORAGE (isolated)
  STORAGE_PORT=9000
  STORAGE_CONSOLE_PORT=9001
  STORAGE_ENDPOINT=http://localhost:9000
  STORAGE_BUCKET=${app_slug}-prod
  STORAGE_ACCESS_KEY=<generated-hex-16 — DIFFERENT from staging>
  STORAGE_SECRET_KEY=<generated-strong-32-char — DIFFERENT from staging>
  STORAGE_REGION=us-east-1

  # PGADMIN (isolated)
  PGADMIN_PORT=5050
  PGADMIN_EMAIL=admin@yourdomain.com
  PGADMIN_PASSWORD=<generated-strong-32-char — DIFFERENT from staging>

  # AUTH
  AUTH_SECRET=<generated-48-char — DIFFERENT from staging>
  NEXTAUTH_URL=https://${prod_domain_from_product_md}

  # EMAIL
  SMTP_HOST=smtp.yourdomain.com
  SMTP_PORT=587
  SMTP_USER=noreply@${prod_domain_from_product_md}
  SMTP_PASSWORD=<smtp-password>
  SMTP_FROM=noreply@${prod_domain_from_product_md}
  ```

  ⚠ EVERY secret (DB_PASSWORD, REDIS_PASSWORD, AUTH_SECRET, etc.) MUST be different
  between staging and prod. Never reuse the same value across environments.
  Generate separately: openssl rand -base64 32 per environment per credential.

═══════════════════════════════════════════════════════════════════
PART D — V27 DEPLOYMENT FLOW (AUTO-UPDATE + MANUAL DEPLOY)
═══════════════════════════════════════════════════════════════════

D1 — GitHub Actions pushes images to Docker Hub (automatic on every merge to main):
  docker-publish.yml builds a multi-platform image and pushes three tags:
    :staging-latest    ← Komodo staging auto-update watches this tag
    :latest            ← used for manual production deploy from Komodo UI
    :sha-{short-hash}  ← immutable per-commit tag for pinned rollback
  GitHub Actions NEVER contacts Komodo directly. Docker Hub is the handoff point.

D2 — Komodo staging auto-detects new :staging-latest → auto-redeploys:
  Komodo's auto_update: true on the staging Stack polls Docker Hub on a schedule.
  When a newer digest for :staging-latest is detected, Komodo:
    → runs docker compose pull (gets new :staging-latest image)
    → runs docker compose up -d (restarts only the app container)
    → DB, Valkey, MinIO, pgAdmin are untouched — only the app image changes
  No webhook, no curl, no GitHub Secret needed.
  Reference: https://komo.do/docs/deploy/auto-update

D3 — Human verifies staging → manually deploys to production:
  1. Verify staging at https://${staging_domain_from_product_md}
  2. If staging is stable: go to Komodo UI → Stacks → ${app_slug}-prod → click "Deploy"
  3. Komodo pulls :latest (or :sha-{hash} if APP_IMAGE_TAG was changed) from Docker Hub
  4. App container restarts with new image. All backing services unchanged.
  Production NEVER auto-deploys. This is a security decision.

D4 — (OPTIONAL) If you prefer webhook-triggered deploys instead:
  This is the legacy path — still supported but not recommended for V27.

  Get webhook URLs (after creating Stacks in Parts B and C):
    Komodo UI → Stacks → ${app_slug}-staging → Config → Webhooks → Copy URL
    Komodo UI → Stacks → ${app_slug}-prod    → Config → Webhooks → Copy URL
    Format: https://[komodo-host]/listener/github/stack/[stack-name]/deploy

  Add GitHub Secrets:
    KOMODO_STAGING_WEBHOOK_URL = [staging webhook URL]
    KOMODO_PROD_WEBHOOK_URL    = [prod webhook URL]
    KOMODO_WEBHOOK_SECRET      = [same as KOMODO_WEBHOOK_SECRET in your Komodo Core config]

  Add webhook step to .github/workflows/docker-publish.yml after the "Build and push" step:
  ```yaml
  - name: Trigger Komodo staging redeploy
    if: github.ref == 'refs/heads/main'
    run: |
      PAYLOAD='{}'
      SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 \
        -hmac "${{ secrets.KOMODO_WEBHOOK_SECRET }}" | sed 's/.*= //')
      curl -X POST "${{ secrets.KOMODO_STAGING_WEBHOOK_URL }}" \
        -H "Content-Type: application/json" \
        -H "X-Hub-Signature-256: sha256=${SIGNATURE}" \
        -d "$PAYLOAD"
  ```
  Production webhook: add a separate job gated on manual approval or only trigger
  after push.sh prod is run (prod deploy is never automatic — Rule: never auto-deploy prod).
  Reference: https://komo.do/docs/automate/webhooks

═══════════════════════════════════════════════════════════════════
PART E — SERVICE ISOLATION VERIFICATION CHECKLIST
═══════════════════════════════════════════════════════════════════

Run on your server after first deploy of both environments:

  docker ps --format "table {{.Names}}	{{.Ports}}	{{.Status}}"
  Expected output (no shared names — app has no host port, backing services have unique ports):
  ${app_slug}_staging_postgres    0.0.0.0:5433->5432/tcp    Up
  ${app_slug}_staging_valkey      0.0.0.0:6380->6379/tcp    Up
  ${app_slug}_staging_minio       0.0.0.0:9010->9000/tcp    Up
  ${app_slug}_staging_app         3000/tcp                  Up    ← no host port (Traefik routes)
  ${app_slug}_prod_postgres       0.0.0.0:5432->5432/tcp    Up
  ${app_slug}_prod_valkey         0.0.0.0:6379->6379/tcp    Up
  ${app_slug}_prod_minio          0.0.0.0:9000->9000/tcp    Up
  ${app_slug}_prod_app            3000/tcp                  Up    ← no host port (Traefik routes)

  Verify app is reachable through Traefik:
  curl -sI https://${staging_domain_from_product_md} | head -5
  curl -sI https://${prod_domain_from_product_md} | head -5
  Expected: HTTP/2 200 (or 301 redirect if app has one)

  docker volume ls | grep ${app_slug}
  Expected: _staging_ and _prod_ volumes are separate — NEVER the same volume.

  docker network ls | grep ${app_slug}
  Expected: ${app_slug}_staging_network and ${app_slug}_prod_network — separate networks.
  Both app containers also appear on the Traefik proxy network.

  ⚠ If you see a staging container connected to a prod network → STOP IMMEDIATELY.
  The COMPOSE_PROJECT_NAME variable is not set correctly on one of the Stacks.

═══════════════════════════════════════════════════════════════════
PART F — ROLLBACK
═══════════════════════════════════════════════════════════════════

  Via Komodo UI (fastest — no SSH, no git):
  Stacks → ${app_slug}-prod → Environment → change APP_IMAGE_TAG=latest → sha-abc1234
  Click Deploy → Komodo pulls pinned sha tag → restarts only the app container
  DB, Valkey, MinIO are untouched — only the app image changes.

  Via terminal (on server):
  docker compose -f /opt/stacks/${app_slug}-prod/compose.yaml pull
  docker compose -f /opt/stacks/${app_slug}-prod/compose.yaml up -d

═══════════════════════════════════════════════════════════════════
PART G — TRAEFIK REFERENCE (V27)
═══════════════════════════════════════════════════════════════════

  PREREQUISITE: Traefik must already be running on your server as a reverse proxy.
  Traefik handles TLS termination (Let's Encrypt auto-certs) and routes traffic to containers.

  Default external network name: proxy (locked decision: TRAEFIK_NETWORK=proxy)
  If your Traefik uses a different network name, update TRAEFIK_NETWORK in both env configs.

  Traefik labels on the app service:
    traefik.enable=true                              — register this container with Traefik
    traefik.http.routers.*.rule=Host(`${APP_DOMAIN}`) — match incoming hostname
    traefik.http.routers.*.entrypoints=websecure     — HTTPS only (port 443)
    traefik.http.routers.*.tls.certresolver=letsEncrypt — auto-issue TLS cert
    traefik.http.services.*.loadbalancer.server.port=3000 — container listens on 3000

  Dev compose is UNCHANGED — no Traefik in local dev (Docker Desktop + direct port access).

  Traefik documentation: https://doc.traefik.io/traefik/
  Komodo auto-update docs: https://komo.do/docs/deploy/auto-update
  Komodo Stack config: https://komo.do/docs/deploy/compose
  Komodo Procedures: https://komo.do/docs/automate/procedures

SEE ALSO:
  Scenario 24: GitHub Actions CI build pipeline (builds + pushes to Docker Hub)
  Scenario 30: Manual push.sh promotion (dev → staging → prod without Komodo)
  CREDENTIALS.md: all Komodo secrets, stack webhook URLs, and service passwords documented there
  komo.do/docs/deploy/compose: Komodo Stack configuration reference
  komo.do/docs/configuration/variables: Komodo Variables and Secrets
```

---

### What "attach 9 docs" means

```
1. docs/PRODUCT.md              ← only file you ever edit
2. inputs.yml
3. inputs.schema.json
4. docs/CHANGELOG_AI.md
5. docs/DECISIONS_LOG.md
6. docs/IMPLEMENTATION_MAP.md
7. project.memory.md
8. .cline/memory/lessons.md     ← read first, Rule 18 typed format
9. .cline/memory/agent-log.md
```

Claude Code: reads all 9 automatically from filesystem. No attachment needed.
Copilot: click 📎 → attach all 9 → send.
Session Resume: only needs 3 (project.memory.md + IMPLEMENTATION_MAP.md + DECISIONS_LOG.md).

---

### Tool Setup Guide

**Claude Code** — planning (Phase 2)
Auto-loads CLAUDE.md. No pasting. Use for PRODUCT.md updates, Phase 2 interview, Session Resume.

**Claude Code** — building (Phase 3-8, Part by Part in fresh sessions)
Auto-loads CLAUDE.md. Reads STATE.md first (Rule 24), then 9 docs (lessons.md first, Rule 18 order).
(.clinerules is generated by Bootstrap Step 3 for historical parity but unused in active V31 work.)
Each Phase 4 Part runs in a fresh session. Feature Updates: branch → build → two-stage review → merge.
Writes lessons.md in Rule 18 typed format after every error resolved or decision locked.
Model routing (V31 — locked in inputs.yml):
```
PRIMARY: Claude Sonnet 4.6 via Claude Code       ★ All phases. Primary execution model.
GOVERNANCE: gemini-2.5-flash-lite                 (CHANGELOG_AI, agent-log, STATE.md — cheapest)

Budget alternatives are controlled via inputs.yml model routing.
See AI_Tools_Skills_MCPs_Reference_v31.md for full model list and routing rules.
```
V31 model routing (locked in inputs.yml):
  planning:   claude-code (Phase 2 — V31 primary)
  execution:  claude-sonnet-4-6 via Claude Code (V31 primary; Cline deprecated)
  governance: gemini-2.5-flash-lite (non-critical doc writes — cheapest)

**GitHub Copilot** — inline autocomplete + handoff fallback
Always-on ghost text while typing. Changes attributed via SpecStory capture (Rule 19).
For larger Copilot Chat edits: follow up with "Feature Update" in Claude Code to apply governance.
PR reviews on GitHub.

**SpecStory** — passive change capture layer (NEW elevated role in V11)
Install the SpecStory VS Code extension — zero config needed after Bootstrap.
Bootstrap writes `.specstory/specs/v31-master-prompt.md` and `.specstory/config.json`.
Auto-captures every Claude Code session to `.specstory/history/`.
Captures Copilot inline edits via file-change diffs.
Powers Governance Sync attribution reconciliation (Scenarios 17 + 18).
`.specstory/history/` is append-only — never delete entries.

**code-review-graph** — structural blast-radius MCP server (NEW V13)
Install once per machine (not per project): `claude plugin add tirth8205/code-review-graph`
Prerequisites: Python 3.10+ · uv package manager · Claude Code CLI.
Per project (after Phase 6): `code-review-graph build` from WSL2 terminal.
Daily: `code-review-graph watch` in background terminal to keep graph live.
Claude Code auto-calls `get_impact_radius_tool` + `get_review_context_tool` during Phase 7.
Dev/Test machine only — not staging or production. See Scenario 21 for full usage.

**Context7** — live library documentation MCP (NEW V23 — Rule 30)
Auto-installed in `.vscode/mcp.json` by Bootstrap Step 10. No Docker needed. Free. No API key.
Prevents hallucinated deprecated APIs by fetching current version-specific docs from source repos.
Two MCP tools: `resolve-library-id` + `query-docs`.
Usage: append "use context7" to any Claude Code task that involves external library code.
Covers full stack: Next.js, Prisma, Auth.js v5, tRPC, shadcn/ui, BullMQ, Expo, WatermelonDB, Valkey.
See Rule 30 + Scenario 31 for full usage guide and worked examples.

**Log Lesson (scripts/log-lesson.sh)** — human quick-log for personal discoveries
Trigger: VS Code Command Palette → "Tasks: Run Task" → "Log Lesson" (or `bash scripts/log-lesson.sh`)
Written by Bootstrap (Step 15) to `scripts/log-lesson.sh` + `.vscode/tasks.json`.
5-question interactive prompt → appends correctly formatted Rule 18 entry to `.cline/memory/lessons.md`.
Use when you personally discover something before Claude Code encounters it.
Never write free-form text to lessons.md — always use this script or let Claude Code write it.

**UI UX Pro Max** — design intelligence skill (NEW V12)
Install in Claude Code: `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`
Requires Python 3. Runs via `.claude/skills/` — not a project dependency.
Provides: 161 industry rules, 67 UI styles, 161 color palettes, 57 font pairings, 99 UX guidelines.
Generates `design-system/MASTER.md` during Phase 2.6 and page overrides on demand.
Claude Code reads MASTER.md automatically before every UI Feature Update (Rule 21).
Fully optional — framework works identically without it (graceful degradation).

**SocratiCode** — codebase intelligence MCP (V10)
Installed automatically by Bootstrap (Phase 0) via `.vscode/mcp.json`.
Zero config — runs via `npx -y socraticode`. Requires Docker.
First use auto-pulls Qdrant + Ollama containers (~5 min one-time setup).
Provides 21 MCP tools: codebase_search, codebase_graph_query, codebase_context_search, etc.
Benchmarked: 61% less context, 84% fewer tool calls, 37x faster than grep.

**.github/skills/ — cross-agent skill standard (NEW V19)**
Bootstrap Step 17 creates `.github/skills/spec-driven-core/SKILL.md` — a compact rules card
readable by Claude Code, GitHub Copilot, and VS Code equally. (Cline deprecated V31 — retained for historical reference only. No execution routing uses it.)
Optional domain packs install via `/plugin install [pack]@spec-driven-plugins` or manually.
Agents scan `.github/skills/` at every task start. Load full SKILL.md only when description matches.
Never load all skills at once — contextual loading keeps context lean for all models (V31: Claude Sonnet 4.6).
See Scenario 27 for full install, verification, and custom skill authoring guide.

**The filesystem is the shared brain.**
Claude Code, Copilot, SocratiCode, and SpecStory all communicate through
the 9 governance files. SocratiCode adds a searchable semantic layer.
SpecStory adds a passive diff-capture layer that bridges the attribution gap.
(Cline deprecated V31 — no longer part of active coordination layer.)

---

### SCENARIO 33 — DESIGN.md Integration with shadcn/ui (NEW)
```
CONTEXT:
  Project has docs/DESIGN.md created via Planning Assistant prompt 4.8.
  This file contains 4 visual sections extracted from awesome-design-md:
  Visual Theme & Atmosphere, Color Palette, Typography Rules, Layout Principles.
  Source: VoltAgent/awesome-design-md (MIT licensed) or getdesign.md.

FILE LOCATION:
  docs/DESIGN.md                   — authoritative visual reference (primary)
  docs/PRODUCT.md Section 10       — one-line reference pointing to docs/DESIGN.md
  Source of truth: docs/DESIGN.md holds the content. PRODUCT.md just points to it.

WHEN TO READ docs/DESIGN.md:
  CONDITIONAL — only when the current task touches UI:
  - Phase 4 UI scaffolding Parts that create src/components, src/app, packages/ui
  - Phase 7 Feature Updates that add or modify visible UI
  - Phase 2.6 if design-system/MASTER.md generation references visual tokens
  SKIP if: backend-only change, tRPC-only change, packages/db only.

PRECEDENCE ORDER (when multiple design sources exist):
  1. docs/PRODUCT.md (spec authority — any UI requirement in PRODUCT.md wins)
  2. docs/DESIGN.md (visual reference — colors, typography, layout density, atmosphere)
  3. design-system/MASTER.md (if present — Phase 2.6 output; project-specific)
  4. shadcn/ui defaults (component implementation — ALWAYS)

WHAT AGENTS DO WITH docs/DESIGN.md:

  A. Color Palette → globals.css CSS custom properties
     Map the palette into shadcn/ui's CSS variable system. Example (Linear):
       :root {
         --background: 222 18% 7%;      /* Linear deep navy */
         --foreground: 220 13% 91%;     /* Near-white text */
         --primary: 251 91% 65%;        /* Linear purple accent */
         --muted: 218 14% 15%;
         --border: 218 14% 20%;
         --ring: 251 91% 65%;
       }
     These drive shadcn/ui's entire color system via CSS variables.
     Convert hex to HSL for shadcn compatibility.

  B. Typography Rules → apps/[app]/src/app/layout.tsx
     - Import the specified font via next/font/google or next/font/local
     - Apply font family to <html> className
     - Set weights, letter-spacing, line-height per DESIGN.md values
     - Do NOT override shadcn/ui's default typography utilities —
       extend them via Tailwind config

  C. Layout Principles → Tailwind config + component composition
     - Spacing scale: match Tailwind's 4px base or override if DESIGN.md differs
     - Grid patterns: use shadcn/ui's existing grid primitives
     - Whitespace philosophy: reflect in default padding/margin choices
     - Container widths: adjust shadcn Container widths to match DESIGN.md

  D. Visual Theme & Atmosphere → aesthetic guidance for variant choices
     - Informs component variants (ghost vs solid, rounded vs sharp, bordered vs filled)
     - Informs default radius (--radius CSS variable)
     - Component STRUCTURE stays shadcn/ui default

WHAT AGENTS DO NOT DO WITH docs/DESIGN.md:
  ❌ NEVER replace shadcn/ui components with custom implementations to match
     the source aesthetic. Every component still comes from shadcn@latest add.
  ❌ NEVER copy CSS verbatim from the source website (linear.app, stripe.com, etc.).
     Use the DESIGN.md extracted values only — those are MIT licensed via
     VoltAgent/awesome-design-md.
  ❌ NEVER reproduce the source website's layout pixel-for-pixel. This is
     inspiration, not replication.
  ❌ NEVER override the 10 UI Component Rules (ui-rules.md) to match the source.
     shadcn/ui wins on component behavior.

CONFLICT RESOLUTION:
  IF DESIGN.md implies "use custom component X" AND shadcn/ui has no equivalent:
    → Implement with shadcn/ui primitives (Card + Button + Input) styled to
      approximate the aesthetic. Document deviation in DECISIONS_LOG.md.

  IF DESIGN.md color values produce poor contrast (WCAG AA failure):
    → Adjust values to meet AA minimum. Flag adjustment in CHANGELOG_AI.md
      entry with attribution and WCAG ratio before/after.

  IF DESIGN.md specifies a font not on Google Fonts or any public CDN:
    → Substitute the closest Google Fonts alternative. Note substitution
      in DECISIONS_LOG.md with both names (original vs substitute).

  IF DESIGN.md specifies custom CSS animations:
    → Implement only if trivial (opacity/transform). Skip complex animations
      that would require additional dependencies (e.g., GSAP, Framer Motion)
      unless already in package.json.

LEGAL POSTURE:
  - awesome-design-md is MIT licensed.
  - Extracted tokens (colors, fonts, spacing values) are publicly visible CSS
    values from the source websites. Adopting the aesthetic via these tokens
    is permissible.
  - DO NOT clone the source website's exact visual layout, logo, or branded
    imagery. This is inspiration, not appropriation.
  - DO NOT use the source website's brand name in marketing copy ("Linear-style"
    is OK as internal docs; never shipped in user-facing content).

RECOMMENDED SHORTLIST FOR ENTERPRISE SAAS (V31 context):
  These 7 aesthetics translate best to Bonito's business app context
  (ERP, marine ops, inventory management):
    - Linear    — project management, purple accent, ultra-minimal
    - Stripe    — payment infra, purple gradients, weight-300 elegance
    - Vercel    — black/white precision, Geist font, stark clarity
    - Supabase  — dark emerald, code-first, developer-friendly
    - Notion    — warm minimalism, serif headings, soft surfaces
    - Sentry    — data-dense dashboard, pink-purple accent
    - Claude    — warm terracotta, editorial clean, trust-signal neutral

  Skip for business apps: Ferrari, Lamborghini, Bugatti, Nike, WIRED,
  Pinterest, PlayStation, SpaceX, The Verge — aesthetically strong but
  mismatched with enterprise SaaS domain.
```

---

### SCENARIO 34 — CREDENTIALS.md Format Upgrade (Agent-Proof) (NEW)
```
CONTEXT:
  Framework version upgrade (e.g. V30 → V31) requires CREDENTIALS.md to adopt
  a new format — adding the "🚨 FILL THESE IN BEFORE PHASE 5" header block,
  new sections, or ⏳ placeholder markers.

PROBLEM:
  Claude Code CORRECTLY refuses to read CREDENTIALS.md back into AI context.
  Security rules (priority 2 in the H1 ladder) override user messages (priority 8):
    "CREDENTIALS.md is for human eyes only — agents write it, never read it back into context."
    "NEVER read CREDENTIALS.md into context, tool calls, logs, or governance docs."
  This means reconciliation prompt 1.4.3 CANNOT ask Claude Code to "show diff
  before write" on CREDENTIALS.md — the diff would require reading credential
  values into context.

SOLUTION:
  Use a local shell script that runs entirely in the human's terminal.
  The script never enters AI context. It:
  1. Backs up the current file as CREDENTIALS.md.pre-v31.bak
  2. Inserts the V31 header block before the first ## section
  3. Checks each V31-required section header (grep on header text only)
  4. Adds stub sections with ⏳ placeholders ONLY for sections that are missing
  5. Shows a diff in the terminal for human review
  6. Never reads, echoes, or processes any credential value

  Script: upgrade-credentials-v31.sh (generated by Planning Assistant or provided
  with the framework version upgrade kit).

AGENT BEHAVIOR:
  IF a reconciliation prompt or 1.4.3 fix targets CREDENTIALS.md format:
    → DO NOT attempt to read, diff, or modify CREDENTIALS.md directly
    → Generate a shell script that performs the format upgrade locally
    → Output the script to the project root
    → Tell the human: "Run `bash upgrade-credentials-v31.sh` in your terminal.
      Review the diff. Delete the backup when confirmed."
    → Mark the 1.4.3 item as DONE (method: local script)

  This pattern applies to ANY future version upgrade that touches CREDENTIALS.md
  format — not just V31. The script name should match the target version
  (e.g. upgrade-credentials-v32.sh).

WHAT THIS IS NOT:
  - Not a bypass of the security rules — the rules are correct and stay enforced
  - Not a special permission for agents to read CREDENTIALS.md "just this once"
  - Not a workaround — it is the intended upgrade path for credential files
```

---

### File Ownership Reference

```
docs/PRODUCT.md              HUMAN    Only file humans ever edit
CLAUDE.md                    HUMAN    Copy of master prompt
.claude/settings.json        HUMAN    Claude Code project settings
.clinerules                  HUMAN    Cline configuration (⚠ deprecated V31 — file still generated for historical parity but unused)
.cline/tasks/*.md            AGENT    Phase 4 task files (folder name preserved for historical continuity)
.vscode/mcp.json             HUMAN    MCP server config (SocratiCode entry)
.cline/STATE.md              AGENT    Rewritten after every task — never edit manually
.gitignore                   AGENT    Written at Bootstrap Step 16+17 — add entries via Feature Update

inputs.yml                   AGENT    Never edit manually
inputs.schema.json           AGENT    Never edit manually
docs/CHANGELOG_AI.md         AGENT    Never edit manually (Rule 15)
docs/DECISIONS_LOG.md        AGENT    Never edit manually
docs/IMPLEMENTATION_MAP.md   AGENT    Never edit manually
project.memory.md            AGENT    Never edit manually
.socraticodecontextartifacts.json  AGENT  Never edit manually

.cline/memory/lessons.md     AGENT    Rule 18 typed format — never edit manually
.cline/memory/agent-log.md   AGENT    Claude Code primary writer; others via attribution layer — never edit manually
.cline/handoffs/*.md         AGENT    Written when agent is stuck — read and act on these

.specstory/specs/            HUMAN    Master prompt copy written by Bootstrap
.specstory/history/          SYSTEM   SpecStory passive capture — append-only, never delete
.specstory/config.json       HUMAN    Written by Bootstrap — do not edit

scripts/log-lesson.sh        HUMAN    Run to log personal discoveries to lessons.md — never edit the output directly
.vscode/tasks.json           HUMAN    VS Code task runner — "Log Lesson" task written by Bootstrap
.code-review-graph/          GITIGNORE Machine-local SQLite graph — never commit. Rebuilt via code-review-graph build
CREDENTIALS.md               AGENT/GITIGNORE  Generated by Phase 3. Contains ALL credentials for ALL environments. NEVER COMMIT. NEVER READ BACK INTO CONTEXT.
.code-review-graphignore     HUMAN    Exclude generated/vendor files from graph parsing

.github/skills/spec-driven-core/SKILL.md  AGENT    Written by Bootstrap Step 17. Never edit manually.
.github/skills/[user-installed]/           HUMAN    Installed via /plugin install or manual copy. Agents load contextually.
.github/skills/.gitkeep                    AGENT    Keeps directory tracked in git. Never delete.

design-system/MASTER.md      AGENT    Generated by Phase 2.6 — never edit manually
design-system/pages/*.md     AGENT    Page-specific design overrides — never edit manually
docs/DESIGN.md               AGENT    Generated by Planning Assistant prompt 4.8 — holds extracted DESIGN.md aesthetic (Visual Theme + Color Palette + Typography + Layout). Regenerate by re-running prompt 4.8 with a different source design. See Scenario 33.

README.md                    AGENT    Generated by Phase 8 when PRODUCT.md fully implemented
apps/**                      AGENT    Edit via PRODUCT.md → Phase 7
packages/**                  AGENT    Edit via PRODUCT.md → Phase 7
tools/**                     AGENT    Edit via PRODUCT.md → Phase 7
deploy/**                    AGENT    Edit via PRODUCT.md → Phase 7
.github/**                   AGENT    Edit via PRODUCT.md → Phase 7
```

---

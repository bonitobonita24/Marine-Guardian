# Spec-Driven Platform V31 — Phase Details

> Loaded contextually when executing any phase.
> Read ONLY the section for the phase you are currently running.
> Contains: Phase 1-8, Phase 2.5/2.6/2.7/2.8 sub-phases, Phase 6.5 triage, Resume, Retro, Gov Sync, Toggles.
> Note: Phase 2.8 (Clickable Mockup Review) is documented here for reference but executes ONLY in the Planning Assistant chat on Claude.ai — not by Claude Code.

---

## ⚠ UNIVERSAL CONTEXT BUDGET — READ BEFORE EVERY PHASE

**This section applies to EVERY phase, part, batch, feature update, and task in this file.
Claude Code MUST apply this budget BEFORE starting any work — not just Phase 4 and Phase 8.**

**You are Claude Sonnet 4.6.** Your context window is 200K tokens but autocompact thrashes
when input context exceeds ~120K. The **SAFE zone is ≤80K tokens of input context.**

**OUTPUT EQUIVALENCE GUARANTEE:**
Splitting tasks into smaller sessions MUST produce the SAME final result as building
everything in one session — except BETTER, because no output is lost to context overflow.
Every file, every function, every validation rule, every permission guard, every UI element
described in PRODUCT.md must exist in the final codebase regardless of how many sessions
it took to build. Splitting changes the SESSION BOUNDARIES, never the OUTPUT.

When splitting, treat each sub-session as if it were the ONLY chance to build that module.
Do not assume a future session will "fill in the gaps." Each sub-session must produce
complete, working, tested code for its assigned scope — not stubs, not placeholders,
not TODO comments. The completeness check before committing enforces this.

**If you see this error, you have already exceeded the budget:**
> "Autocompact is thrashing: the context refilled to the limit within 3 turns
> of the previous compact, 3 times in a row."

```
TOKEN BUDGET REFERENCE (applies to ALL phases):
  CLAUDE.md + active rules file:      ~5-8K
  Each PRODUCT.md section:            ~2-4K  (full file = 20-40K — NEVER read all at once)
  Each existing source file read:     ~1-3K
  9 governance docs (all):            ~10-15K
  Your output per file written:       ~2-5K
  ─────────────────────────────────
  SAFE threshold: ≤12 files OR ≤80K total estimated tokens
```

**MANDATORY PRE-FLIGHT (run at the start of EVERY phase/part/batch/task):**

1. **Estimate scope** — how many files will you read + create + modify?
2. **Estimate token cost** — use the reference table above
3. **If >12 files OR >80K tokens → SPLIT before starting:**
   - Group by module/feature
   - Report the split plan with estimated tokens per sub-session
   - Build one group at a time → commit → STOP → human opens new session
4. **Read selectively:**
   - PRODUCT.md: read ONLY the sections relevant to the current task
   - Source files: use `codebase_search` (Rule 17) first, open files only when needed
   - Governance docs: read lessons.md + DECISIONS_LOG always; others only if relevant
5. **If thrashing occurs mid-session despite planning:**
   - STOP immediately — do NOT read more files
   - Run `/clear` to free context
   - Save progress: STATE.md + `.cline/handoffs/` + commit
   - STOP — human opens new session with narrower scope

**This is not optional.** Every phase section below assumes this pre-flight has been run.

---

## PHASE 1 — SET UP DEV ENVIRONMENT (OPTIONAL — skip if already done)
**Who:** You | **Where:** WSL2 terminal — this is the only step agents cannot do

> **⚠ CONTEXT BUDGET:** Human-executed phase — no agent context budget concern. Listed here for universal coverage.

**One-time setup. Skip entirely if Node 22, pnpm, and VS Code Remote-WSL are already installed.**

WSL2 native is the only supported dev environment.
Run Node + pnpm natively in WSL2. Only backing services run in Docker Compose.
This eliminates all devcontainer permission layers and shell server crashes.

```
Windows → WSL2 Ubuntu → Node 22 (nvm) + pnpm native
                      → Docker Desktop (backing services only)
                            postgresql, valkey, minio, mailhog
```

Setup (one-time in WSL2 Ubuntu terminal):
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 22 && nvm use 22 && npm install -g pnpm
```

Open project in VS Code via Remote-WSL extension. Run `pnpm dev` in WSL2 terminal.
Start Docker services: `bash deploy/compose/start.sh dev up -d` (from WSL2 terminal).
No devcontainer. No socket negotiation. No shell server crashes.

This step requires a physical action on your machine — no agent can trigger it.

---

## PHASE 2 — DISCOVERY INTERVIEW
**Who:** Claude Code (you interact with it) | **Where:** Terminal — run `claude` in your project folder

> **⚠ CONTEXT BUDGET:** Interview phase — lightweight context. If the interview produces a very large PRODUCT.md (>30K tokens), Phase 3 will handle it with section-by-section reads.
>
> **⚠ MEMORY GOVERNANCE** (memory-governance.md): PRE: Run Tiered Decomposition (§1) — classify scope before starting. POST: Run Smart Checkpoint (§2) if any files were created or modified. MODEL: Use Architect-Execute Model (§4) for Phase 4/7/8 work.

Before any files are generated, Claude Code interviews you to understand your app.
This locks in tech stack, tenancy model, entities, security, and infrastructure.

**⚠️ ONE-TIME ONLY per project. Never re-run on an existing project.**
For any change after Phase 4 — always use Phase 7.

**Trigger:** Say "Start Phase 2" + paste your completed `docs/PRODUCT.md`

─────────────────────────────────────────────────────────
PHASE 2 PRE-FLIGHT — CREDENTIALS GATE — MANDATORY
Before running the interview, verify Bootstrap Step 18 completed:
□ CREDENTIALS.md exists in the project root
  - If missing: STOP. Output: "⚠ Bootstrap Step 18 has not run. CREDENTIALS.md is missing.
    Open Claude Code, paste the master prompt, and type 'Bootstrap' to complete setup first."
  - Do not proceed with Phase 2 until CREDENTIALS.md exists.
□ .gitignore contains CREDENTIALS.md entry
  - If missing: add it immediately before any other action.
Note: Phase 2 does not read credential values — check existence only (headers only if verifying).
─────────────────────────────────────────────────────────

### Step 1 — Validate PRODUCT.md completeness

Required sections (cannot be blank): App Name, Purpose, Target Users, Core Entities,
User Roles, Main Workflows, Data Sensitivity, Tenancy Model, Environments Needed.

Strip any `<private>` tags before processing (Rule 20). If a required section is
entirely within a `<private>` block, ask the user to provide a non-sensitive description.

If any required section is blank or "TBD" → list them and STOP.

### Step 2 — Acknowledge confirmed tech stack

If Tech Stack Preferences is filled → treat as confirmed → list them → do not re-ask.

### Step 3 — Ask only relevant questions in ONE message

Skip sections clearly not needed (no jobs → skip Section F, etc.):

```
SECTION A — Platform Identity
□ App name in the UI?
□ Production domain? (e.g. inventorize.app, erp.powerbyte.com)
□ Staging domain? (e.g. staging.inventorize.app, staging-erp.powerbyte.com)
  (Dev ports are auto-generated by Phase 3 — do not ask for them)

SECTION B — Tenancy
□ single / multi / start-single-upgrade-later?
□ If multi: subdomain or subdirectory? Any shared global data?

SECTION C — Auth & RBAC
□ Auth provider (if not in PRODUCT.md)?
□ JWT field names? Roles global or tenant-scoped?

SECTION D — Modules & Navigation
□ URL prefix per module? Navigation hardcoded or DB?

SECTION E — File Uploads (skip if none declared)
□ File types + sizes? Store originals? Image variants?

SECTION F — Background Jobs (skip if none declared)
□ Queue names? Retry + backoff? DLQ + replay UI?

SECTION G — Reporting (skip if none declared)
□ KPIs? Chart types? Export formats?

SECTION G2 — Payment Gateway (skip if app does not accept payments)
□ Does this app accept payments from users? (yes / no — skip section entirely if no)
□ Payment gateway: Xendit (framework default for all SEA markets — ID, PH, MY, TH, VN)
  IF yes and Xendit is acceptable: lock `payment.gateway: xendit` in DECISIONS_LOG.md.
  IF the user explicitly requests a different gateway (e.g. Stripe, PayMongo): ask why, then lock.
  Xendit is the default because Powerbyte operates in PH and framework targets SEA.
□ Payment methods needed? (cards, e-wallets, bank transfer, OTC / over-the-counter, QR)
□ Recurring payments / subscriptions needed? (Xendit supports recurring via Plans API)
□ Refund support needed? (full / partial)
□ Multi-currency? (default: single currency per deployment region)
  → Write answers to PRODUCT.md Integrations section under "Payment Gateway"
  → Phase 3 generates payment.* fields in inputs.yml
  → Bootstrap Step 18 Section 4.5 collects Xendit API keys

SECTION H — Security & Governance
□ Which events need audit logs? (login, record CRUD, role changes, etc.)
□ Data retention period, GDPR export/delete requirements?
□ CORS allowed origins per environment?
□ Rate limiting needed? (public / auth / upload endpoints)
□ CSRF approach (cookie-based SameSite / header token)?
□ Cloudflare Turnstile bot protection (V27 — framework default, FREE tier):
  Turnstile is enabled by default on all public-facing forms. No CAPTCHA shown to users.
  Protected pages: login, registration, password reset, contact forms, payment pages (if Xendit enabled).
  Widget mode: Managed (recommended — Cloudflare auto-decides whether to show a checkbox).
  FREE tier limits: 20 widgets (1 per app), 10 hostnames per widget.
  Hostname strategy: only prod domain registered on widget (dev + staging use test keys — 0 hostnames).
  This means 1 hostname used per app. For SaaS with custom tenant domains, each domain = 1 more hostname.
  IF the user explicitly opts out: set turnstile.enabled: false in DECISIONS_LOG.md.
  IF multi-tenant SaaS with custom domains: ask how many unique hostnames — may need multiple widgets.
  → Lock in DECISIONS_LOG.md under "Bot protection": turnstile enabled, widget mode, protected pages list.
  → Bootstrap Step 18 Section 4.6 collects Turnstile sitekey + secret key.

SECTION I — Infrastructure
□ Compose services needed? External in production? K8s confirm disabled?
□ Docker Hub image publishing (NEW V15):
  Do you want to publish a Docker image to Docker Hub on every push to main?
  If yes → ask these 3 questions:

  Q1: Docker Hub username?
      (the username you log into hub.docker.com with — e.g. "bonito" or "powerbyte")

  Q2: Image name for this specific app?
      IMPORTANT — naming rules to avoid Docker Hub collisions:
      • Must be unique within YOUR Docker Hub account
      • Use the app slug, not a generic name: e.g. "nucleus-erp" not "app" or "erp"
      • If you have multiple apps: "nucleus-erp", "marine-guardian", "portal" — each unique
      • Lowercase, hyphens only, no spaces, no slashes: "my-app-name" ✅ "My App" ❌
      • Full image ref will be: yourusername/image-name (e.g. bonito/nucleus-erp)
      • This name is LOCKED in DECISIONS_LOG.md after Phase 3 — changing it later
        means all existing pull commands on staging/prod servers must be updated

  Q3: Do you already have a Docker Hub account?
      If YES: confirm username + that you can create repos (free plan allows unlimited public, 1 private)
      If NO:  create account first at hub.docker.com before continuing Phase 3
              Free plan is sufficient — you only need 1 private repo per app

  If no: skip — no docker-publish.yml, push.sh, or COMMANDS.md Docker section will be generated.
  → Lock in DECISIONS_LOG.md under "Docker image publishing": username, image_name, full ref
  Note: Two push paths are generated when enabled (NEW V22 — both use same Docker Hub repo):
    • GitHub Actions (automatic): pushes :latest + :sha on every merge to main
    • push.sh (manual): bash deploy/compose/push.sh dev → staging → prod
    Both coexist. COMMANDS.md documents all push commands for quick reference.
  Note: If using Komodo for staging/prod deployment (V27 — recommended):
    V27 model uses Komodo auto-update for staging (polls Docker Hub for new :staging-latest images)
    and manual deploy from Komodo UI for production. No webhook URLs or secrets needed for this path.
    OPTIONAL: If you prefer webhook-triggered deploys, add these GitHub Secrets:
      KOMODO_STAGING_WEBHOOK_URL — from Komodo UI → Stack → Config → Webhooks
      KOMODO_PROD_WEBHOOK_URL    — from Komodo UI → Stack → Config → Webhooks
      KOMODO_WEBHOOK_SECRET      — same value as in Komodo Core compose config
    See Scenario 32 for full Komodo setup from scratch.
□ Dev environment mode — PRE-LOCKED (V25):
  MODE A (WSL2 native) — the only supported dev environment. No devcontainer. No DinD.
  Node + pnpm run natively in WSL2. Docker Desktop provides backing services only.
  This decision is written to DECISIONS_LOG.md by Bootstrap Step 9 — never re-ask.
□ Any port ranges to avoid on this machine? (Phase 3 generates non-standard random ports automatically — Rule 22)
□ Git strategy: use branch-per-feature with squash-merge? (default: yes — Rule 23)
□ Git worktrees for Phase 4 Parts? (default: yes — cleaner isolation per Part)
□ Model routing for Claude Code tasks:
  - Planning/Phase 2: Claude Code (auto)
  - Execution/Phase 4-8: [default: Claude Sonnet 4.6 via Claude Code]
  - Governance writes: [default: Gemini Flash-Lite — cheapest]
  → Lock these in DECISIONS_LOG.md under "Model routing"

SECTION J — Mobile (skip if no mobile declared)
□ Framework: React Native bare or Expo (managed/bare workflow)?
□ Offline-first required? If yes: what data needs to work offline?
□ Sync strategy: optimistic updates / background sync / manual sync?
□ Push notifications? Provider: Expo Push / FCM+APNs direct?
□ Camera, GPS, biometrics, or other native device features needed?
□ Deployment: App Store + Play Store, or internal/enterprise only?
□ API auth strategy for mobile: same JWT flow as web, or separate?
□ Deep linking required? (e.g. open app from email link)

SECTION K — Design Identity (skip if not in PRODUCT.md — fully optional)
□ Brand feel? (professional/enterprise | friendly/consumer | premium/luxury | technical/developer)
□ Target aesthetic in plain English? (e.g. "clean like Linear" / "bold like Stripe" / "calm like healthcare")
□ Industry category? (drives anti-pattern filtering in Phase 2.6)
□ Dark mode required? (yes / no / optional toggle)
□ Any key design constraint? (e.g. WCAG AA required / internal tool / low-end device support)
```

### Step 4 — Close Phase 2

Output:
─────────────────────────────────────────────────────────
PHASE 2 OUTPUT CONTRACT — MANDATORY
Before proceeding to Phase 2.5, verify ALL of these:
□ docs/PRODUCT.md has all 11 required sections — no blank sections, no "TBD"
□ All roles have at least 2 explicit permissions AND 1 explicit restriction
□ All entities have at least 3 fields named
□ Tenancy model is declared (even if single-tenant)
□ Out of Scope has at least 3 explicit exclusions
□ Internal alignment check = PASS (no gaps)
IF ANY item fails → output GAP_REPORT only → do not advance to Phase 2.5
─────────────────────────────────────────────────────────

> ✅ Phase 2 complete. Say "Start Phase 3" to review the full spec summary.
> After confirming, run Phase 4 in Claude Code — Part-by-Part, human triggers each phase.

---

## PHASE 2.5 — SPEC DECISION SUMMARY
**Who:** Claude Code | **Where:** VS Code

> **⚠ CONTEXT BUDGET:** Summary phase — reads PRODUCT.md to produce a condensed review. If PRODUCT.md is >30K tokens, read section-by-section and summarize incrementally.
>
> **⚠ MEMORY GOVERNANCE** (memory-governance.md): PRE: Run Tiered Decomposition (§1). POST: Run Smart Checkpoint (§2) if files changed.

Trigger: Say "Start Phase 3"

Output the full spec summary for review. Do NOT generate files until user says "confirmed".

```
📋 SPEC DECISION SUMMARY — reply "confirmed" to generate files

APP
  Name / Purpose / Tenancy / Environments / Domains

TECH STACK (TypeScript strict everywhere)
  Frontend / API / ORM / Auth / Database / Cache / Storage / Web UI / Mobile UI

MONOREPO
  Apps: [name, framework, port] / Packages list / Conditional packages

ENTITIES / MODULES / JOBS / INFRA SERVICES
K8s scaffold: disabled

⭐ PRODUCT DIRECTION CHECK
Before locking this spec, ask: "Is this the right product to build?
What would the ideal version of this do that this plan doesn't include yet?"
If the user expands the scope — update the relevant sections above before confirming.
This is a one-question gut check, not a full re-interview. Max 2 minutes.

After confirmation → Phase 2.6 runs automatically (if skill installed + Section K present)
→ then Phase 2.7 spec stress-test runs (blocks Phase 3 if gaps found — "Re-run Phase 2.7" after fixes)
→ then Phase 3 generates spec files → then hand off to Claude Code for Phase 4 Part-by-Part.
(Note: Phase 2.8 Clickable Mockup Review runs separately in the Planning Assistant chat on Claude.ai — BEFORE PRODUCT.md is brought into the project. It does not run here in Claude Code.)
```

---


## PHASE 2.6 — DESIGN SYSTEM GENERATION (NEW V12)
**Who:** Claude Code (automated — Cline deprecated) | **Where:** VS Code — Claude Code terminal
**Trigger:** Runs automatically as part of the "confirmed" → Phase 3 sequence.

> **⚠ CONTEXT BUDGET:** Design system generation reads PRODUCT.md Section K + generates design tokens. Lightweight — but if combined with Phase 2.7 + Phase 3 in one session, estimate total context.
>
> **⚠ MEMORY GOVERNANCE** (memory-governance.md): PRE: Run Tiered Decomposition (§1). POST: Run Smart Checkpoint (§2) if files changed.

User says "confirmed" once after Phase 2.5 — Claude Code handles 2.6 then proceeds to Phase 3.
**Prerequisite:** UI UX Pro Max skill installed + Section K in PRODUCT.md.
**Skip condition — CONDITIONAL:** If either is absent → log to agent-log.md → continue to Phase 3 immediately.

```
Step 1 — Check prerequisites
  If .claude/skills/ui-ux-pro-max/ does NOT exist:
    → Append to agent-log.md: "Phase 2.6 skipped — UI UX Pro Max skill not installed"
    → Proceed to Phase 3 immediately
  If PRODUCT.md has no Design Identity section (Section K):
    → Append to agent-log.md: "Phase 2.6 skipped — no Design Identity in PRODUCT.md"
    → Proceed to Phase 3 immediately
  Check for additional design plugins (NEW V23):
  - frontend-design plugin: check if ~/.claude/skills/frontend-design/ exists → log presence
  - a11y skill: check PRODUCT.md Non-functional Requirements for "accessibility: wcag_aa" → flag if present
  - shadcnblocks: check if .claude/skills/shadcn-ui/ exists → log presence (optional)

Step 2 — Extract Design Identity from PRODUCT.md
  Read Section K. Strip any <private> tags (Rule 20).
  Compose search string: "[industry category] [brand feel] [target aesthetic]"

Step 3 — Run design system generator
  Run this single command (all on one line):
  python3 .claude/skills/ui-ux-pro-max/scripts/search.py "[search string from Step 2]" --design-system --persist -p "[App Name from inputs.yml]"
  Output: design-system/MASTER.md

Step 3a — Append Vercel Web Interface Guidelines to MASTER.md (NEW V23)
  These guidelines are embedded directly rather than loaded as a skill — Vercel's own evals
  showed 100% pass rate with embedded guidelines vs 79% with skill-based loading.
  Append this section to design-system/MASTER.md:

  ## Web Interface Quality Standards (Vercel Guidelines)

  ### Interactions
  - Every interactive element must have a visible focus state (2–4px ring, not just outline-none)
  - Touch targets minimum 44×44px (mobile) — never smaller
  - Hover → active transitions: 150–300ms (below 100ms feels instant/broken, above 400ms feels slow)
  - Disabled states must look disabled — reduced opacity + no pointer-events

  ### Forms
  - Inline validation: show errors on blur, not on submit
  - Required fields must be marked — never rely on placeholder alone
  - Error messages must be adjacent to the field, not just at the top
  - Success feedback must be explicit — never silent

  ### Animations
  - Use CSS transitions/animations only — no JS-based animation for layout shifts
  - Respect prefers-reduced-motion: always provide a reduced-motion fallback
  - Page transitions: ≤200ms — longer feels laggy in production apps
  - Loading skeletons > spinners for content areas > 300px tall

  ### Layout
  - Scrollable containers must have visible overflow indicators
  - Sticky headers must not obscure focused elements on keyboard navigation
  - Mobile breakpoint (375px): test before every delivery — never assume desktop-first works

  ### Performance perception
  - Optimistic UI for user actions (create, update, delete) — show change immediately, revert on error
  - No layout shift on data load — skeleton loaders must match final layout dimensions
  - Images must have explicit width/height (Next.js Image component enforces this)

  ### Dark mode
  - Test dark mode contrast independently — do not assume light mode values invert correctly
  - Borders visible in both modes (bg-border not bg-foreground/10)
  - Shadow-based elevation does not work in dark mode — use border + subtle bg difference instead

  ### Keyboard navigation
  - Tab order must follow visual reading order
  - Modal/dialog: trap focus while open, restore focus on close
  - Escape closes modals/dropdowns/drawers — no exceptions
  - Arrow keys navigate menus and listboxes — not Tab

Step 4 — Add design-system entry to .socraticodecontextartifacts.json
  Check if file exists. If it does: MERGE (add entry, do not overwrite).
  If it does not exist yet: create with the design-system entry only.
  Entry to add:
  {
    "name": "design-system",
    "path": "./design-system/MASTER.md",
    "description": "Active design system — colors, typography, spacing, UI style, anti-patterns. Read before generating any UI component, page, or visual element."
  }
  Note: Phase 4 Part 7 will add the remaining 4 entries (database-schema,
  implementation-map, decisions-log, product-definition). Always MERGE, never overwrite.

Step 5 — shadcnblocks catalog (NEW V23 — CONDITIONAL)
  If .claude/skills/shadcn-ui/ exists (shadcnblocks skill installed):
    → Log to agent-log.md: "Shadcnblocks skill detected — Claude has full block catalog (2500+ blocks)"
    → Add note to design-system/MASTER.md:
      "## Block Catalog Available: shadcnblocks 2500+ blocks installed.
       When building page sections (hero, pricing, dashboard, navigation, footer):
       Ask Claude to select from shadcnblocks catalog before writing custom components.
       Install: npx shadcn add @shadcnblocks/[block-name]"
  If not installed: skip silently.

Step 6 — a11y enforcement (NEW V23 — CONDITIONAL)
  If PRODUCT.md Non-functional Requirements contains "accessibility: wcag_aa":
    → Add section to design-system/MASTER.md:
      "## Accessibility (WCAG 2.1 AA) — MANDATORY
       This app requires WCAG 2.1 Level AA compliance.
       Before delivering any UI component, verify:
       □ Color contrast: minimum 4.5:1 for normal text, 3:1 for large text (18px+ or 14px bold+)
       □ Focus rings: visible on ALL interactive elements (never outline: none without replacement)
       □ Alt text: all meaningful images have descriptive alt attributes
       □ ARIA labels: all icon-only buttons have aria-label
       □ Keyboard navigation: all interactions reachable and usable without mouse
       □ Form labels: every input has an associated <label> element (not just placeholder)
       □ Error announcement: errors announced via aria-live or role='alert'
       Run /web-interface-guidelines in Claude Code to audit UI code against these standards."
    → If a11y skill is installed: append "Run a11y skill pre-delivery checklist" to Phase 7 task instructions.

Step 7 — Log and summarise
  Append to CHANGELOG_AI.md: Agent: CLAUDE_CODE, Phase 2.6 design system generated
  Output to user:
  ✅ Phase 2.6 complete — Design system generated.
     Style: [style name]
     Colors: [primary] / [secondary] / [CTA]
     Typography: [font pairing]
     Top anti-patterns to avoid: [top 3]
     Vercel UI guidelines: embedded in MASTER.md
     Accessibility: [wcag_aa enforced | standard shadcn/ui defaults]
     Shadcnblocks: [detected — 2500+ blocks available | not installed]
  Proceeding to Phase 3...
```

**If Phase 2.6 is skipped** (skill absent or no Section K):
Claude Code uses shadcn/ui neutral defaults for all UI. Zero errors. Zero blocked phases.
Install the skill and add Section K to PRODUCT.md any time → say "Feature Update" → MASTER.md generated.

---

## PHASE 2.7 — SPEC STRESS-TEST GATE (NEW V19)
**Who:** Claude Code | **Where:** VS Code terminal
**Trigger:** Runs automatically after Phase 2.6 (or after Phase 2.5 if Phase 2.6 skipped).

> **⚠ CONTEXT BUDGET:** Stress-test reads full PRODUCT.md to find gaps. If PRODUCT.md exceeds 30K tokens, read section-by-section and test each independently rather than loading the entire file.
>
> **⚠ MEMORY GOVERNANCE** (memory-governance.md): PRE: Run Tiered Decomposition (§1). POST: Run Smart Checkpoint (§2) if files changed.

**Skip condition — CONDITIONAL:** `vibe_test.enabled: false` in inputs.yml → skip entirely → proceed to Phase 3.
**Default:** Enabled. Costs one LLM call. Prevents entire Phase 4 rebuilds from spec gaps.

**Purpose:** Before generating any code or spec files, stress-test `docs/PRODUCT.md` to find
every gap, ambiguity, and missing decision that would force Claude Code to halt or guess during Phase 4.
Output is always exact and actionable — never vague.

**Execute this sequence — MANDATORY, no deviations:**

```
Step 1 — Read docs/PRODUCT.md in full.
  Strip all <private> tags (Rule 20) before analysing.
  Do not output PRODUCT.md content to the user.

Step 2 — Run the 4-category internal stress-test.
  This is INTERNAL ONLY — never output the checklist.
  Check every item silently:

  COMPLETENESS
  □ All 11 required PRODUCT.md sections present and non-empty?
  □ Every module has at least one user flow?
  □ Every entity has key fields named (not just the entity name)?
  □ Every role has at least one permission explicitly listed?
  □ Auth strategy named and confirmed?
  □ Tenancy mode declared (single / multi)?
  □ DB isolation exception declared if payroll/banking/medical data present?
  □ Mobile: offline-first decision made? Distribution type named?
  □ File storage: need declared? Provider named if yes?
  □ Job queue: need declared? Queue names listed if yes?

  CONSISTENCY
  □ Any entity named in workflows but missing from Data Entities section?
  □ Any role referenced in permissions but not declared in Roles section?
  □ Any integration named in flows but not listed in Integrations section?
  □ Tenancy mode consistent across all sections?

  AMBIGUITY
  □ Any workflow step where Claude Code cannot determine which file to create?
  □ Any feature described with 2+ equally valid implementations?
  □ Any "TBD", "to be decided", or blank field not explicitly listed in Out of Scope?

  SECURITY AND COMPLIANCE
  □ Data sensitivity declared? (GDPR / DICT / financial / medical flags)
  □ Audit log events named for every sensitive mutation?
  □ Rate limiting declared for public-facing endpoints?
  □ CORS origins named for all environments?

Step 3 — Evaluate and output.

  IF all checks pass:
  Output EXACTLY this text — no additions:
  ✅ Phase 2.7 complete — spec stress-test PASSED.
     0 gaps found. PRODUCT.md is implementation-ready.
     Proceeding to Phase 3...
  Then proceed to Phase 3 automatically.

  IF any check fails:
  Output EXACTLY this structure. Do NOT proceed to Phase 3:

  🔴 SPEC STRESS-TEST — [N] gap(s) found. Fix before Phase 3.
  ─────────────────────────────────────────────────────────
  GAP 1:
    SECTION:  [which PRODUCT.md section]
    PROBLEM:  [one sentence — what is missing, ambiguous, or inconsistent]
    FIX:      [exact text to add or change in PRODUCT.md]
  ─────────────────────────────────────────────────────────
  [repeat for every gap — do not group or summarise]

  NEXT STEP: Fix all gaps in docs/PRODUCT.md then say "Re-run Phase 2.7".

Step 4 — After all gaps fixed and re-check passes:
  Append to CHANGELOG_AI.md:
    Agent: CLAUDE_CODE
    Phase 2.7 spec stress-test passed. [N] gap(s) found and resolved before Phase 3.
  Proceed to Phase 3.
```

─────────────────────────────────────────────────────────
PHASE 2.7 OUTPUT CONTRACT — MANDATORY
One of these two outcomes is required before proceeding:
□ PASS: output "✅ Phase 2.7 complete — spec stress-test PASSED. 0 gaps found." then proceed to Phase 3.
□ FAIL: output GAP_REPORT (SECTION/PROBLEM/FIX per gap). Do NOT proceed to Phase 3. Wait for fixes.
IF neither outcome is output → Phase 2.7 = INCOMPLETE → run again before Phase 3.
─────────────────────────────────────────────────────────

**Re-run trigger:** Say `"Re-run Phase 2.7"` → repeat Steps 1–4 on the updated PRODUCT.md.

**Disabled path:** `vibe_test.enabled: false` in inputs.yml → Phase 2.7 skipped entirely.
Any gaps discovered during Phase 4 will require a Feature Update to resolve — significantly
more expensive than catching them here.

---

## PHASE 2.8 — CLICKABLE MOCKUP REVIEW (NEW V31)

**Who:** Planning Assistant chat (Claude.ai) — NOT Claude Code
**Where:** The same Claude.ai chat that ran Phases 2–2.7 (the PRODUCT.md Planning chat)

> **⚠ CONTEXT BUDGET:** Runs in Planning Assistant (Claude.ai), not Claude Code. Claude.ai has its own context limits — if the PRODUCT.md + mockup generation exceeds the chat window, the Planning Assistant will handle it natively. No agent-side budget concern.

**Trigger:** Auto-runs after Phase 2 Alignment Check passes on the Planning Assistant side
**Skip:** Type `skip mockup` in the Planning Assistant chat. Auto-skipped if PRODUCT.md has <2 screens.

### PURPOSE
Catch spec/mental-model misalignment BEFORE Phase 3 locks the architecture.
Cheap to generate (single HTML file, ~90 seconds), expensive to skip (misinterpretations surface only during Phase 4 scaffold).

### WHAT PHASE 2.8 DOES
1. Parses the just-written PRODUCT.md — extracts every declared screen
2. Classifies into Tier 1 (5-8 critical screens, full fidelity) vs Tier 2 (remaining screens, simplified placeholders)
3. Selects an industry-appropriate dummy data theme (ERP / Fisheries / Inventory / Healthcare / Education / Fintech / Government / Other)
4. Generates a clickable React (.jsx) mockup using shadcn/ui conventions (Tailwind + Inter font + shadcn CSS variable color tokens); HTML archive version generated after user confirmation (Step 7a)
5. Delivers as Claude.ai artifact + downloadable HTML file
6. Asks 3 alignment questions covering navigation structure, primary workflow, data display
7. Handles user response — confirmed, change request, expand Tier-2-to-Tier-1, or skip

### WHO EXECUTES IT
ONLY the Planning Assistant chat (Claude.ai running the PRODUCT.md interview).
Claude Code does NOT run Phase 2.8. When PRODUCT.md arrives at the project
repo, assume Phase 2.8 already ran (or was skipped) on the Planning Assistant side.
(Cline deprecated V31 — same rule applies: if Cline is ever re-enabled as emergency fallback, it must not run Phase 2.8 either.)

### WHAT PHASE 2.8 DOES NOT DO
- Does NOT create or modify any project files
- Does NOT commit the mockup to the repo
- Does NOT log the mockup in governance docs
- Does NOT affect Phase 3 inputs.yml generation in any way
- Does NOT require new rules, scenarios, or bootstrap steps
- Does NOT use any UI library other than shadcn/ui conventions
- Does NOT include live functionality (forms don't submit, data doesn't save)

### FULL SPECIFICATION
See `Product_md_Planning_Assistant_v31.md` — Phase 2.8 section (trigger logic, Step-by-Step, industry theme table, HTML structure spec, Tier 1 fidelity checklist, user response handling, output contract, MUST/MUST NOT rules).

### PHASE 3 INTERACTION
Zero. Phase 3 in Claude Code proceeds based on PRODUCT.md + inputs.yml regardless
of whether Phase 2.8 ran, passed, or was skipped. The mockup is ephemeral — used
for visual verification only, not architecture input.

### BUDGET LIMITS
- Max 3 full regenerations per project
- Max 5 single-screen Tier-2→Tier-1 expansions per project
- Budget exhaustion → Planning Assistant recommends proceeding to Phase 3, further iteration during Phase 7 Feature Updates

---

## PHASE 3 — GENERATE SPEC FILES
**Who:** Claude Code | **Where:** VS Code

Trigger: User says "confirmed" after Phase 2.5

> **⚠ CONTEXT BUDGET:** Run the Universal Context Budget pre-flight (top of this file) before starting. Phase 3 reads the full PRODUCT.md — if it exceeds 30K tokens, generate spec files in module groups rather than all at once.
>
> **⚠ MEMORY GOVERNANCE** (memory-governance.md): PRE: Run Tiered Decomposition (§1). POST: Run Smart Checkpoint (§2) if files changed.

─────────────────────────────────────────────────────────
PHASE 3 PRE-FLIGHT — ACCOUNTS & CREDENTIALS CHECKLIST — MANDATORY
Verify these BEFORE generating any files. Ask human to resolve anything missing.

□ Verify CREDENTIALS.md is complete (written by Bootstrap Step 18)
  - If missing or all-placeholder: STOP. Ask human to rerun Bootstrap Step 18 before continuing.
  - Confirm these sections exist: GitHub, Docker Hub, PostgreSQL, Valkey, MinIO, pgAdmin, Auth, SMTP
  - Read section HEADERS only — never log credential values anywhere

□ GitHub account ready (values from CREDENTIALS.md — do NOT re-ask)
  - Repo name confirmed — use value from CREDENTIALS.md GitHub section
  - IF docker.publish: true → remind human to add GitHub Secrets NOW (before first push to main):
      DOCKERHUB_USERNAME  = Docker Hub username (already in CREDENTIALS.md)
      DOCKERHUB_TOKEN     = Docker Hub access token (already in CREDENTIALS.md)
      OPTIONAL — only if using webhook deploy instead of V27 recommended auto-update model:
        KOMODO_STAGING_WEBHOOK_URL = Komodo staging stack webhook URL (in CREDENTIALS.md)
        KOMODO_PROD_WEBHOOK_URL    = Komodo prod stack webhook URL (in CREDENTIALS.md)
        KOMODO_WEBHOOK_SECRET      = Komodo webhook secret (in CREDENTIALS.md)
      Note: V27 recommended path uses Komodo auto-update (staging) + manual deploy (prod) — no webhooks needed.
      Location: GitHub repo → Settings → Secrets and variables → Actions → New secret

□ Docker Hub account ready (ONLY if docker.publish: true)
  - Human confirmed they have a hub.docker.com account
  - IF no account: instruct them to create one at hub.docker.com first (free plan is sufficient)
  - Docker Hub username confirmed and matches docker.hub_repo in inputs.yml
  - Image name is unique within their Docker Hub account — not a generic name like "app" or "web"
  - Image name format verified: lowercase, hyphens only (e.g. nucleus-erp, marine-guardian)
  - Full image reference locked: {docker.hub_repo} = DOCKERHUB_USERNAME/IMAGE_NAME
  - Note: Docker Hub creates the repo automatically on first push — no manual creation needed

□ Image name uniqueness confirmed (CRITICAL — cannot be changed easily after deployment)
  - Image name is specific to THIS app — not shared with other apps in the same Docker Hub account
  - If human has multiple projects: each gets its own unique image name
    WRONG: app, web, erp, api (generic — collides with other projects)
    RIGHT: nucleus-erp, marine-guardian-enterprise, powerbyte-portal (specific + unique)
  - This name appears in every staging/prod server pull command — changing it requires
    updating all server env files and redeploy

IF docker.publish: true AND any of the above are unconfirmed:
  Output: "Before generating Phase 3 files, I need to confirm:
  1. Your Docker Hub username: ___
  2. Image name for this app (e.g. nucleus-erp): ___
  3. Do you already have a hub.docker.com account? [yes/no]
  Once confirmed I will lock these in inputs.yml and DECISIONS_LOG.md."
─────────────────────────────────────────────────────────

Generate:
1. `inputs.yml` (version 3) — full app spec from PRODUCT.md + Phase 2 answers
   Includes `ports.dev.*` section with UNIQUE random port assignments for all services.
   Port generation algorithm: pick a random base integer in range 40000–49999 once per project.
   All service ports derive from that base using fixed offsets (Rule 22 Part A).
   This guarantees no two projects on the same machine ever share a port.
   Store base in inputs.yml as `ports.dev.base` so ports are reproducible.
2. `inputs.schema.json` — strict JSON Schema validation
3. No devcontainer files generated — WSL2 native is the only supported dev environment (Rule 8, V26).
4. **Environment files — one per deployment target. All real env files gitignored.**

   **Secret generation rules — applied strictly for every environment:**

   ─────────────────────────────────────────────────────────────────
   CRITICAL — MANDATORY EXECUTION — NO EXCEPTIONS:
   You MUST use your terminal tool to run every openssl command below.
   DO NOT invent, generate, or hallucinate credential values.
   DO NOT substitute example values or copy values from this prompt.
   DO NOT reuse any value across dev, staging, and prod environments.
   Capture the ACTUAL stdout from the terminal. Use ONLY that output in env files.
   IF the terminal tool is unavailable: STOP. Write handoff. Do not proceed to env file generation.
   ─────────────────────────────────────────────────────────────────

   Use the following commands to generate each credential type. Run each command
   independently per environment — never reuse a value across dev/staging/prod.

   ```bash
   # 22-char password (DB, Redis, MinIO, PgBouncer, pgAdmin, SMTP)
   # Full printable ASCII — uppercase, lowercase, digits, symbols
   # Result example: "kR7mN2pX9qL4wZ8vTr#5Yx"
   openssl rand -base64 32 | tr -d '\n' | head -c 22

   # 22-char username suffix for service accounts (hex — SQL-safe, no symbols)
   # DB_USER = ${app_slug}_ + 11-char hex = total ~22 chars, valid SQL identifier
   openssl rand -hex 11  # produces 22 lowercase hex chars e.g. "a3f8c1e92b04d7f6e301a8"

   # 48-char secret (AUTH_SECRET, JWT signing keys, webhook secrets)
   # Higher entropy required for cryptographic signing
   openssl rand -base64 64 | tr -d '\n' | head -c 48

   # Storage access key: hex prefix + 11-char hex suffix = 22 chars
   openssl rand -hex 11  # used as access key suffix after app_slug prefix
   ```

   **What gets generated for each field (ALL passwords minimum 22 characters):**
   - `DB_PASSWORD`              → 22-char full ASCII (per env, unique, never reused)
   - `DB_USER`                  → `${app_slug}_` + 11-char hex suffix (e.g. `myapp_a3f8c1e92b04`) — valid SQL identifier
   - `PGBOUNCER_AUTH_PASSWORD`  → 22-char full ASCII (different from DB_PASSWORD)
   - `REDIS_PASSWORD`           → 22-char full ASCII
   - `STORAGE_ACCESS_KEY`       → `${app_slug}-` + 11-char hex suffix (e.g. `myapp-a3f8c1e92b04d7f6e301`)
   - `STORAGE_SECRET_KEY`       → 48-char
   - `PGADMIN_PASSWORD`         → 22-char full ASCII
   - `SMTP_PASSWORD`            → provided by human (external service — cannot be generated)
   - `AUTH_SECRET`              → 48-char base64 (Auth.js v5 JWT signing — higher entropy required)
   - `SMTP_PASSWORD`            → provided by human (external service — cannot be generated)
   - `PGADMIN_EMAIL` → `${app_slug}-` + 8-char hex suffix + `@admin.local` (e.g. `myapp-a3f8c1e9@admin.local`) — valid email format, unique per env
   - `PGADMIN_PASSWORD` → 22-char full ASCII (separate from DB password — never reuse)

   **Rule:** Generate ONCE per environment at Phase 3 time. Never regenerate unless explicitly
   requested — regenerating invalidates active sessions and running containers.
   Never reuse the same generated value across dev, staging, and prod.

   Generate these 4 files:

   **`.env.dev`** — development environment (non-standard ports from inputs.yml ports.dev)
   ```
   # ═══════════════════════════════════════════════════
   # DEV environment — generated by Phase 3
   # Ports: non-standard (from inputs.yml ports.dev)
   # All services run locally via Docker Compose
   # ═══════════════════════════════════════════════════
   COMPOSE_PROJECT_NAME=${app_slug}_dev
   APP_ENV=development
   APP_PORT=${ports.dev.app}

   # DATABASE
   DB_HOST=localhost
   DB_PORT=${ports.dev.db}
   DB_NAME=${app_slug}_dev
   DB_USER=${app_slug}_dev
   DB_PASSWORD=<generated-22-char>
   DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public

   # PGBOUNCER
   PGBOUNCER_PORT=${ports.dev.pgbouncer}
   PGBOUNCER_AUTH_PASSWORD=<generated-22-char>
   PGBOUNCER_DATABASE_URL=postgresql://${DB_USER}:${PGBOUNCER_AUTH_PASSWORD}@localhost:${PGBOUNCER_PORT}/${DB_NAME}

   # CACHE
   REDIS_HOST=localhost
   REDIS_PORT=${ports.dev.redis}
   REDIS_PASSWORD=<generated-22-char>
   REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}

   # FILE STORAGE (MinIO — S3-compatible)
   STORAGE_ENDPOINT=http://localhost:${ports.dev.minio}
   STORAGE_CONSOLE_PORT=${ports.dev.minio_console}
   STORAGE_BUCKET=${app_slug}-dev
   STORAGE_ACCESS_KEY=${app_slug}-dev-access
   STORAGE_SECRET_KEY=<generated-22-char>
   STORAGE_REGION=us-east-1

   # AUTH
   AUTH_SECRET=<generated-48-char>
   NEXTAUTH_URL=http://localhost:${ports.dev.app}

   # EMAIL (MailHog dev)
   SMTP_HOST=localhost
   SMTP_PORT=${ports.dev.mailhog}
   SMTP_FROM=dev@localhost

   # PGADMIN (NEW V16 — database management UI, all environments)
   PGADMIN_PORT=${ports.dev.pgadmin}
   PGADMIN_EMAIL=<generated-email>
   PGADMIN_PASSWORD=<generated-22-char>

   # XENDIT (V27 — payment gateway, CONDITIONAL: only if payment.gateway: xendit)
   # Dev uses TEST keys — no real charges, no banking network interaction
   XENDIT_SECRET_KEY=<xendit-test-secret-key-from-section-4e>
   XENDIT_PUBLIC_KEY=<xendit-test-public-key-from-section-4g>
   XENDIT_WEBHOOK_TOKEN=<xendit-webhook-verification-token-from-section-4i>

   # CLOUDFLARE TURNSTILE (V27 — bot protection, framework default)
   # Dev uses Cloudflare's official test keys — always passes, no real widget needed
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
   ```

   **`.env.staging`** — staging environment (standard ports, mono-server, own volumes)
   # Docker Hub image tag (Komodo reads this before docker compose pull):
   APP_IMAGE_TAG=staging-latest          # change to sha-{hash} to pin a specific version
   DOCKERHUB_USERNAME=${docker.hub_repo.split('/')[0]}
   IMAGE_NAME=${docker.image_name}
   ```
   # ═══════════════════════════════════════════════════
   # STAGING environment — generated by Phase 3
   # Mono-server: DB + cache + storage all on same host
   # To move any service to external: update HOST var
   # and remove that service from docker-compose.*.yml
   # ═══════════════════════════════════════════════════
   COMPOSE_PROJECT_NAME=${app_slug}_staging
   APP_ENV=staging
   APP_PORT=3000

   # DATABASE
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=${app_slug}_staging
   DB_USER=${app_slug}_staging
   DB_PASSWORD=<generated-22-char>
   DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public

   # PGBOUNCER
   PGBOUNCER_PORT=6432
   PGBOUNCER_AUTH_PASSWORD=<generated-22-char>
   PGBOUNCER_DATABASE_URL=postgresql://${DB_USER}:${PGBOUNCER_AUTH_PASSWORD}@localhost:6432/${DB_NAME}

   # CACHE
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=<generated-22-char>
   REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}

   # FILE STORAGE (MinIO — S3-compatible)
   STORAGE_ENDPOINT=http://localhost:9000
   STORAGE_CONSOLE_PORT=9001
   STORAGE_BUCKET=${app_slug}-staging
   STORAGE_ACCESS_KEY=${app_slug}-staging-access
   STORAGE_SECRET_KEY=<generated-22-char>
   STORAGE_REGION=us-east-1

   # AUTH
   AUTH_SECRET=<generated-48-char>
   NEXTAUTH_URL=https://${staging_domain_from_product_md}

   # EMAIL
   SMTP_HOST=smtp.yourdomain.com
   SMTP_PORT=587
   SMTP_USER=
   SMTP_PASSWORD=<generated-22-char>
   SMTP_FROM=noreply@${staging_domain_from_product_md}

   # PGADMIN (NEW V16 — database management UI, all environments)
   PGADMIN_PORT=5050
   PGADMIN_EMAIL=<generated-email>
   PGADMIN_PASSWORD=<generated-22-char>

   # TRAEFIK (V27 — reverse proxy for HTTPS routing)
   TRAEFIK_NETWORK=proxy
   APP_DOMAIN=${staging_domain_from_product_md}

   # XENDIT (V27 — payment gateway, CONDITIONAL: only if payment.gateway: xendit)
   # Staging uses LIVE keys but with test amounts — or use TEST keys if preferred
   XENDIT_SECRET_KEY=<xendit-live-secret-key-from-section-4f>
   XENDIT_PUBLIC_KEY=<xendit-live-public-key-from-section-4h>
   XENDIT_WEBHOOK_TOKEN=<xendit-webhook-verification-token-from-section-4i>

   # CLOUDFLARE TURNSTILE (V27 — bot protection, framework default)
   # Staging uses TEST keys (same as dev) — always passes, no real hostname needed on widget
   # This saves a hostname slot: only prod domain needs to be registered on the Turnstile widget
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
   ```

   **`.env.prod`** — production environment (standard ports, mono-server, own volumes)
   # Docker Hub image tag (Komodo reads this before docker compose pull):
   APP_IMAGE_TAG=latest                  # default = always newest; change to sha-{hash} to pin
   DOCKERHUB_USERNAME=${docker.hub_repo.split('/')[0]}
   IMAGE_NAME=${docker.image_name}
   ```
   # ═══════════════════════════════════════════════════
   # PRODUCTION environment — generated by Phase 3
   # Mono-server: DB + cache + storage all on same host
   # To move any service to external: update HOST var
   # and remove that service from docker-compose.*.yml
   # ═══════════════════════════════════════════════════
   COMPOSE_PROJECT_NAME=${app_slug}_prod
   APP_ENV=production
   APP_PORT=3000

   # DATABASE
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=${app_slug}_prod
   DB_USER=${app_slug}_prod
   DB_PASSWORD=<generated-22-char>
   DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public

   # PGBOUNCER
   PGBOUNCER_PORT=6432
   PGBOUNCER_AUTH_PASSWORD=<generated-22-char>
   PGBOUNCER_DATABASE_URL=postgresql://${DB_USER}:${PGBOUNCER_AUTH_PASSWORD}@localhost:6432/${DB_NAME}

   # CACHE
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=<generated-22-char>
   REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}

   # FILE STORAGE (MinIO — S3-compatible)
   STORAGE_ENDPOINT=http://localhost:9000
   STORAGE_CONSOLE_PORT=9001
   STORAGE_BUCKET=${app_slug}-prod
   STORAGE_ACCESS_KEY=${app_slug}-prod-access
   STORAGE_SECRET_KEY=<generated-22-char>
   STORAGE_REGION=us-east-1

   # AUTH
   AUTH_SECRET=<generated-48-char>
   NEXTAUTH_URL=https://${prod_domain_from_product_md}

   # EMAIL
   SMTP_HOST=smtp.yourdomain.com
   SMTP_PORT=587
   SMTP_USER=
   SMTP_PASSWORD=<generated-22-char>
   SMTP_FROM=noreply@${prod_domain_from_product_md}

   # PGADMIN (NEW V16 — database management UI, all environments)
   PGADMIN_PORT=5050
   PGADMIN_EMAIL=<generated-email>
   PGADMIN_PASSWORD=<generated-22-char>

   # TRAEFIK (V27 — reverse proxy for HTTPS routing)
   TRAEFIK_NETWORK=proxy
   APP_DOMAIN=${prod_domain_from_product_md}

   # XENDIT (V27 — payment gateway, CONDITIONAL: only if payment.gateway: xendit)
   # Production uses LIVE keys — real charges, real money
   XENDIT_SECRET_KEY=<xendit-live-secret-key-from-section-4f>
   XENDIT_PUBLIC_KEY=<xendit-live-public-key-from-section-4h>
   XENDIT_WEBHOOK_TOKEN=<xendit-webhook-verification-token-from-section-4i>

   # CLOUDFLARE TURNSTILE (V27 — bot protection, framework default)
   # Production is the ONLY environment using REAL keys — only prod domain registered on widget
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=<turnstile-live-site-key-from-section-4k>
   TURNSTILE_SECRET_KEY=<turnstile-live-secret-key-from-section-4l>
   ```

   **`.env.example`** — the ONLY env file committed to git. Reference template for format only.

   Rules for `.env.example` content:
   - ALL generated secrets replaced with descriptive placeholders showing the EXPECTED FORMAT
   - Placeholder format: `your-<field-name>-here` — tells the reader what to put, not just "CHANGE_ME"
   - Host values show realistic example format (e.g. `localhost` for dev, `db.yourdomain.com` for remote)
   - Never contains any real password, secret, or access key — even from dev environment
   - Committed to git — safe to push to public or private repos
   - Updated whenever new env vars are added (e.g. during a Feature Update)
   - First line of .env.example must include this comment block so anyone cloning knows what to do:

   ```
   # ═══════════════════════════════════════════════════════════════════
   # [APP_NAME] — Environment Variables Template
   # ═══════════════════════════════════════════════════════════════════
   # HOW TO USE:
   # 1. Copy this file: cp .env.example .env.dev
   # 2. Fill in real values (or run Phase 3 to auto-generate them)
   # 3. NEVER commit .env.dev, .env.staging, or .env.prod to git
   # 4. NEVER commit CREDENTIALS.md to git (it is gitignored)
   #
   # FIRST ADMIN ACCOUNT (created by pnpm db:seed):
   #   Username: webmaster
   #   Password: see CREDENTIALS.md (gitignored — generated by Phase 3)
   #   URL: http://localhost:[APP_PORT]/login
   #
   # All service passwords in CREDENTIALS.md are AI-generated strong passwords.
   # Anyone cloning this repo must generate their own via Phase 3.
   # ═══════════════════════════════════════════════════════════════════
   ```

   Example placeholder style:
   ```
   # ═══════════════════════════════════════════════════
   # Copy this file to .env.dev / .env.staging / .env.prod
   # Fill in real values — never commit those files to git
   # Run Phase 3 to auto-generate with secure credentials
   # ═══════════════════════════════════════════════════
   COMPOSE_PROJECT_NAME=your-app-name_dev
   APP_ENV=development|staging|production
   APP_PORT=3000

   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=your-app-name_dev
   DB_USER=your-app-name_a3f8c1
   DB_PASSWORD=your-db-password-here
   DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public

   PGBOUNCER_PORT=6432
   PGBOUNCER_AUTH_PASSWORD=your-pgbouncer-password-here
   PGBOUNCER_DATABASE_URL=postgresql://${DB_USER}:${PGBOUNCER_AUTH_PASSWORD}@localhost:${PGBOUNCER_PORT}/${DB_NAME}

   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=your-redis-password-here
   REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}

   STORAGE_ENDPOINT=http://localhost:9000
   STORAGE_CONSOLE_PORT=9001
   STORAGE_BUCKET=your-app-name-dev
   STORAGE_ACCESS_KEY=your-app-name-a3f8c1e9
   STORAGE_SECRET_KEY=your-storage-secret-key-here
   STORAGE_REGION=us-east-1

   AUTH_SECRET=your-48-char-auth-secret-here
   NEXTAUTH_URL=http://localhost:${APP_PORT}

   SMTP_HOST=localhost
   SMTP_PORT=1025
   SMTP_FROM=noreply@yourdomain.com
   SMTP_PASSWORD=your-smtp-password-here

   PGADMIN_PORT=5050
   PGADMIN_EMAIL=your-pgadmin-email-here
   PGADMIN_PASSWORD=your-pgadmin-password-here

   # XENDIT (only if payment.gateway: xendit in inputs.yml)
   # XENDIT_SECRET_KEY=xnd_development_your-test-secret-key-here
   # XENDIT_PUBLIC_KEY=xnd_public_development_your-test-public-key-here
   # XENDIT_WEBHOOK_TOKEN=your-xendit-webhook-verification-token-here

   # CLOUDFLARE TURNSTILE (bot protection — framework default)
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
   # ↑ These are Cloudflare's official test keys (always pass). Replace with real keys for staging/prod.
   ```

4d. **`CREDENTIALS.md`** — master credentials reference file (NEW V17)

   Generated immediately after the 3 env files. Contains every username, password, secret,
   and hash for every backend service across all 3 environments in one readable table.
   Gives you a single place to look up any credential without opening multiple env files.

   **Format:**
   ```markdown
   # CREDENTIALS MASTER LIST
   # First written: Bootstrap Step 18 — Spec-Driven Platform V31
   # Updated when: Phase 3 regenerates env files (credentials rotate) or Feature Update rotates a secret
   # ⚠️  GITIGNORED — NEVER commit this file
   # ⚠️  NEVER paste into any AI chat, LLM, or log file
   # ⚠️  Treat like a password manager export — store securely offline
   # Last updated: [ISO timestamp]
   # App: [APP_NAME] | Slug: [APP_SLUG] | Repo: [GITHUB_REPO]

   ---

   ## 🔑 FIRST ADMIN ACCOUNT (App Login)

   | Field    | Value                        |
   |----------|------------------------------|
   | Username | webmaster                    |
   | Password | [22-char generated — stored in CREDENTIALS.md under "First Admin Account"]         |
   | Role     | super_admin / administrator  |
   | URL      | http://localhost:[APP_PORT]/login |

   ⚠ This is the first login to the app itself — not a service credential.
   Change this password immediately after first successful login in production.
   This account is seeded by pnpm db:seed and exists in all environments.

   ---

   ## 🗄️ PostgreSQL

   | Environment | DB Name | Username | Password | Host | Port |
   |-------------|---------|----------|----------|------|------|
   | dev         | ${app_slug}_dev | ${DB_USER_dev} | ${DB_PASSWORD_dev} | localhost | ${ports.dev.db} |
   | staging     | ${app_slug}_staging | ${DB_USER_staging} | ${DB_PASSWORD_staging} | localhost | 5432 |
   | prod        | ${app_slug}_prod | ${DB_USER_prod} | ${DB_PASSWORD_prod} | localhost | 5432 |

   Password generation: openssl rand -base64 32 (per environment, never reused)

   ## 🔀 PgBouncer (Connection Pooler)

   | Environment | Auth Password | Port |
   |-------------|---------------|------|
   | dev         | ${PGBOUNCER_AUTH_PASSWORD_dev} | ${ports.dev.pgbouncer} |
   | staging     | ${PGBOUNCER_AUTH_PASSWORD_staging} | 6432 |
   | prod        | ${PGBOUNCER_AUTH_PASSWORD_prod} | 6432 |

   ## ⚡ Valkey (Cache + Job Queue)

   | Environment | Password | Host | Port |
   |-------------|----------|------|------|
   | dev         | ${REDIS_PASSWORD_dev} | localhost | ${ports.dev.redis} |
   | staging     | ${REDIS_PASSWORD_staging} | localhost | 6379 |
   | prod        | ${REDIS_PASSWORD_prod} | localhost | 6379 |

   Password generation: openssl rand -hex 24 (per environment, never reused)

   ## 🗂️ MinIO (S3-Compatible File Storage)

   | Environment | Access Key | Secret Key | Endpoint | Bucket |
   |-------------|------------|------------|----------|--------|
   | dev         | ${STORAGE_ACCESS_KEY_dev} | ${STORAGE_SECRET_KEY_dev} | http://localhost:${ports.dev.minio} | ${app_slug}-dev |
   | staging     | ${STORAGE_ACCESS_KEY_staging} | ${STORAGE_SECRET_KEY_staging} | http://[server]:9000 | ${app_slug}-staging |
   | prod        | ${STORAGE_ACCESS_KEY_prod} | ${STORAGE_SECRET_KEY_prod} | http://[server]:9000 | ${app_slug}-prod |

   Access key: openssl rand -hex 8 | Secret key: openssl rand -hex 32

   ## 🖥️ pgAdmin (Database Management UI)

   | Environment | Login Email | Password | URL |
   |-------------|-------------|----------|-----|
   | dev         | ${PGADMIN_EMAIL_dev} | ${PGADMIN_PASSWORD_dev} | http://localhost:${ports.dev.pgadmin} |
   | staging     | ${PGADMIN_EMAIL_staging} | ${PGADMIN_PASSWORD_staging} | http://[server-ip]:5050 |
   | prod        | ${PGADMIN_EMAIL_prod} | ${PGADMIN_PASSWORD_prod} | http://[server-ip]:5050 |

   ⚠ Never expose pgAdmin port to public internet. Use firewall or SSH tunnel.

   ## 🔐 Auth Secrets (JWT Signing — Auth.js)

   | Environment | AUTH_SECRET |
   |-------------|-------------|
   | dev         | ${AUTH_SECRET_dev} |
   | staging     | ${AUTH_SECRET_staging} |
   | prod        | ${AUTH_SECRET_prod} |

   Generation: openssl rand -base64 64 (per environment, never reused)

   ## 📧 SMTP (Email)

   | Environment | Host | Port | User | Password |
   |-------------|------|------|------|----------|
   | dev         | localhost (MailHog) | ${ports.dev.mailhog} | — | — |
   | staging     | ${SMTP_HOST} | 587 | ${SMTP_USER} | ${SMTP_PASSWORD_staging} |
   | prod        | ${SMTP_HOST} | 587 | ${SMTP_USER} | ${SMTP_PASSWORD_prod} |

   ## 🦎 Komodo (Deployment Manager)
   [CONDITIONAL — only if Komodo is used for staging/prod deployment]

   | Credential | Value | Notes |
   |---|---|---|
   | KOMODO_UI_URL | http://[server]:9120 | Browser access to Komodo |
   | KOMODO_PASSKEY | [generated: openssl rand -base64 32] | Core config — keep secret |
   | KOMODO_WEBHOOK_SECRET | [generated: openssl rand -base64 32] | Shared with GitHub Actions |
   | KOMODO_JWT_SECRET | [generated: openssl rand -base64 32] | Core config — keep secret |
   | KOMODO_STAGING_WEBHOOK_URL | [from Komodo UI → Stack → Config → Webhooks] | GitHub Actions secret |
   | KOMODO_PROD_WEBHOOK_URL | [from Komodo UI → Stack → Config → Webhooks] | GitHub Actions secret |

   GitHub Secrets to add (in addition to DOCKERHUB_USERNAME and DOCKERHUB_TOKEN):
   KOMODO_STAGING_WEBHOOK_URL = [staging stack webhook URL]
   KOMODO_PROD_WEBHOOK_URL    = [prod stack webhook URL]
   KOMODO_WEBHOOK_SECRET      = [same value as KOMODO_WEBHOOK_SECRET in core compose]
   See Scenario 32 for full Komodo setup guide.

   ## 🐳 Docker Hub (Image Registry)
   [CONDITIONAL — only if docker.publish: true]

   | Field | Value |
   |-------|-------|
   | Username | ${DOCKERHUB_USERNAME} |
   | Image | ${docker.hub_repo}:latest |
   | Access Token | [created at hub.docker.com → Security — do not store token value here] |

   GitHub Secrets to add (Settings → Secrets → Actions):
   DOCKERHUB_USERNAME = ${DOCKERHUB_USERNAME}
   DOCKERHUB_TOKEN    = [your access token — stored in GitHub Secrets, not here]

   ## 🔑 Third-Party API Keys
   [CONDITIONAL — add rows only for services declared in PRODUCT.md Integrations]

   | Service | Key Name | Value | Environment | Notes |
   |---------|----------|-------|-------------|-------|
   | [e.g. Twilio] | TWILIO_ACCOUNT_SID | AC... | all | From Twilio console |
   | [e.g. OpenAI] | OPENAI_API_KEY | sk-... | all | From platform.openai.com |
   | [Add rows for every external API declared in PRODUCT.md — Xendit has its own section above] | | | | |

   If no third-party integrations: write "No third-party API keys for this project."

   ---

   ## 📋 WHERE EACH FILE LIVES

   | File | Location | Committed to Git? |
   |------|----------|-------------------|
   | .env.dev | project root | ❌ NO — gitignored |
   | .env.staging | project root | ❌ NO — gitignored |
   | .env.prod | project root | ❌ NO — gitignored |
   | .env.example | project root | ✅ YES — safe template |
   | CREDENTIALS.md | project root | ❌ NO — gitignored |

   Anyone who clones this repo will only see .env.example with placeholder values.
   They must run Phase 3 (or fill .env.example manually) to regenerate their own credentials.
   ```

   **CREDENTIALS.md generation rules:**
   - All `<generated-*>` placeholders replaced with the actual generated values — not placeholders
   - Values are identical to what was written into the corresponding env files
   - File is generated once at Phase 3 time. Never auto-regenerated — only regenerated on explicit request
   - If any credential is rotated later (via Feature Update), the agent MUST update CREDENTIALS.md to match
   - IF docker.publish: true → add a GitHub Secrets section at the TOP of CREDENTIALS.md:
   ```
   ## ⚠ GITHUB SECRETS — ADD BEFORE FIRST PUSH TO MAIN
   Location: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

   Secret name         Value to paste
   ─────────────────── ─────────────────────────────────────────────────
   DOCKERHUB_USERNAME  [your Docker Hub username, e.g. bonito]
   DOCKERHUB_TOKEN     [Docker Hub access token — NOT your password]

   How to get your Docker Hub access token:
   1. hub.docker.com → avatar → Account Settings → Security → New Access Token
   2. Name it: [app-name]-github-ci (e.g. nucleus-erp-github-ci)
   3. Copy immediately — shown only once
   4. Paste as DOCKERHUB_TOKEN value above

   Docker Hub image: ${docker.hub_repo}:latest
   GitHub Actions will push to this image on every merge to main.
   Without these secrets, docker-publish.yml will fail silently on first push.
   ```

   **`.gitignore` entries** — enforced in FOUR places (CREDENTIALS.md added everywhere):
   1. Bootstrap Step 1 writes the initial `.gitignore` with these entries
   2. Bootstrap Step 16 appends CREDENTIALS.md to `.gitignore`
   3. Phase 4 Part 1 appends/verifies all entries are present (idempotent check)
   4. `.clinerules` ENV FILE RULES section — agents check on every task start

   ```gitignore
   # Environment files — never commit real credentials
   .env
   .env.local
   .env.dev
   .env.staging
   .env.prod

   # Credentials master list — NEVER COMMIT THIS FILE
   CREDENTIALS.md

   # .env.example is intentionally NOT listed here — it is committed to git
   ```

   **ABSOLUTE HARD RULES — no exceptions:**
   - `CREDENTIALS.md` MUST be in `.gitignore` before Phase 3 writes it
   - If `CREDENTIALS.md` is ever found NOT in `.gitignore`: STOP immediately, add it, log 🔴 gotcha to lessons.md, then abort the current task and ask human to verify git status
   - NEVER include any credential value in CHANGELOG_AI.md, agent-log.md, lessons.md, or any governance doc
   - NEVER include CREDENTIALS.md content in any LLM context, tool call response, or log output
   - If `git status` shows CREDENTIALS.md as tracked: run `git rm --cached CREDENTIALS.md` immediately
   - CREDENTIALS.md is for human eyes only — agents write it, never read it back into context
   - Bootstrap Step 18 is a BLOCKING gate — CREDENTIALS.md must be fully written before Phase 2 begins (Phase 1 dev setup is optional)
   - All AI-generated service passwords must be minimum 22 characters — never shorter, never invented
   - Human-provided credentials (GitHub token, SMTP, Docker Hub token) must be collected from human at
     Step 18 — the AI never generates or guesses external account credentials

   **Volume naming rule:** Each environment gets its own Docker named volumes to guarantee
   complete data isolation. Naming pattern: `${app_slug}_${env}_${service}_data`
   Example: `myapp_dev_postgres_data`, `myapp_staging_postgres_data`, `myapp_prod_postgres_data`
   Volumes are declared in the compose files during Phase 4 Part 7.

5. `docs/DECISIONS_LOG.md` — every locked tech choice recorded, including port strategy, git strategy, and model routing
5b. `inputs.yml` git section:
    ```yaml
    git:
      default_branch: main
      branch_pattern: feat/{slug}
      commit_style: conventional
      squash_merge: true
      use_worktrees: true
    models:
      planning:   claude-code
      execution:  claude-sonnet-4-6
      governance: gemini-2.5-flash-lite
    ```
5c. `inputs.yml` docker section (UPDATED V22):
    Generated from Phase 2 Section I answers. If user did not specify, ask during Phase 2.
    ```yaml
    docker:
      publish: true                        # false = skip docker-publish.yml entirely
      registry: docker.io                  # docker.io | ghcr.io | custom
      hub_repo: yourdockerhubuser/appname  # Docker Hub username/repo — never hardcode
      image_name: appname                  # used as the image tag base
      platforms:
        - linux/amd64
        - linux/arm64
      build_on_push_to: main               # GitHub Actions auto-push: only from this branch
      dev_build: true                      # NEW V22: dev compose always rebuilds from source
    context7:
      enabled: true                        # NEW V23: Context7 MCP for live library docs (Rule 30)
      # No API key needed. Installed via .vscode/mcp.json in Bootstrap Step 10.
    accessibility:
      level: none                          # NEW V23: none | wcag_aa | wcag_aaa
      # wcag_aa: triggers a11y skill checklist in Phase 2.6 + Phase 7 delivery gate
      # Required for government/public sector apps (MGE uses wcag_aa)
    ```
    If `docker.publish: false` → Phase 4 Part 8 skips `docker-publish.yml` entirely.
    Hub repo and image name are locked in DECISIONS_LOG.md after Phase 3.
    `dev_build: true` → dev docker-compose.app.yml uses `build:` + `image:` (build then tag).
    `dev_build: false` → dev pulls pre-built image (advanced: CI-built image used locally).
5d. `inputs.yml` vibe_test section (NEW V19):
    Generated automatically. Default: enabled. Lock decision in DECISIONS_LOG.md.
    ```yaml
    vibe_test:
      enabled: true    # false = skip Phase 2.7 spec stress-test (not recommended)
    ```
    If `vibe_test.enabled: false` → Phase 2.7 skipped. Phase 3 proceeds without stress-test.
    Lock in DECISIONS_LOG.md: "Spec stress-test (Phase 2.7): enabled / disabled + reason"
6. If `design-system/MASTER.md` exists: add it to `.claude/settings.json` context file list
   (conditional — only if Phase 2.6 ran and created the file)
6.5. Generate `scripts/sync-credentials-to-env.sh` (NEW V30).
     This script reads CREDENTIALS.md and propagates human-filled values into .env.dev,
     .env.staging, .env.prod. Runs when human updates ⏳ placeholders after Bootstrap.

     Write scripts/sync-credentials-to-env.sh with EXACTLY this content:
     ```bash
     #!/bin/bash
     # Sync CREDENTIALS.md values → .env.dev / .env.staging / .env.prod
     # Generated by Phase 3. Run after filling ⏳ placeholders in CREDENTIALS.md.
     # Safe to re-run — idempotent. Only writes values that are not still ⏳.

     set -euo pipefail
     CREDS="CREDENTIALS.md"

     if [ ! -f "$CREDS" ]; then
       echo "❌ CREDENTIALS.md not found. Run Bootstrap Step 18 first."
       exit 1
     fi

     # Count remaining placeholders
     pending=$(grep -c "⏳" "$CREDS" || echo 0)
     echo "CREDENTIALS.md has $pending unfilled placeholders."

     if [ "$pending" -gt 0 ]; then
       echo ""
       echo "Sections still containing ⏳ placeholders:"
       grep -B1 "⏳" "$CREDS" | grep "^##" | sort -u | head -20
       echo ""
       echo "Fill these in CREDENTIALS.md before running Phase 5."
       echo "Proceeding to sync already-filled values..."
     fi

     # Helper: extract value from CREDENTIALS.md table row by field name
     # Usage: extract_value "SMTP Host" → returns the value or "⏳" if unfilled
     extract_value() {
       local field="$1"
       grep "^| $field" "$CREDS" 2>/dev/null | head -1 | awk -F'|' '{print $3}' | sed 's/^ *//;s/ *$//' || echo ""
     }

     # Helper: update .env.{env} with a key=value ONLY if value is not ⏳
     # Usage: update_env .env.staging SMTP_HOST "$(extract_value 'SMTP Host')"
     update_env() {
       local env_file="$1"
       local key="$2"
       local value="$3"

       [ ! -f "$env_file" ] && return 0
       [[ "$value" == *"⏳"* ]] && return 0  # skip placeholders
       [ -z "$value" ] && return 0            # skip empty

       if grep -q "^${key}=" "$env_file"; then
         # Use | as sed delimiter to avoid clashes with / in URLs/paths
         sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
         echo "  ✅ $env_file: $key updated"
       else
         echo "${key}=${value}" >> "$env_file"
         echo "  ✅ $env_file: $key appended"
       fi
     }

     echo ""
     echo "─── Syncing SMTP (staging + prod only — dev uses MailHog) ───"
     for env in staging prod; do
       update_env ".env.${env}" "SMTP_HOST"      "$(extract_value 'SMTP Host')"
       update_env ".env.${env}" "SMTP_PORT"      "$(extract_value 'SMTP Port')"
       update_env ".env.${env}" "SMTP_USER"      "$(extract_value 'Username')"
       update_env ".env.${env}" "SMTP_PASSWORD"  "$(extract_value 'Password')"
       update_env ".env.${env}" "SMTP_FROM"      "$(extract_value 'From address')"
       update_env ".env.${env}" "SMTP_FROM_NAME" "$(extract_value 'From name')"
     done

     echo ""
     echo "─── Syncing Xendit (if payment.gateway: xendit) ───"
     for env in dev; do
       update_env ".env.${env}" "XENDIT_SECRET_KEY"   "$(extract_value 'Secret API Key (TEST)')"
       update_env ".env.${env}" "XENDIT_PUBLIC_KEY"   "$(extract_value 'Public API Key (TEST)')"
       update_env ".env.${env}" "XENDIT_WEBHOOK_TOKEN" "$(extract_value 'Webhook Verification Token')"
     done
     for env in staging prod; do
       update_env ".env.${env}" "XENDIT_SECRET_KEY"   "$(extract_value 'Secret API Key (LIVE)')"
       update_env ".env.${env}" "XENDIT_PUBLIC_KEY"   "$(extract_value 'Public API Key (LIVE)')"
       update_env ".env.${env}" "XENDIT_WEBHOOK_TOKEN" "$(extract_value 'Webhook Verification Token')"
     done

     echo ""
     echo "─── Syncing Turnstile (prod only — dev/staging use test keys) ───"
     update_env ".env.prod" "NEXT_PUBLIC_TURNSTILE_SITE_KEY" "$(extract_value 'Site Key (LIVE)')"
     update_env ".env.prod" "TURNSTILE_SECRET_KEY"           "$(extract_value 'Secret Key (LIVE)')"

     echo ""
     echo "─── Syncing Komodo ───"
     for env in staging prod; do
       update_env ".env.${env}" "KOMODO_UI_URL" "$(extract_value 'Komodo UI URL')"
     done

     echo ""
     echo "─── Syncing Third-Party API Keys (if any rows filled) ───"
     # Third-party keys are appended by reading the Third-Party section table rows.
     # Humans add their own rows — this loop reads each row and propagates.
     awk '/^## 🔑 Third-Party/,/^---$/' "$CREDS" | grep -E "^\| [A-Z_]+" | while IFS='|' read -r _ service key value envs _; do
       key=$(echo "$key" | sed 's/^ *//;s/ *$//')
       value=$(echo "$value" | sed 's/^ *//;s/ *$//')
       envs=$(echo "$envs" | sed 's/^ *//;s/ *$//')

       [[ "$value" == *"⏳"* ]] && continue
       [ -z "$value" ] && continue
       [ -z "$key" ] && continue

       # "all" → all three env files; else comma-separated list
       if [ "$envs" = "all" ]; then
         target_envs="dev staging prod"
       else
         target_envs=$(echo "$envs" | tr '/' ' ' | tr ',' ' ')
       fi

       for env in $target_envs; do
         update_env ".env.${env}" "$key" "$value"
       done
     done

     echo ""
     echo "✅ Sync complete. Run 'pnpm tools:check-env' to verify env files pass validation."
     echo "   If CREDENTIALS.md still has ⏳ placeholders, Phase 5 pre-flight will list them."
     ```
     chmod +x scripts/sync-credentials-to-env.sh
7. Deliver ZIP + `MANIFEST.txt`
8. Append to `docs/CHANGELOG_AI.md` with `Agent: CLAUDE_CODE`

─────────────────────────────────────────────────────────
PHASE 3 OUTPUT CONTRACT — MANDATORY
Before reporting complete, verify ALL of these:
□ inputs.yml exists at project root with all sections (ports.dev, git, docker, vibe_test, models)
□ inputs.schema.json exists at project root
□ .env.dev, .env.staging, .env.prod all exist and contain no placeholder values
□ CREDENTIALS.md exists and is listed in .gitignore
□ scripts/sync-credentials-to-env.sh exists (V31 — propagates CREDENTIALS.md → env files)
□ docs/DECISIONS_LOG.md updated with port strategy, git strategy, model routing, docker publish decision
□ CHANGELOG_AI.md updated with Phase 3 entry (Agent: CLAUDE_CODE)
IF ANY item fails → Phase 3 = INCOMPLETE → fix before proceeding → do not hand off to Claude Code for Phase 4
─────────────────────────────────────────────────────────

Output after completion:
> ✅ Phase 3 complete. Spec files generated.
> **Next: Phase 3.5 generates the Execution Plan, then you start Phase 4.**

---

## PHASE 3.5 — EXECUTION PLAN GENERATION (AUTO — runs at end of Phase 3)
**Who:** Claude Code (auto-runs after Phase 3 output contract passes) | **Where:** VS Code — Claude Code terminal

> **⚠ CONTEXT BUDGET:** This phase GENERATES the context budget plan for Phase 4+. Apply the Universal Context Budget pre-flight (top of this file) to this phase itself — Phase 3.5 reads the full PRODUCT.md to scan complexity, so if PRODUCT.md is very large (>30K tokens), read it in sections.
>
> **⚠ MEMORY GOVERNANCE** (memory-governance.md): PRE: Run Tiered Decomposition (§1). POST: Run Smart Checkpoint (§2) if files changed. MODEL: Use Architect-Execute Model (§4) — Opus should plan Phase 4 decomposition here.

**Purpose:** Analyze PRODUCT.md complexity and predict context cost per task BEFORE
Phase 4 starts. Generates a pre-computed execution plan that right-sizes every session
to stay well within context limits. Prevention, not reaction.

**Philosophy:** Many small sessions that complete cleanly with confidence are infinitely
better than fewer large sessions that thrash and produce broken code. Extra sessions
cost minutes. Thrashing costs hours of debugging and rework.

**Trigger:** Runs automatically at the end of Phase 3 — no human prompt needed.

### Step 1 — PRODUCT.md Complexity Scan

Scan the entire PRODUCT.md and build a complexity profile:
```
METRICS:
  entities:        [count all entities in Data Entities section]
  modules:         [count all ### Module headings in Modules + Features]
  pages:           [count all declared pages/screens]
  trpc_routers:    [estimate: 1 per module + shared utilities]
  bullmq_queues:   [count all background job declarations]
  integrations:    [count external services: payment, email, SMS, n8n, OpenClaw]
  mobile_first:    [count pages marked "Mobile First" in Mobile Needs]
  mobile_ready:    [count pages marked "Mobile Ready"]
  cross_module:    [count entities referenced by 3+ modules — high coupling]

MODULE BREAKDOWN (per module):
  [ModuleName]:
    entities: [N]
    pages: [N]
    has_complex_logic: [yes/no — financial calculations, state machines, approval flows]
    depends_on: [list of other modules this module imports from]
    estimated_files: [N]
```

### Step 2 — Context Cost Estimation

For each task that Claude Code will perform, estimate the context cost:

```
CONTEXT BUDGET per session: 120K tokens (safe ceiling — leaves 80K buffer in 200K window)

COST ESTIMATION FORMULA per sub-session:
  read_cost:
    + STATE.md + execution-plan.md          ~2K tokens (always loaded)
    + governance docs (lessons.md, etc.)     ~5K tokens (always loaded)
    + PRODUCT.md section for this module     ~[lines × 4] tokens
    + Prisma models for this module          ~[entity_count × 200] tokens
    + Existing files to read as reference    ~[file_count × 300] tokens
  write_cost:
    + New files to generate                  ~[file_count × 500] tokens
    + Test files                             ~[test_count × 400] tokens
  tool_cost:
    + Terminal commands (lint, typecheck)     ~3K tokens per run
    + Git operations                         ~1K tokens
  conversation_cost:
    + Agent reasoning + error correction     ~15K tokens overhead

  TOTAL ESTIMATED = read_cost + write_cost + tool_cost + conversation_cost

  IF TOTAL ESTIMATED > 100K → SPLIT FURTHER (must subdivide this sub-session)
  IF TOTAL ESTIMATED > 80K  → AT RISK (flag as "tight" — may need mid-session /clear)
  IF TOTAL ESTIMATED ≤ 80K  → SAFE (comfortable margin)
```

### Step 3 — Task Decomposition

Decompose ALL Phase 4 work into granular tasks, then group into sessions:

```
TASK TYPES (each is one atomic unit of work):
  SCHEMA:     Define Prisma models for [N] entities → generates schema.prisma sections
  ROUTER:     Build tRPC router for [Module] → router file + input validators
  SERVICE:    Build business logic for [Module] → service files (if complex logic)
  UI_LAYOUT:  Build app shell → layout, sidebar, header, footer, theme provider
  UI_MODULE:  Build all pages for [Module] → list, detail, create, edit pages
  UI_SHARED:  Build shared components → DataTable, forms, modals, filters
  JOBS:       Build BullMQ workers for [queue list]
  MOBILE_FDN: Expo scaffold + navigation + auth + theme
  MOBILE_DB:  WatermelonDB schema + sync engine
  MOBILE_MOD: Build mobile screens for [Module] (Mobile First only)
  INFRA:      Docker compose, CI, deploy scripts
  GOVERNANCE: MANIFEST.txt, SocratiCode index, final governance sweep

GROUPING RULES:
  1. Each session gets tasks totaling ≤80K estimated context (SAFE zone)
  2. Never mix ROUTER + UI_MODULE in the same session (different mental context)
  3. Schema tasks can be grouped — they're read-heavy but write-light
  4. Complex logic modules (financial calculations, state machines) get their
     own session — never grouped with other modules
  5. Modules with high cross_module coupling: build the dependency first
  6. UI_SHARED must come before any UI_MODULE sessions
  7. MOBILE_FDN → MOBILE_DB → MOBILE_MOD (strict order, never parallel)
```

### Step 4 — Dependency Ordering

Order all sessions respecting dependencies:
```
HARD DEPENDENCIES (must follow this order):
  Part 1 (config)       → before everything
  Part 2 (shared/api)   → before routers
  SCHEMA tasks          → before ROUTER tasks
  ROUTER tasks          → before UI_MODULE tasks
  UI_SHARED             → before UI_MODULE tasks
  UI_LAYOUT             → before UI_MODULE tasks
  All web UI            → before INFRA (compose needs to know ports/services)
  MOBILE_FDN            → MOBILE_DB → MOBILE_MOD
  Everything            → before GOVERNANCE (final sweep)

SOFT DEPENDENCIES (recommended but not blocking):
  Core modules (the primary workflow) → before secondary modules
  Simple modules → before complex modules (build momentum, catch patterns early)
  Modules with fewer dependencies → before highly coupled modules
```

### Step 5 — Write Execution Plan

Write `.cline/tasks/execution-plan.md` with this format:
```markdown
# Phase 4 Execution Plan — [AppName]
Generated: [timestamp]

## Complexity Profile
| Metric | Count | Impact |
|--------|-------|--------|
| Entities | [N] | [SMALL ≤15 / MEDIUM 16-40 / LARGE 41+] |
| Modules | [N] | [SMALL ≤8 / MEDIUM 9-15 / LARGE 16+] |
| Pages | [N] | [SMALL ≤30 / MEDIUM 31-60 / LARGE 61+] |
| BullMQ Queues | [N] | |
| Mobile First pages | [N] | |
| Cross-module entities | [N] | [HIGH if >5 — increases read cost per session] |
| **Overall** | | **[SMALL / MEDIUM / LARGE / ENTERPRISE]** |

## Session Schedule

### Part 1 — Root config
| Session | Tasks | Est. Files | Est. Context | Risk |
|---------|-------|-----------|-------------|------|
| 1 | Root config (standard) | 6 | ~25K | ✅ SAFE |

### Part 2 — Shared packages
| Session | Tasks | Est. Files | Est. Context | Risk |
|---------|-------|-----------|-------------|------|
| 2 | shared + api-client | 8 | ~30K | ✅ SAFE |

### Part 3 — Database + tRPC routers
| Session | Tasks | Est. Files | Est. Context | Risk |
|---------|-------|-----------|-------------|------|
| 3a | SCHEMA: all entities | [N] | ~[N]K | [risk] |
| 3b | ROUTER: [ModuleA] ([N] entities) | [N] | ~[N]K | [risk] |
| 3c | ROUTER: [ModuleB] ([N] entities, complex logic) | [N] | ~[N]K | [risk] |
| 3d | ROUTER: [ModuleC] + [ModuleD] ([N] entities) | [N] | ~[N]K | [risk] |

### Part 5 — Web UI
| Session | Tasks | Est. Files | Est. Context | Risk |
|---------|-------|-----------|-------------|------|
| 5a | UI_LAYOUT + UI_SHARED | [N] | ~[N]K | [risk] |
| 5b | UI_MODULE: Dashboard | [N] | ~[N]K | [risk] |
| 5c | UI_MODULE: [ModuleA] | [N] | ~[N]K | [risk] |

[...continue for all Parts...]

### Part 8 — Mobile
| Session | Tasks | Est. Files | Est. Context | Risk |
|---------|-------|-----------|-------------|------|
| 8a | MOBILE_FDN: scaffold + nav + auth | [N] | ~[N]K | [risk] |
| 8b | MOBILE_DB: WatermelonDB + sync | [N] | ~[N]K | [risk] |
| 8c | Push notifications | [N] | ~[N]K | [risk] |
| 8d | MOBILE_MOD: [ModuleA] screens | [N] | ~[N]K | [risk] |

## Summary
| Metric | Value |
|--------|-------|
| Total sessions | [N] |
| Sessions marked SAFE (≤80K) | [N] |
| Sessions marked AT RISK (80-100K) | [N] |
| Sessions marked MUST SPLIT (>100K) | [should be 0 — if not, re-split] |
| Estimated total build time | [N sessions × ~45 min avg] |

## Read Rules per Session
Each session MUST follow these read constraints:
- Read ONLY the PRODUCT.md sections listed in the session's task assignment
- Read ONLY the Prisma models for entities in the current module
- Read ONLY existing files that the current task directly imports from
- Do NOT scan directories — read specific files by path
- Do NOT read files from modules not assigned to this session
```

### Step 6 — Skill Activation Plan

Based on the complexity profile and task decomposition, recommend which Claude Code
skills to activate for each phase. Skills give Claude Code domain-specific expertise
that improves planning accuracy and code quality per session.

**Skill source:** https://aiskills.powerbyte.app/ (116+ skills, 601-skill library via /scan-project)
**Prompt reference:** https://aiskills.powerbyte.app/prompt-reference.html

**Installation workflow (at each phase transition):**
1. Run `/scan-project` in Claude Code — let it run all 5 phases (scan → match →
   conflict detection → install commands → interactive approval). Do NOT interfere.
2. AFTER `/scan-project` finishes and you approve its recommendations, check the
   framework's required skill list below. If any required skill was NOT installed
   by `/scan-project`, install it manually.
3. Run `check for skill conflicts` to verify no conflicts exist.
4. Report to the human: "Skills active: [list]. Framework additions: [list of any
   skills added in step 2 that /scan-project didn't suggest]."

**Session discipline (from Skill Installer ecosystem):**
- Start every session with: `catch me up` or `resume session` — loads full context
  from memory, checks git log, summarizes current state
- End every session with: `save session` — distills everything into memory files
  (code changes, decisions, patterns, dev history). Run BEFORE closing.
- These replace our custom pause/resume prompts for projects with the Skill Installer active.
  For projects WITHOUT the Skill Installer, use the original pause/resume from prompt 2.10.

**CRITICAL — Bundle inheritance (do NOT install these separately):**
- `superpowers` bundle INCLUDES: systematic-debugging, root-cause-tracing, TDD,
  brainstorming, verification, git-worktrees, finishing-branch, parallel-agents,
  code-review requesting/receiving. Do NOT install these individually.
- `code-review-graph` bundle INCLUDES: debug-issue, explore-codebase, refactor-safely.
- `claude-skills-65` INCLUDES: individual framework skills (react-expert, nestjs-expert, etc.)

**CRITICAL — Conflict registry (verified conflict-free):**
- `socraticode` (our MCP server) + `code-review-graph` (Primary Group) = VALID
  because SocratiCode runs as MCP-only alongside code-review-graph as active skill.
- All skills below are checked against the Pairwise Conflict and Mutual Exclusion
  registries — no conflicts.

**Phase 3.5 generates this schedule in the execution plan. Claude Code follows it.**

```markdown
## Skill Activation Schedule

### Primary Group (6 always-on slots — install ONCE, active across all phases)

Run in Claude Code:
  /scan-project

The Skill Installer's Skillpilot will auto-detect your project type (Solo Full-Stack)
and suggest the Primary Group. Let it install, then verify these 6 slots are filled:

| Slot | Skill | Purpose |
|------|-------|---------|
| 1 | superpowers | Foundational toolkit — TDD, debugging, brainstorming, git, parallel agents (replaces 8 skills) |
| 2 | code-review-graph | Codebase awareness — SQLite knowledge graph, blast radius, 28 MCP tools |
| 3 | planning-with-files | Strategic thinking — persistent plans that survive sessions (ideal for execution-plan.md) |
| 4 | frontend-design + design-auditor + owasp-security | Frontend intelligence — design + validate + secure in one pass |
| 5 | git-pushing | Workflow — commit discipline, push safety, context preservation |
| 6 | claude-skills-65 | Multi-framework (optional) — 65 skills for 30+ frameworks |

These cover the majority of what every phase needs. The per-phase additions below
are supplementary skills beyond the Primary Group.

### Phase 4 Part 3 (schema + tRPC routers) — verify before first Part 3 session

Run: /scan-project (re-scan — codebase has changed since bootstrap)

Verify these supplementary skills are also active:

| Skill | Layer | Why |
|-------|-------|-----|
| postgres | Database | Read-only DB queries — verify schema after migration, inspect seed data |

Note: owasp-security is already in Primary Group Slot 4.
Note: TDD enforcement is already in superpowers (Slot 1).

### Phase 4 Parts 5-6 (Web UI) — verify before first Part 5 session

Run: /scan-project (re-scan — routers are now built)

Verify these supplementary skills are also active:

| Skill | Layer | Why |
|-------|-------|-----|
| oiloil-ui-ux-guide | UX guidance | Task-first UX, HCI laws, interaction psychology |
| playwright-skill | Testing | E2E + component + visual + a11y testing per module |

Note: design-auditor and frontend-design are already in Primary Group Slot 4.
Note: vercel-agent-skills may be suggested by /scan-project for Next.js projects — accept it.

### Phase 4 Part 7 (Docker + infrastructure) — conditional

| Skill | Layer | Why | When |
|-------|-------|-----|------|
| aws-skills | Infrastructure | CDK best practices, cost optimization | Only if AWS deployment declared |

### Phase 5 (Validation) — verify before starting Phase 5

Run: /scan-project (re-scan — full app is now built)

Verify this supplementary skill is active:

| Skill | Layer | Why |
|-------|-------|-----|
| test-fixing | Testing | Smart error grouping — systematic repair of all failing tests |

Note: systematic-debugging is already in superpowers (Slot 1).

### Phase 6 + 6.5 (Docker + Visual QA + Error Triage)

| Skill | Layer | Why |
|-------|-------|-----|
| postgres | Database | Query live DB to verify migrations, seeds, data integrity |

Note: debug-issue and root-cause-tracing are already in superpowers (Slot 1) and
code-review-graph (Slot 2). Do NOT install debug-skill separately — it conflicts
with the superpowers bundle.

### Phase 7 (Feature Updates) — all previous skills remain active, add:

| Skill | Layer | Why |
|-------|-------|-----|
| review-implementing | Code review | Systematic code review feedback implementation |

Note: code-review requesting/receiving is already in superpowers (Slot 1).
Note: blast radius analysis is already in code-review-graph (Slot 2).
```

**Skill activation rules:**
- `/scan-project` runs FIRST at each phase transition — let it do its full 5-phase
  analysis and install whatever it recommends without interference
- AFTER `/scan-project` finishes, check the framework's required list above and
  install any missing supplementary skills manually
- Run `check for skill conflicts` after any manual installation
- Skills persist across sessions once installed — no need to reinstall per sub-session
- `/scan-project` may install additional skills beyond the framework's list — that's
  fine, more context = better decisions for Claude Code
- If `/scan-project` suggests removing a skill from the framework's required list,
  keep the framework's skill — it supplements, the framework decides the minimum
- Use `what skills are active?` at any time to verify the current skill profile
- Use `optimize my skill set` if sessions feel sluggish — may suggest MCP-only
  conversions to reduce token overhead

### Step 7 — Human Review

Output:
```
📋 Phase 4 Execution Plan generated → .cline/tasks/execution-plan.md

COMPLEXITY: [SMALL/MEDIUM/LARGE/ENTERPRISE]
  [X] entities · [Y] modules · [Z] pages

SESSION SCHEDULE:
  Part 1:  1 session  (standard)
  Part 2:  1 session  (standard)
  Part 3:  [N] sessions (schema + routers, split by module)
  Part 5:  [N] sessions (web UI, split by module)
  Part 7:  1 session  (standard)
  Part 8:  [N] sessions (mobile, split by layer + module)
  ─────────────────────
  TOTAL:   [N] sessions

CONTEXT SAFETY:
  ✅ SAFE:     [N] sessions
  ⚠  AT RISK:  [N] sessions (flagged — may need mid-session adjustment)
  🔴 MUST SPLIT: [should be 0]

Review the plan. Then say "Start Part 1" to begin Phase 4.
Options:
  • "Start Part 1" — accept and begin
  • "Split [session] further" — subdivide a specific session
  • "Combine [sessionA] and [sessionB]" — merge if you think they're small enough
  • "Show me [Part N] details" — see the full task list for a specific Part
```

### Phase 3.5 Output Contract
```
□ .cline/tasks/execution-plan.md exists with full session schedule
□ Every session estimates ≤80K context (SAFE) — no session exceeds 100K
□ Complex-logic modules have their own dedicated sessions
□ Part 8 (Mobile) is ALWAYS sub-divided if mobile is declared
□ Dependency ordering is respected (schema → routers → UI → infra)
□ Read rules are specified per session (which PRODUCT.md sections, which files)
□ Skill activation schedule is included with Required/Recommended/Conditional ratings
□ All "Required" pre-build skills are installed before Phase 4 begins
□ Human has reviewed and approved (or adjusted) the plan
□ STATE.md updated: PHASE="Phase 3.5 complete — Execution Plan ready"
```
─────────────────────────────────────────────────────────

> **Open Claude Code and say "Start Phase 4". Claude Code reads execution-plan.md and runs the first session. After each session: STOP. Human opens next session.**

---

## PHASE 4 — FULL MONOREPO SCAFFOLD
**Who:** Claude Code (Part-by-Part, fresh session each Part — Rule 24 · Cline deprecated) | **Where:** VS Code — Claude Code terminal

> **⚠ CONTEXT BUDGET:** Run the Universal Context Budget pre-flight (top of this file) at the START of every Part. Estimate files + tokens. If >12 files or >80K tokens, sub-divide by module per the anti-thrashing rule below. The execution plan from Phase 3.5 pre-computes this — follow it.
>
> **⚠ MEMORY GOVERNANCE** (memory-governance.md): PRE: Run Tiered Decomposition (§1) per Part. POST: Run Smart Checkpoint (§2) after each Part. MODEL: Use Architect-Execute Model (§4) — Opus dispatches Sonnet subagents per Part.

Each Part runs in a FRESH Claude Code session (Rule 24 — prevents context accumulation).
Each Part stays under ~3,000 lines of context for best reliability.
Each Part: reads STATE.md first → reads `.cline/tasks/execution-plan.md` for sub-division assignments → branches → builds → validates → squash-merges → STOPS.

**IMPORTANT:** If `.cline/tasks/execution-plan.md` exists and shows sub-divisions for
the current Part, follow the sub-division plan. Build ONLY the modules assigned to this
sub-session. Do NOT build the entire Part in one session if the plan says to split it.

**SKILL CHECK:** At the start of each phase transition (Part 3, Part 5, Phase 5, Phase 6),
run `/scan-project` in Claude Code to verify skills are current. Check the Skill Activation
Schedule in `.cline/tasks/execution-plan.md` for the minimum required set. Skills persist
across sessions once installed — no need to reinstall per sub-session.

### ⚠ ANTI-THRASHING RULE — MANDATORY (applies to ALL Parts)

**Model context:** Claude Sonnet 4.6 via Claude Code. 200K token context window,
~120K practical working budget, ≤80K SAFE zone for input context. Every file read,
governance doc loaded, and PRODUCT.md section parsed consumes from this budget.
The 12-file threshold is calibrated for this model: each file + overhead averages
~6-8K tokens, so 12 files ≈ 80-96K ≈ the edge of the SAFE zone.

**Problem:** On large apps (15+ entities, 10+ modules), Parts 3-6 and Part 8 can trigger
"Autocompact is thrashing" — the context window fills within 3 turns because Claude Code
tries to read the entire PRODUCT.md + entire codebase at once.

**Rule:** At the START of every Part, BEFORE writing any code, Claude Code MUST:

1. Count the number of modules/entities relevant to this Part from PRODUCT.md
2. Estimate the token cost: CLAUDE.md (~5K) + active rules file (~3K) + PRODUCT.md
   sections (~2-4K each) + existing source files to read (~1-3K each) + governance
   docs (~10-15K) + output generation (~2-5K per file). If total exceeds 80K → MUST split.
3. IF the Part scope exceeds 12 files to create/modify OR estimated context exceeds
   80K tokens → the Part MUST be sub-divided into module-by-module sessions.
   Do NOT attempt to build everything in one session.
4. Report the sub-division plan to the human:
   ```
   ⚠ Part [N] scope assessment: [X] modules, ~[Y] files, ~[Z]K estimated tokens.
   Exceeds 80K SAFE zone. Splitting into sub-sessions:
     Part [N]a — [ModuleName]: [list of files] (~[N]K tokens)
     Part [N]b — [ModuleName]: [list of files] (~[N]K tokens)
     ...
   Starting with Part [N]a. I'll commit and stop after each sub-session.
   ```
5. IF the Part scope is ≤12 files AND estimated context is ≤80K → proceed normally.
6. The human may also FORCE sub-division at any time by saying:
   "Split this Part by module" — even if the threshold is not reached.

**Per sub-session rules (when sub-divided):**
- Read ONLY the PRODUCT.md sections for the current module — do NOT read the entire file
  (a full PRODUCT.md can be 20-40K tokens alone — reading it all defeats the purpose)
- Read ONLY the files relevant to the current module (routers, models, pages)
- Use codebase_search (Rule 17) to find specific symbols instead of opening files for context
- If you need a shared component or utility, read ONLY that single file — not the directory
- Build all files for this module, then run tests for this module
- Commit with message: "feat([part-scope]): [ModuleName] [what was built]"
- Update STATE.md with "Phase 4 Part [N] — [ModuleName] DONE, [remaining modules list]"
- STOP. Do NOT start the next module. Human opens a new session.

**Part 8 (Mobile) special handling:** Part 8 MUST ALWAYS be sub-divided regardless of
entity count, because it involves platform setup (Expo scaffold, WatermelonDB, push
notifications) plus per-module screen builds. Sub-divide as:
- 8a: Expo project scaffold + navigation + auth flow + theme provider
- 8b: WatermelonDB schema + sync engine + conflict resolution
- 8c: Push notification setup (Expo Push)
- 8d onward: One "Mobile First" module per session (skip "Mobile Ready" pages — 
  those are handled by responsive web in Parts 5-6)

**If thrashing occurs mid-session despite sub-division:**
1. Immediately run `/clear` to reset context
2. Update STATE.md with exact progress (which files done, which pending)
3. Write a handoff note to `.cline/handoffs/`
4. Commit all work done so far
5. STOP — human opens a new session with narrower scope

This rule exists because: many small commits that complete cleanly are infinitely better
than one large session that thrashes and produces broken or incomplete code.

---

Trigger: Open `.cline/tasks/phase4-part1.md` in a new Claude Code session → say "Start Part 1"
(Note: `.cline/tasks/` directory name preserved for historical continuity — Claude Code reads these task files.)
After Part 1 completes: open `phase4-part2.md` in a NEW Claude Code session → say "Start Part 2"
Continue until Part 8 completes. Then say "Start Phase 5" in a new Claude Code session.

Claude Code derives everything from `inputs.yml` — never hardcodes.

### PART 1 — Root config files

- `pnpm-workspace.yaml` — workspace package globs
- `turbo.json` — pipelines: lint, typecheck, test, build (with dependsOn)
- root `package.json` — root scripts delegating to turbo
- `tsconfig.base.json` — root TypeScript base config:
  ```json
  {
    "compilerOptions": {
      "strict": true,
      "noUncheckedIndexedAccess": true,
      "exactOptionalPropertyTypes": true,
      "noImplicitReturns": true,
      "noFallthroughCasesInSwitch": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true
    }
  }
  ```
- `.editorconfig` — consistent formatting across all editors
- `.prettierrc` — code formatting (singleQuote, semi, tabWidth: 2)
- `.eslintrc.js` — base ESLint with TypeScript rules:
  - `@typescript-eslint/no-explicit-any: error`
  - `@typescript-eslint/no-unsafe-assignment: error`
  - `@typescript-eslint/strict-boolean-expressions: error`
- `.gitignore` — final version (replaces Phase 0 bootstrap)
- `.nvmrc` — Node version pin

### PART 2 — packages/shared + packages/api-client
- `packages/shared/src/types/` — TypeScript interfaces for every entity
- `packages/shared/src/schemas/` — Zod schemas for all entities
- `packages/api-client/` — typed tRPC client or fetch wrappers
  (used by all apps — never by packages/db or workers)

### PART 3 — packages/db

Full ORM schema with ALL entities from PRODUCT.md (typed, relations included).
Initial migration files (up + down). Typed query helpers / repository layer per entity.
Seed script for dev data. `package.json` with exports field.
`tsconfig.json` extending `../../tsconfig.base.json`.

**Always generate — regardless of tenancy mode (Rule 7B):**

- `src/audit.ts` — AuditLog write helper (L5 — always active):
  ```ts
  // Immutable audit record on every mutation — active in single AND multi mode
  export async function writeAuditLog(tx, {
    tenantId, userId, action, entity, entityId, before, after
  }: AuditLogEntry): Promise<void>
  ```

- `src/middleware/tenant-guard.ts` — Prisma query guardrails (L6 — always active):
  ```ts
  // L6 — Prisma extension that auto-injects tenantId into EVERY query operation.
  // CRITICAL: uses $allOperations to cover findMany, findFirst, findUnique, create,
  // createMany, update, updateMany, delete, deleteMany, count, aggregate, groupBy.
  // DO NOT replace $allOperations with a list of individual methods — any unlisted
  // method becomes an unguarded tenant bypass.
  export const tenantGuardExtension = Prisma.defineExtension({
    query: {
      $allModels: {
        async $allOperations({ args, query, model, operation }) {
          // Skip system tables that are not tenant-scoped
          if (['AuditLog', 'Tenant'].includes(model)) return query(args);
          // Inject tenantId into where clause for reads and writes
          if ('where' in args) {
            args.where = { ...args.where, tenantId: currentTenantId() };
          }
          if ('data' in args && !Array.isArray(args.data)) {
            args.data = { ...args.data, tenantId: currentTenantId() };
          }
          return query(args);
        },
      }
    }
  });
  ```

- `AuditLog` Prisma model — always in schema:
  ```prisma
  model AuditLog {
    id        String   @id @default(cuid())
    tenantId  String?  @map("tenant_id")
    userId    String   @map("user_id")
    action    String   // CREATE | UPDATE | DELETE
    entity    String   // table name
    entityId  String   @map("entity_id")
    before    Json?
    after     Json?
    createdAt DateTime @default(now())

    @@index([tenantId])
    @@index([userId])
    @@index([entity, entityId])
  }
  ```

**Additionally if `tenancy.mode: multi` — (Rule 7 L2):**

- `src/rls.ts` — PostgreSQL RLS helper:
  ```ts
  export async function withTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }
  ```
- RLS migration (active, not commented):
  ```sql
  ALTER TABLE "Entity" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON "Entity"
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
  ```

**If `tenancy.mode: single` — write RLS as SQL comments for future upgrade:**
  ```sql
  -- RLS policy scaffolded but NOT enabled — uncomment on upgrade to multi:
  -- ALTER TABLE "Entity" ENABLE ROW LEVEL SECURITY;
  -- CREATE POLICY tenant_isolation ON "Entity"
  --   USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
  ```

### PART 4 — packages/ui + packages/jobs + packages/storage
- `packages/ui/` — shadcn/ui + Tailwind + Radix UI (web); React Native Reusables + NativeWind (mobile if declared)
- `packages/jobs/` — ONLY if jobs.enabled. Valkey (MIT Redis fork) + BullMQ typed queues, workers, DLQ.
- `packages/storage/` — ONLY if storage.enabled. Typed MinIO/S3/R2 wrapper.

### PART 5 — apps/[web app] (Next.js full scaffold)

**FIRST — Initialize shadcn/ui (V29 — before generating any component):**
```bash
# Run inside the web app directory: apps/[app-name]/
npx shadcn@latest init
# Select: New York style, CSS variables, globals.css path
# This creates components.json and configures Tailwind + CSS variables
# Then install base components every app needs:
npx shadcn@latest add button card dialog input label select textarea toast sonner
# Additional components added per PRODUCT.md requirements during this Part
```
IF PRODUCT.md declares dashboards/analytics → also run: `npx shadcn@latest add chart`
IF PRODUCT.md declares data tables → also run: `npx shadcn@latest add table data-table`
IF PRODUCT.md declares forms → also run: `npx shadcn@latest add form field`
IF PRODUCT.md declares sidebar navigation → also run: `npx shadcn@latest add sidebar`

Each web app in inputs.yml apps list gets:
- `tsconfig.json` extending `../../tsconfig.base.json`
- `src/env.ts` — ALL env vars typed and validated at startup (Zod)
- `src/app/` — App Router layout, pages for every module in spec
- `src/app/api/trpc/[trpc]/route.ts` — tRPC API handler
- `src/server/trpc/` — tRPC routers for every entity/module
- `src/server/auth/` — Auth.js / Keycloak / chosen auth provider config
- `src/middleware.ts` — tenant resolution from URL path or subdomain, auth guard
- `src/components/` — page-level components per module
- `next.config.ts` — typed Next.js config
- All source files `.ts` / `.tsx` only — zero `.js` in src/

**Always generate — regardless of tenancy mode (Rule 7B):**

- `src/server/trpc/middleware/rbac.ts` — RBAC role guard (L3 — always active):
  ```ts
  export const requireRole = (...allowedRoles: Role[]) =>
    t.middleware(({ ctx, next }) => {
      if (!ctx.roles.some(r => allowedRoles.includes(r))) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return next({ ctx });
    });
  ```

- `src/server/trpc/context.ts` — base tRPC context:
  ```ts
  export async function createTRPCContext({ req, res }) {
    const session = await getServerSession(req, res, authOptions);
    return {
      session,
      userId:   session?.user?.id ?? null,
      roles:    session?.user?.roles ?? [],
    };
  }
  ```

**Additionally if `tenancy.mode: multi` — (Rule 7 L1):**
  ```ts
  tenantId: session?.user?.tenantId ?? null,
  ```
- `src/server/trpc/middleware/tenant.ts` — tenant guard middleware

**`next.config.ts` — security headers (NEW V18 — always generate):**

GENERATE these HTTP security headers in every web app's `next.config.ts`.
These headers apply to every response. Never omit them. Never comment them out.

```ts
const securityHeaders = [
  // Prevent clickjacking — deny framing from other origins
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Prevent MIME type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Force HTTPS for 1 year, include subdomains
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // Disable browser features not needed by the app
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Control referrer information sent with requests
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Basic XSS protection for older browsers
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  // Content Security Policy — restrict resource loading to same origin by default
  // IMPORTANT: tighten this per app — add external domains your app loads from
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // tighten after dev
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/(.*)',   // apply to ALL routes
        headers: securityHeaders,
      },
    ];
  },
  // ... rest of config
};
```

**`src/server/lib/rate-limit.ts` — default rate limiter (NEW V18 — always generate):**

GENERATE this file in every web app. Uses in-memory store for dev/single-instance.
For multi-instance prod: swap the store for Redis (change 1 line — see comment).
ALWAYS wire this into the tRPC context so every route has rate limiting available.

```ts
// src/server/lib/rate-limit.ts
// In-memory rate limiter — works for single-instance deployments (default).
// For multi-instance (multiple app containers): replace LRUCache with Redis store.
// Import: import { rateLimit } from '@/server/lib/rate-limit'

import { LRUCache } from 'lru-cache';
import { TRPCError } from '@trpc/server';

type Options = {
  uniqueTokenPerInterval?: number;  // max unique tokens tracked (default: 500)
  interval?: number;                // window in ms (default: 60_000 = 1 minute)
  limit?: number;                   // max requests per token per window (default: 60)
};

export function rateLimit(options?: Options) {
  const tokenCache = new LRUCache<string, number[]>({
    max: options?.uniqueTokenPerInterval ?? 500,
    ttl: options?.interval ?? 60_000,
  });

  return {
    check: (token: string, limit?: number) => {
      const maxRequests = limit ?? options?.limit ?? 60;
      const tokenCount = tokenCache.get(token) ?? [];
      const now = Date.now();
      const windowStart = now - (options?.interval ?? 60_000);
      const requestsInWindow = tokenCount.filter((t) => t > windowStart);

      if (requestsInWindow.length >= maxRequests) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Rate limit exceeded. Try again later.',
        });
      }

      tokenCache.set(token, [...requestsInWindow, now]);
    },
  };
}

// Pre-configured limiters for common use cases.
// Use these in tRPC middleware or route handlers directly.
export const rateLimiters = {
  // Public endpoints (unauthenticated) — strict
  public: rateLimit({ interval: 60_000, limit: 30 }),
  // Auth endpoints (login, register, password reset) — very strict
  auth: rateLimit({ interval: 60_000, limit: 10 }),
  // Authenticated API calls — generous
  api: rateLimit({ interval: 60_000, limit: 120 }),
  // File upload endpoints — conservative
  upload: rateLimit({ interval: 60_000, limit: 20 }),
};
```

WIRE rate limiting into tRPC base procedure in `src/server/trpc/trpc.ts`:
```ts
// In the publicProcedure and protectedProcedure base:
// Use req IP or session userId as the rate limit token
const ip = req.headers['x-forwarded-for']?.toString() ?? req.socket.remoteAddress ?? 'unknown';
rateLimiters.api.check(ctx.session?.user?.id ?? ip);
```

**`src/server/lib/sanitize.ts` — HTML sanitizer for user-submitted content (NEW V18):**

GENERATE this file. Use it anywhere user-submitted content is stored and later rendered as HTML.
ALWAYS import and call `sanitize()` before writing user HTML content to the database.

```ts
// src/server/lib/sanitize.ts
// Strips dangerous HTML from user-submitted content before database storage.
// Prevents XSS — stored cross-site scripting attacks.
// Usage: const clean = sanitize(userInput)

import DOMPurify from 'isomorphic-dompurify';

export function sanitize(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    FORCE_BODY: true,
  });
}

// For plain text fields — strips ALL HTML
export function sanitizePlainText(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
```

ADD `isomorphic-dompurify` and `lru-cache` to the web app `package.json` dependencies.
These are runtime dependencies, not devDependencies.

**`Dockerfile` — production image (NEW V15 — generated if `docker.publish: true` in inputs.yml):**

Multi-stage build. Stage 1 installs deps, Stage 2 builds, Stage 3 is a minimal runtime image.
Next.js output must be set to `standalone` in `next.config.ts` for this to work.

```dockerfile
# Stage 1 — install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 2 — build
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Stage 3 — minimal production runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

**`next.config.ts` must include `output: 'standalone'` for the Dockerfile to work:**
```ts
const nextConfig = {
  output: 'standalone',
  // ... rest of config
};
```

**`.dockerignore`** — always generate alongside the Dockerfile:
```
node_modules
.next
.turbo
.git
.env*
!.env.example
*.md
coverage
.code-review-graph
```

⚠️ SKIP Dockerfile generation if `docker.publish: false` in inputs.yml.

### PART 6 — apps/[mobile app] (Expo full scaffold)

⚠️ Skip this part entirely if no mobile app is declared in inputs.yml.

If mobile app declared:
- `app.json` / `app.config.ts` — Expo config
- `eas.json` — EAS Build config for App Store + Play Store
- `src/env.ts` — typed env vars for mobile
- `src/components/ui/` — React Native Reusables + NativeWind setup
- `src/app/` — **Expo Router** screens for every mobile workflow in spec
- `src/api/` — uses `packages/api-client/` ONLY (NEVER packages/db — Rule 13)
- `src/storage/` — **WatermelonDB / AsyncStorage / MMKV** for local persistence
- `src/sync/` — offline queue + sync logic (only if offline-first declared)
- `src/notifications/` — **Expo Push** / FCM+APNs notification setup (only if declared)
- All source files `.ts` / `.tsx` only

### PART 7 — tools/ + deploy/compose/ + K8s scaffold + SocratiCode artifacts
- `tools/` — `validate-inputs.mjs`, `check-env.mjs`, `check-product-sync.mjs`, `hydration-lint.mjs`
  - `check-product-sync.mjs` — validates no private-tag content leaked into governance docs (Rule 20)
- `deploy/compose/dev|stage|prod/` — split compose files per service group (see templates below)
  - `docker-compose.app.yml` (dev) — uses `build:` + `image:` (builds from source, tags locally)
  - `docker-compose.app.yml` (stage) — uses `image:` ONLY — NO build: key — pulls tag from APP_IMAGE_TAG in .env.staging
  - `docker-compose.app.yml` (prod)  — uses `image:` ONLY — NO build: key — pulls tag from APP_IMAGE_TAG in .env.prod
  RULE: staging and prod compose files must NEVER have a build: key — Docker Hub pull only
- `deploy/compose/start.sh` — convenience startup script (dev: --build flag on app service)
- `deploy/compose/push.sh` — NEW V22: manual image promotion pipeline (dev→hub, dev→staging, staging→prod)
  Fill in APP_NAME from inputs.yml apps[0].name when generating this file.
  Fill in IMAGE_NAME from inputs.yml docker.image_name.
  CONDITIONAL: only generate if docker.publish: true in inputs.yml.
- `COMMANDS.md` — NEW V22: master reference of all dev commands (see template below)
- `deploy/k8s-scaffold/` — inactive placeholder with README
- `COMMANDS.md` (NEW V22 — generated at project root, HUMAN-readable reference):
⚠️ CONDITIONAL — only generate if docker.publish: true in inputs.yml.
Fill in APP_NAME, IMAGE_NAME, and APP_PORT from inputs.yml when generating.

```markdown
# [App Name] — Command Reference

All commands run from the project root unless noted otherwise.
ENV = dev | stage | prod

---

## 🐳 Docker — Start / Stop / Rebuild

| Command | What it does |
|---|---|
| `bash deploy/compose/start.sh dev up -d` | Start all dev services (DB + cache + storage + app). App rebuilds from source. |
| `bash deploy/compose/start.sh dev down` | Stop all dev services (containers removed, volumes preserved) |
| `bash deploy/compose/start.sh dev restart` | Restart all dev services |
| `bash deploy/compose/start.sh stage up -d` | Start staging services (pulls image from Docker Hub) |
| `bash deploy/compose/start.sh prod up -d` | Start production services (pulls image from Docker Hub) |
| `docker compose -f deploy/compose/dev/docker-compose.app.yml logs -f` | Tail app logs in real time |
| `docker compose -f deploy/compose/dev/docker-compose.app.yml logs -f app` | Tail app container logs only |
| `docker compose -f deploy/compose/dev/docker-compose.app.yml ps` | Check service health status |
| `docker compose -f deploy/compose/dev/docker-compose.db.yml ps` | Check DB + PgBouncer health |

---

## 🧹 Docker — Clean / Clear / Reset

> ⚠ These commands are destructive. Read carefully before running.

| Command | What it does | Data lost? |
|---|---|---|
| `bash deploy/compose/start.sh dev down` | Stop + remove containers | ❌ No (volumes kept) |
| `bash deploy/compose/start.sh dev down --volumes` | Stop + remove containers + volumes | ✅ YES — all DB data |
| `docker compose -f deploy/compose/dev/docker-compose.app.yml build --no-cache` | Rebuild app image from scratch (ignores layer cache) | ❌ No |
| `docker builder prune -f` | Remove all dangling build cache | ❌ No |
| `docker builder prune -a -f` | Remove ALL build cache (free up disk space) | ❌ No |
| `docker system prune -f` | Remove stopped containers + dangling images + cache | ❌ No |
| `docker system prune -a -f` | Remove ALL unused images + containers + cache | ❌ No |
| `docker system prune -a -f --volumes` | Remove everything including volumes | ✅ YES — all data |
| `docker volume rm [APP_SLUG]_dev_postgres_data` | Remove dev PostgreSQL volume only | ✅ YES — dev DB data |
| `docker volume rm [APP_SLUG]_dev_valkey_data` | Remove dev Valkey volume only | ✅ YES — dev cache |
| `docker volume rm [APP_SLUG]_dev_minio_data` | Remove dev MinIO volume only | ✅ YES — dev files |
| `docker volume ls` | List all Docker volumes | — |
| `docker image ls` | List all Docker images | — |
| `docker image prune -f` | Remove all dangling images | ❌ No |
| `docker image rm [IMAGE_NAME]:dev-latest` | Remove specific image | ❌ No |

**Full dev environment reset (nuclear — wipes all dev data and rebuilds):**
```bash
bash deploy/compose/start.sh dev down --volumes   # stop + remove volumes
docker builder prune -f                            # clear build cache
bash deploy/compose/start.sh dev up -d             # rebuild + restart
pnpm db:migrate                                    # re-run migrations
pnpm db:seed                                       # re-seed (creates webmaster account)
```

---

## 📦 Docker — Image Build & Push (Manual Pipeline)

| Command | What it does |
|---|---|
| `bash deploy/compose/push.sh dev` | Build app image from source, run tests, push dev tags to Docker Hub |
| `bash deploy/compose/push.sh staging` | Re-tag last dev image as staging, push to Docker Hub |
| `bash deploy/compose/push.sh prod` | Re-tag last staging image as production, push to Docker Hub |
| `docker pull [IMAGE_NAME]:staging-latest` | Pull staging image on staging server |
| `docker pull [IMAGE_NAME]:latest` | Pull prod image on production server |

**Tag format:**
- `:dev-latest` — latest dev build (mutable)
- `:dev-sha-{hash}` — specific dev commit (immutable)
- `:staging-latest` — latest promoted to staging (mutable)
- `:staging-sha-{hash}` — specific staging commit (immutable)
- `:latest` — current production (mutable)
- `:prod-sha-{hash}` — specific production commit (immutable)

**Rollback:** change image tag in docker-compose.app.yml → `docker compose up -d`

---

## 🗄️ Database

| Command | What it does |
|---|---|
| `pnpm db:migrate` | Run all pending Prisma migrations |
| `pnpm db:generate` | Regenerate Prisma client after schema change |
| `pnpm db:seed` | Run seed script — creates webmaster account + demo data |
| `pnpm db:reset` | Drop + recreate + migrate + seed (**dev only** — destroys all dev data) |
| `pnpm db:studio` | Open Prisma Studio at http://localhost:5555 (visual DB browser) |
| `pnpm db:migrate --create-only` | Create migration file without running it |
| `pnpm db:migrate deploy` | Run migrations on staging/prod (safe — no data loss) |

**First admin account** (created by `pnpm db:seed`):
| Field | Value |
|-------|-------|
| Username | `webmaster` |
| Password | `[22-char generated — stored in CREDENTIALS.md under "First Admin Account"]` |
| URL | http://localhost:[APP_PORT]/login |

⚠ Change the webmaster password immediately after first production login.

---

## 🧪 Testing

| Command | What it does |
|---|---|
| `pnpm test` | Run all tests (unit + integration) |
| `pnpm test --watch` | Watch mode (re-runs on file change) |
| `pnpm test --coverage` | With coverage report |
| `pnpm test --passWithNoTests` | No-fail if no test files yet |

---

## 🔍 Code Quality

| Command | What it does |
|---|---|
| `pnpm lint` | ESLint across all packages |
| `pnpm lint --fix` | Auto-fix lint issues |
| `pnpm typecheck` | TypeScript type check (tsc --noEmit) |
| `pnpm format` | Prettier format all files |
| `pnpm build` | Full production build via Turborepo |
| `pnpm audit --audit-level=high` | Dependency CVE scan |
| `pnpm audit --fix` | Auto-fix CVEs where possible |

---

## ⚙️ Governance & Validation

| Command | What it does |
|---|---|
| `pnpm tools:validate-inputs` | Validate inputs.yml against schema |
| `pnpm tools:check-env` | Check all required env vars are set |
| `pnpm tools:check-product-sync` | Validate PRODUCT.md ↔ inputs.yml alignment + private tag check |
| `pnpm tools:hydration-lint` | Check for SSR hydration mismatches |

---

## 🌿 Git Workflow (Rule 23)

| Command | What it does |
|---|---|
| `git checkout -b feat/{slug}` | Create feature branch before any work |
| `git add -A && git commit -m "feat(module): description"` | Atomic conventional commit |
| `git checkout main && git merge --squash feat/{slug}` | Squash-merge to main |
| `git branch -d feat/{slug}` | Delete feature branch after merge |
| `git rev-parse --short HEAD` | Get short SHA (used in image tags) |

---

## 🤖 AI Agent Triggers

| What to say in Claude Code | What it does |
|---|---|
| `Feature Update` | Start Phase 7 — implement a PRODUCT.md change |
| `Start Phase 8` | Begin iterative buildout loop |
| `Resume Session` + 3 docs | Resume from STATE.md position |
| `Governance Sync` + 9 docs | Reconcile code ↔ governance docs |
| `Governance Retro` | Run retrospective on last session |
| `Edge Case Recovery` + description | Trigger Scenario 29 exact procedure |
| `Re-run Phase 2.7` | Re-run spec stress-test |

---

## 🔌 Dev Services — URLs

| Service | URL | Credentials |
|---|---|---|
| App | http://localhost:[APP_PORT] | — |
| pgAdmin | http://localhost:[PGADMIN_PORT] | See CREDENTIALS.md |
| MinIO Console | http://localhost:[STORAGE_CONSOLE_PORT] | See CREDENTIALS.md |
| MailHog | http://localhost:[SMTP_UI_PORT] | No auth |
| Prisma Studio | http://localhost:5555 | No auth |

> All ports are in `.env.dev` — run `cat .env.dev | grep _PORT` to see them all.

---

## 🔐 Credentials & Secrets

| Command | What it does |
|---|---|
| `cat CREDENTIALS.md` | View all credentials (gitignored — safe to view locally) |
| `grep -i password CREDENTIALS.md` | Quick lookup of all passwords |
| `openssl rand -base64 32` | Generate a strong 32-char secret |
| `openssl rand -hex 24` | Generate a strong 48-char hex secret |
| `openssl rand -base64 32 \| tr -d '\n' \| head -c 22` | Generate a strong 22-char mixed password |
| `git status \| grep CREDENTIALS` | Verify CREDENTIALS.md is NOT tracked by git |
| `git rm --cached CREDENTIALS.md` | Untrack CREDENTIALS.md if accidentally committed |

> ⚠ CREDENTIALS.md is gitignored. If others clone your repo they will NOT see it.
> They must run Phase 3 to generate their own credentials from .env.example.

---

## 🛠️ Utilities

| Command | What it does |
|---|---|
| `cat .env.dev \| grep _PORT` | List all assigned ports for dev environment |
| `docker stats` | Live CPU/memory/network stats for all containers |
| `docker exec -it [APP_SLUG]_dev_postgres psql -U [DB_USER] -d [DB_NAME]` | Open PostgreSQL shell |
| `docker exec -it [APP_SLUG]_dev_valkey valkey-cli -a [REDIS_PASSWORD]` | Open Valkey (Redis) CLI |
| `docker logs [APP_SLUG]_dev_app --tail 100` | Last 100 lines of app logs |
| `docker inspect [APP_SLUG]_dev_app \| grep IPAddress` | Get container IP address |
| `pnpm --filter @[app-slug]/web dev` | Start only the web app (no Docker) |
| `pnpm turbo run build --filter=@[app-slug]/web` | Build only the web app |
| `git log --oneline -10` | Last 10 commits |
| `git rev-parse --short HEAD` | Current commit short SHA (used in image tags) |

---

## 🔁 Common Full Workflow

```bash
# 1. Start dev environment
bash deploy/compose/start.sh dev up -d

# 2. Develop + test locally
pnpm test && pnpm typecheck && pnpm lint

# 3. When ready to push to Docker Hub (dev)
bash deploy/compose/push.sh dev

# 4. When ready for staging
bash deploy/compose/push.sh staging
# On staging server: docker compose pull && docker compose up -d

# 5. When ready for production
bash deploy/compose/push.sh prod
# On prod server: docker compose pull && docker compose up -d
```
```

**`.socraticodecontextartifacts.json`** — SocratiCode context artifacts config.
  **MERGE, never overwrite.** If Phase 2.6 already wrote a design-system entry, preserve it and add the 4 entries below alongside it:
  ```json
  {
    "artifacts": [
      {
        "name": "database-schema",
        "path": "./packages/db/prisma/schema.prisma",
        "description": "Complete Prisma schema — all models, relations, indexes. Use to understand data structure and relationships."
      },
      {
        "name": "implementation-map",
        "path": "./docs/IMPLEMENTATION_MAP.md",
        "description": "Current implementation state — what is built, what is pending. Use to understand project progress."
      },
      {
        "name": "decisions-log",
        "path": "./docs/DECISIONS_LOG.md",
        "description": "Locked architectural decisions — tech stack choices, tenancy model, security layers."
      },
      {
        "name": "product-definition",
        "path": "./docs/PRODUCT.md",
        "description": "Product spec — entities, roles, workflows, security requirements. The single source of truth."
      }
    ]
  }
  ```

**Compose file rules (all environments):**
- Every compose file uses `env_file: ../../.env.${ENV}` — never hardcode credentials inline
- Every stateful service (PostgreSQL, Valkey, MinIO) declares a named volume using the pattern:
  `${APP_SLUG}_${ENV}_${service}_data` — guarantees full data isolation between environments
- `docker-compose.db.yml` always starts first — it creates the shared Docker network
- All other compose files reference the network as `external: true`
- Staging and prod use standard ports (5432, 6379, 9000) — dev uses non-standard ports from inputs.yml
- **Mono-server default:** All services run on the same host for dev/staging/prod.
  To externalize any service: update the HOST env var in `.env.${ENV}` and remove that
  service's compose file from the startup sequence. Zero code changes required.

**Compose file templates (Claude Code generates for all 3 environments — dev/stage/prod):**

`deploy/compose/{env}/docker-compose.db.yml`:
```yaml
# Runs PostgreSQL + PgBouncer on the same host (mono-server default)
# To externalize: remove this file from startup, set DB_HOST in .env.{env}
networks:
  app_network:
    name: ${COMPOSE_PROJECT_NAME}_network
    driver: bridge

volumes:
  postgres_data:
    name: ${COMPOSE_PROJECT_NAME}_postgres_data
  pgbouncer_data:
    name: ${COMPOSE_PROJECT_NAME}_pgbouncer_data

services:
  postgres:
    image: postgres:16-alpine
    container_name: ${COMPOSE_PROJECT_NAME}_postgres
    hostname: ${COMPOSE_PROJECT_NAME}_postgres
    env_file: ../../.env.${ENV}
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
    hostname: ${COMPOSE_PROJECT_NAME}_pgbouncer
    env_file: ../../.env.${ENV}
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
```

`deploy/compose/{env}/docker-compose.cache.yml`:
```yaml
# Runs Valkey (Redis-compatible) on the same host (mono-server default)
# To externalize: remove this file from startup, set REDIS_URL in .env.{env}
networks:
  app_network:
    name: ${COMPOSE_PROJECT_NAME}_network
    external: true

volumes:
  valkey_data:
    name: ${COMPOSE_PROJECT_NAME}_valkey_data

services:
  valkey:
    image: valkey/valkey:7-alpine
    container_name: ${COMPOSE_PROJECT_NAME}_valkey
    hostname: ${COMPOSE_PROJECT_NAME}_valkey
    env_file: ../../.env.${ENV}
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
```

`deploy/compose/{env}/docker-compose.storage.yml`:
```yaml
# Runs MinIO (S3-compatible) on the same host (mono-server default)
# To externalize: remove this file from startup, set STORAGE_ENDPOINT in .env.{env}
networks:
  app_network:
    name: ${COMPOSE_PROJECT_NAME}_network
    external: true

volumes:
  minio_data:
    name: ${COMPOSE_PROJECT_NAME}_minio_data

services:
  minio:
    image: minio/minio:latest
    container_name: ${COMPOSE_PROJECT_NAME}_minio
    hostname: ${COMPOSE_PROJECT_NAME}_minio
    env_file: ../../.env.${ENV}
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
```

`deploy/compose/{env}/docker-compose.infra.yml` (dev only — MailHog):
```yaml
networks:
  app_network:
    name: ${COMPOSE_PROJECT_NAME}_network
    external: true

services:
  mailhog:
    image: mailhog/mailhog:latest
    container_name: ${COMPOSE_PROJECT_NAME}_mailhog
    hostname: ${COMPOSE_PROJECT_NAME}_mailhog
    ports:
      - "${SMTP_PORT}:1025"
      - "${SMTP_UI_PORT}:8025"
    networks: [app_network]
    restart: unless-stopped
```

`deploy/compose/{env}/docker-compose.pgadmin.yml` (NEW V16 — all environments):
```yaml
# pgAdmin 4 — PostgreSQL web management UI
# Access: http://localhost:${PGADMIN_PORT}
# Credentials: PGADMIN_EMAIL + PGADMIN_PASSWORD from .env.{env}
# ⚠️  SECURITY: In staging and prod, restrict access via firewall or reverse proxy.
#     Never expose pgAdmin port directly to the public internet.
networks:
  app_network:
    name: ${COMPOSE_PROJECT_NAME}_network
    external: true

volumes:
  pgadmin_data:
    name: ${COMPOSE_PROJECT_NAME}_pgadmin_data

services:
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: ${COMPOSE_PROJECT_NAME}_pgadmin
    hostname: ${COMPOSE_PROJECT_NAME}_pgadmin
    env_file: ../../.env.${ENV}
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_EMAIL}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_PASSWORD}
      PGADMIN_CONFIG_SERVER_MODE: "False"
      PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED: "False"
    volumes:
      - pgadmin_data:/var/lib/pgadmin
      - ./pgadmin-servers.json:/pgadmin4/servers.json:ro
    ports:
      - "${PGADMIN_PORT}:80"
    networks: [app_network]
    depends_on:
      - postgres
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-O", "-", "http://localhost:80/misc/ping"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**`deploy/compose/{env}/pgadmin-servers.json`** — pre-configured server connection (NEW V16):
Claude Code generates this file alongside `docker-compose.pgadmin.yml` for each environment.
pgAdmin reads it on first startup — no manual server registration needed.
```json
{
  "Servers": {
    "1": {
      "Name": "${APP_SLUG} ${ENV}",
      "Group": "Spec-Driven",
      "Host": "${COMPOSE_PROJECT_NAME}_postgres",
      "Port": 5432,
      "MaintenanceDB": "${DB_NAME}",
      "Username": "${DB_USER}",
      "SSLMode": "prefer",
      "PassFile": "/pgpassfile"
    }
  }
}
```
Note: pgAdmin connects to PostgreSQL via the Docker internal network hostname
(`${COMPOSE_PROJECT_NAME}_postgres`) — not localhost. This works because both
containers share the same Docker network (`${COMPOSE_PROJECT_NAME}_network`).

`deploy/compose/start.sh`:
```bash
#!/bin/bash
# Usage: bash deploy/compose/start.sh [dev|stage|prod] [up -d|down|restart]
# Dev: rebuilds the app image from source on every up (--build flag applied to app only)
# Stage/Prod: pulls pre-built image from Docker Hub — never builds from source
ENV=${1:-dev}
CMD=${@:2}
BASE=deploy/compose/$ENV

docker compose -f $BASE/docker-compose.db.yml $CMD
docker compose -f $BASE/docker-compose.cache.yml $CMD
docker compose -f $BASE/docker-compose.storage.yml $CMD
docker compose -f $BASE/docker-compose.pgadmin.yml $CMD
if [ "$ENV" = "dev" ]; then
  docker compose -f $BASE/docker-compose.infra.yml $CMD
fi
# Dev: --build forces rebuild from source every time (decision C: always rebuild)
if [ "$ENV" = "dev" ] && [[ "$CMD" == *"up"* ]]; then
  docker compose -f $BASE/docker-compose.app.yml up --build -d
else
  docker compose -f $BASE/docker-compose.app.yml $CMD
fi
```

`deploy/compose/push.sh` (NEW V22 — manual image promotion pipeline):
```bash
#!/bin/bash
# =============================================================
# Image promotion pipeline — manual, you decide when to push
# =============================================================
# Usage:
#   bash deploy/compose/push.sh dev       — build + tag + push dev image to Docker Hub
#   bash deploy/compose/push.sh staging   — re-tag last dev image as staging, push
#   bash deploy/compose/push.sh prod      — re-tag last staging image as prod, push
#
# Prerequisites:
#   docker login                          — run once before first push
#   DOCKERHUB_USERNAME in your shell env  — or update IMAGE_BASE below
#
# Requires: docker.publish: true in inputs.yml
# =============================================================

set -e  # exit on any error

# ── Config (Claude Code fills these from inputs.yml during Phase 4 Part 7) ──
IMAGE_BASE="${DOCKERHUB_USERNAME:-yourusername}/${IMAGE_NAME:-appname}"
DOCKERFILE="apps/${APP_NAME:-web}/Dockerfile"
SHORT_SHA=$(git rev-parse --short HEAD)
TIMESTAMP=$(date +%Y%m%d-%H%M)

# ── Guard: docker.publish check ──
if ! grep -q "publish: true" inputs.yml 2>/dev/null; then
  echo "❌ docker.publish is not set to true in inputs.yml. Aborting."
  exit 1
fi

# ── Guard: docker login check ──
if ! docker info 2>/dev/null | grep -q "Username"; then
  echo "❌ Not logged in to Docker Hub. Run: docker login"
  exit 1
fi

TARGET=${1:-dev}

case "$TARGET" in

  dev)
    echo "🔨 Building dev image from source..."
    docker build       --file "$DOCKERFILE"       --tag "${IMAGE_BASE}:dev-latest"       --tag "${IMAGE_BASE}:dev-sha-${SHORT_SHA}"       --platform linux/amd64       .

    echo "🧪 Running full-stack tests before push..."
    bash deploy/compose/start.sh dev up -d
    sleep 5  # wait for services to be healthy
    docker compose -f deploy/compose/dev/docker-compose.app.yml       exec app pnpm test --passWithNoTests || {
        echo "❌ Tests failed. Aborting push. Fix tests before pushing."
        bash deploy/compose/start.sh dev down
        exit 1
      }
    bash deploy/compose/start.sh dev down

    echo "📤 Pushing dev image to Docker Hub..."
    docker push "${IMAGE_BASE}:dev-latest"
    docker push "${IMAGE_BASE}:dev-sha-${SHORT_SHA}"

    echo "✅ Dev image pushed:"
    echo "   ${IMAGE_BASE}:dev-latest"
    echo "   ${IMAGE_BASE}:dev-sha-${SHORT_SHA}"
    echo ""
    echo "▶  To promote to staging: bash deploy/compose/push.sh staging"
    ;;

  staging)
    echo "🔁 Promoting dev image → staging..."
    docker pull "${IMAGE_BASE}:dev-latest"
    docker tag  "${IMAGE_BASE}:dev-latest"       "${IMAGE_BASE}:staging-latest"
    docker tag  "${IMAGE_BASE}:dev-latest"       "${IMAGE_BASE}:staging-sha-${SHORT_SHA}"
    docker push "${IMAGE_BASE}:staging-latest"
    docker push "${IMAGE_BASE}:staging-sha-${SHORT_SHA}"

    echo "✅ Staging image pushed:"
    echo "   ${IMAGE_BASE}:staging-latest"
    echo "   ${IMAGE_BASE}:staging-sha-${SHORT_SHA}"
    echo ""
    echo "📋 On your staging server, run:"
    echo "   docker compose -f deploy/compose/stage/docker-compose.app.yml pull"
    echo "   docker compose -f deploy/compose/stage/docker-compose.app.yml up -d"
    echo ""
    echo "▶  To promote to prod: bash deploy/compose/push.sh prod"
    ;;

  prod)
    echo "🚀 Promoting staging image → production..."
    docker pull "${IMAGE_BASE}:staging-latest"
    docker tag  "${IMAGE_BASE}:staging-latest"   "${IMAGE_BASE}:latest"
    docker tag  "${IMAGE_BASE}:staging-latest"   "${IMAGE_BASE}:prod-sha-${SHORT_SHA}"
    docker push "${IMAGE_BASE}:latest"
    docker push "${IMAGE_BASE}:prod-sha-${SHORT_SHA}"

    echo "✅ Production image pushed:"
    echo "   ${IMAGE_BASE}:latest"
    echo "   ${IMAGE_BASE}:prod-sha-${SHORT_SHA}"
    echo ""
    echo "📋 On your production server, run:"
    echo "   docker compose -f deploy/compose/prod/docker-compose.app.yml pull"
    echo "   docker compose -f deploy/compose/prod/docker-compose.app.yml up -d"
    echo ""
    echo "🔄 To rollback: edit docker-compose.app.yml image tag to a previous sha tag"
    echo "   e.g. image: ${IMAGE_BASE}:prod-sha-{previous-sha}"
    ;;

  *)
    echo "Usage: bash deploy/compose/push.sh [dev|staging|prod]"
    exit 1
    ;;
esac
```

### PART 8 — CI + governance docs + MANIFEST.txt + SocratiCode index
**`.github/workflows/ci.yml`** — **GitHub Actions** CI:
```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

env:
  NODE_VERSION: "22"

jobs:
  governance:
    name: Governance gates
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: "${{ env.NODE_VERSION }}", cache: "pnpm" }
      - run: corepack enable  # CI runner is Linux root — safe here (WSL2 dev uses npm install -g pnpm instead)
      - run: pnpm install --frozen-lockfile
      - run: pnpm tools:validate-inputs
      - run: pnpm tools:check-env
      - run: pnpm tools:check-product-sync   # also checks private tag leakage

  quality:
    name: "Turbo ${{ matrix.task }}"
    needs: governance
    runs-on: ubuntu-latest
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        task: [lint, typecheck, test, build]
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: "${{ env.NODE_VERSION }}", cache: "pnpm" }
      - run: corepack enable  # safe on CI — Linux root (WSL2 dev uses npm install -g pnpm)
      - run: pnpm install --frozen-lockfile
      - uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ runner.os }}-${{ github.ref_name }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-${{ github.ref_name }}-
            turbo-${{ runner.os }}-
      - run: pnpm turbo run ${{ matrix.task }} --cache-dir=.turbo

  security:
    name: Dependency vulnerability audit
    needs: governance
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: "${{ env.NODE_VERSION }}", cache: "pnpm" }
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - name: Audit for high and critical vulnerabilities
        run: pnpm audit --audit-level=high
        # FAIL the build on HIGH or CRITICAL severity vulnerabilities.
        # MODERATE and LOW severities are reported but do not block the build.
        # To review audit results without blocking: change --audit-level=high to --audit-level=critical
        # To fix: run pnpm audit --fix or manually update the vulnerable package.
```

**`docker-publish.yml`** — Docker Hub image build + push (V15, updated V27):
⚠️ CONDITIONAL — only generate if `docker.publish: true` in inputs.yml. Skip entirely if false.

```yaml
# .github/workflows/docker-publish.yml
# Builds and pushes a production Docker image to Docker Hub on every push to main.
# Two primary tags pushed per run:
#   :staging-latest — Komodo auto-update polls for this tag (staging auto-redeploy)
#   :latest         — used for manual production deploy from Komodo UI
# Requires two GitHub repository secrets:
#   DOCKERHUB_USERNAME — your Docker Hub username
#   DOCKERHUB_TOKEN    — Docker Hub access token (not your password — create at hub.docker.com → Account Settings → Security)

name: Docker Build & Publish

on:
  push:
    branches: [main]
  workflow_dispatch:  # allow manual trigger from GitHub Actions UI

concurrency:
  group: docker-${{ github.ref }}
  cancel-in-progress: true

env:
  IMAGE_NAME: ${{ secrets.DOCKERHUB_USERNAME }}/${{ vars.DOCKER_IMAGE_NAME }}
  # ⚠️ BEFORE FIRST PUSH: add DOCKER_IMAGE_NAME as a GitHub Actions variable
  # (repo → Settings → Secrets and variables → Variables → New variable)
  # Value = the image_name from your inputs.yml docker section (e.g. nucleus-erp)

jobs:
  build-and-push:
    name: Build & push image
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up QEMU (multi-platform support)
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract metadata (tags + labels)
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=raw,value=staging-latest,enable={{is_default_branch}}
            type=sha,prefix=sha-,format=short
            type=ref,event=branch

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./apps/${app_name}/Dockerfile
          push: true
          platforms: linux/amd64,linux/arm64
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**After generating this file, add to DECISIONS_LOG.md:**
```
Docker image publishing: enabled
Registry:    docker.io (Docker Hub)
Repository:  ${docker.hub_repo}
Image name:  ${docker.image_name}
Tags:        latest (main branch) + sha-{short} (every push)
Platforms:   linux/amd64, linux/arm64
Trigger:     push to main only (Rule 23 squash-merge guarantees clean main)
Secrets needed in GitHub repo:
  DOCKERHUB_USERNAME — Docker Hub username
  DOCKERHUB_TOKEN    — Docker Hub access token (not password)
```

**Governance docs:** Append to `docs/CHANGELOG_AI.md` (Agent: CLAUDE_CODE).
Rewrite `docs/IMPLEMENTATION_MAP.md` — complete current state snapshot.

**`MANIFEST.txt`** — lists EVERY file generated across ALL 8 parts.

**SocratiCode initial index:**
After Part 8, Claude Code triggers SocratiCode to index the newly built codebase:
```
Ask AI: "Index this codebase"
→ codebase_index {}
→ codebase_status {} (poll until complete)
→ codebase_context_index {} (index the context artifacts)
```

After Part 8 complete → STOP. Human manually triggers Phase 5: say "Start Phase 5" in a new Claude Code session. This is consistent with Rule 24 fresh-context discipline — never auto-chain phases.

---

─────────────────────────────────────────────────────────
PHASE 4 OUTPUT CONTRACT — MANDATORY (applies to every Part 1–8)
Before reporting any Part complete and before squash-merging, verify:
□ All expected files for this Part exist (run find command to confirm)
□ pnpm lint: 0 errors for files changed in this Part
□ pnpm typecheck: 0 errors for files changed in this Part
□ STATE.md rewritten with PHASE="Phase 4 Part N complete"
□ CHANGELOG_AI.md entry written for this Part
□ scaffold/part-N branch squash-merged to main, branch deleted
IF ANY item fails → Part = INCOMPLETE → fix → re-verify → then merge
─────────────────────────────────────────────────────────

## PHASE PROGRESSION — HUMAN-TRIGGERED (V26)

Each phase runs in its own Claude Code session. Human triggers the next phase explicitly.
No auto-chaining. This is consistent with Rule 24 fresh-context discipline.

```
Phase 4 Part 8 complete → STOP
    ↓ human says "Start Phase 5"
Phase 5 — runs all 9 validation commands, self-heals failures → STOP
    ↓ human says "Start Phase 6"
Phase 6 — starts Docker services, runs migrations + seed, runs Visual QA → STOP
    ↓ human says "Feature Update" for Phase 7
Phase 7 — the daily loop. Each Feature Update is its own cycle.
```

**Why human-triggered:** Gives you a natural checkpoint between phases. You can pause,
inspect outputs, fix environment issues, or take a break. Fresh context per phase
produces better results than accumulating context across phase boundaries.

**Triggers:**
```
After Phase 4 Part 8 completes: say "Start Phase 5" in a new Claude Code session
After Phase 5 passes:           say "Start Phase 6" in a new Claude Code session
After Phase 6 completes:        say "Feature Update" for each new feature (Phase 7)
```

---

## PHASE 5 — VALIDATION
**Who:** Claude Code (human-triggered: "Start Phase 5" — Cline deprecated) | **Where:** WSL2 terminal

> **⚠ CONTEXT BUDGET:** Run the Universal Context Budget pre-flight (top of this file) before starting. Estimate scope + tokens. If >12 files or >80K tokens, split validation into module groups.
>
> **⚠ MEMORY GOVERNANCE** (memory-governance.md): PRE: Run Tiered Decomposition (§1). POST: Run Smart Checkpoint (§2) if files changed.

─────────────────────────────────────────────────────────
PHASE 5 PRE-FLIGHT — CREDENTIAL COMPLETENESS GATE — MANDATORY (NEW V30)
Before running validation commands, verify CREDENTIALS.md has no unfilled required placeholders:

□ Run: grep -c "⏳" CREDENTIALS.md
   - IF the count returns 0: all placeholders filled → proceed to validation.
   - IF count > 0: identify which sections still have ⏳ markers and check if they are REQUIRED.

□ REQUIRED sections (block Phase 5 if ⏳ present):
   - 🐙 GitHub: Username + Personal Access Token
   - 🐳 Docker Hub: Username + Access Token (only if docker.publish: true in inputs.yml)
   - 📧 SMTP: Host + Port + Username + Password + From address + From name (staging/prod only — dev uses MailHog)
   - 🦎 Komodo: UI URL (only if deployment.manager: komodo in inputs.yml)
   - 💳 Xendit: All API keys + webhook token (only if payment.gateway: xendit in inputs.yml)
   - 🛡️ Cloudflare Turnstile: LIVE Site Key + LIVE Secret Key (prod only — dev/staging use pre-filled test keys)

□ OPTIONAL sections (allow ⏳ to remain — validation passes):
   - Komodo webhook URLs + webhook secret (only needed for legacy webhook-triggered deploys)
   - Third-Party API Keys (project-specific — fill as you integrate each service)

□ IF any REQUIRED field still has ⏳:
   → Output:
     "🔴 Phase 5 blocked — CREDENTIALS.md has unfilled required fields:
        [list each unfilled section with ⏳ marker]

      Open CREDENTIALS.md and replace the ⏳ placeholders with real values from:
        - GitHub: github.com/settings/tokens (PAT with repo + workflow scope)
        - Docker Hub: hub.docker.com → Account Settings → Security → New Access Token
        - SMTP: your email provider (Gmail app password, SendGrid API key, etc.)
        - Komodo: your Komodo Core UI URL
        - Xendit: dashboard.xendit.co → Settings → API Keys (test + live)
        - Turnstile: dash.cloudflare.com → Turnstile → your widget → copy keys

      After filling: run 'bash scripts/sync-credentials-to-env.sh' to propagate values
      into .env.dev / .env.staging / .env.prod. Then retry 'Start Phase 5'."
   → STOP. Do not run validation commands.

□ IF all REQUIRED fields are filled (only OPTIONAL ⏳ remain): proceed to validation.

Note: Phase 5 does not read credential VALUES — only checks for unfilled ⏳ markers.
This gate catches the case where a human forgot to fill credentials after Bootstrap completed
with placeholders. Running validation with placeholder values would cause cryptic failures
(e.g. "authentication failed" on the DB) instead of a clear "fill CREDENTIALS.md" message.
─────────────────────────────────────────────────────────

Claude Code runs all 9 commands. Fixes every failure before proceeding.

```bash
pnpm install --frozen-lockfile
pnpm tools:validate-inputs
pnpm tools:check-env
pnpm tools:check-product-sync
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --audit-level=high
```

The 9th command — `pnpm audit` — scans all dependencies for known CVEs.
FAIL if any HIGH or CRITICAL vulnerability is found. Fix before proceeding to Phase 6.

**CVE resolution decision tree (NEW V21) — follow in order, do not skip steps:**
```
Step 1: Run pnpm audit --fix
  IF all HIGH/CRITICAL CVEs resolved → re-run audit → confirm clean → proceed.

Step 2 (if Step 1 fails): Upgrade the affected package to its latest major version.
  IF all CVEs resolved → run pnpm test → if tests pass → proceed.

Step 3 (if Steps 1+2 fail — no available fix exists):
  → Write to DECISIONS_LOG.md:
      UNFIXED CVE: [CVE ID] in [package]@[version]
      No fix available as of [date]. Risk accepted: YES.
      Mitigation: [e.g. "package not exposed to user input"]
  → Add to .npmrc: audit-level=critical
  → Append 🔴 gotcha to lessons.md: "Unfixed HIGH CVE: [package] — revisit on next pnpm update"
  → Output: "⚠ Unfixed HIGH CVE accepted with documented mitigation — see DECISIONS_LOG.md"
  → Proceed to Phase 6.

CRITICAL CVE (any step): NEVER accept unfixed.
  → Output HANDOFF_OUTPUT immediately. Escalate to human. Do not proceed.
```

Never suppress TypeScript errors with `any` — fix at source.
All 9 commands must pass (or HIGH CVE explicitly mitigated per above) before Phase 6.

If running manually: run in WSL2 terminal.

─────────────────────────────────────────────────────────
PHASE 5 OUTPUT CONTRACT — MANDATORY
Before proceeding to Phase 6, verify ALL of these:
□ pnpm install --frozen-lockfile: exit 0
□ pnpm tools:validate-inputs: exit 0
□ pnpm tools:check-env: exit 0
□ pnpm tools:check-product-sync: exit 0
□ pnpm lint: 0 errors (warnings allowed)
□ pnpm typecheck: 0 errors
□ pnpm test: all tests pass
□ pnpm build: exit 0
□ pnpm audit --audit-level=high: 0 HIGH or CRITICAL CVEs
IF ANY command fails → fix before proceeding → do not start Phase 6 with failing validation
─────────────────────────────────────────────────────────

**When all 9 pass → Phase 5 is complete. Output "✅ Phase 5 complete. Say 'Start Phase 6' in a new Claude Code session."**
Human triggers Phase 6 explicitly.

---

## PHASE 6 — START DOCKER SERVICES
**Who:** Claude Code (human-triggered: "Start Phase 6" — Cline deprecated) or you manually | **Where:** WSL2 terminal

> **⚠ CONTEXT BUDGET:** Run the Universal Context Budget pre-flight (top of this file) before starting. Phase 6 typically reads compose files + .env + governance docs — estimate tokens before proceeding.
>
> **⚠ MEMORY GOVERNANCE** (memory-governance.md): PRE: Run Tiered Decomposition (§1). POST: Run Smart Checkpoint (§2) if files changed.

All `docker compose` commands run from the WSL2 Ubuntu terminal.
Docker Desktop provides the socket natively — no DinD, no socket mounts needed.

**⚠️ Always start `docker-compose.db.yml` first.**

**Dev/Test ports are NON-STANDARD** (set in inputs.yml during Phase 3, locked in .env.dev):
Services use unique random ports derived from a per-project base (Rule 22 Part A).
Example: base=42731 → PostgreSQL:42731, Valkey:42733, App:42741, MinIO:42734.
Never conflicts with other projects or standard services running on the same machine.
Never hardcode port numbers — always read from `process.env` which derives from .env.

One-command startup (recommended):
```bash
bash deploy/compose/start.sh dev up -d
```

Or individually:
```bash
docker compose -f deploy/compose/dev/docker-compose.db.yml up -d      # FIRST
docker compose -f deploy/compose/dev/docker-compose.cache.yml up -d
docker compose -f deploy/compose/dev/docker-compose.storage.yml up -d
docker compose -f deploy/compose/dev/docker-compose.infra.yml up -d
docker compose -f deploy/compose/dev/docker-compose.app.yml up -d
```

After services are up:
```bash
pnpm db:migrate
pnpm db:seed
```

App, MinIO, MailHog ports shown in .env.dev after Phase 3 generation.
Run `cat .env.dev | grep _PORT` to see assigned ports.

**After services are healthy — Phase 6 Visual QA (Rule 16):**
─────────────────────────────────────────────────────────
PHASE 6 OUTPUT CONTRACT — MANDATORY
Before reporting complete, verify ALL of these:
□ All Docker services healthy (docker compose ps — no exited or unhealthy containers)
□ pnpm db:migrate succeeded — zero migration errors
□ pnpm db:seed succeeded — seed data populated
□ App responds at configured dev port (health endpoint returns HTTP 200)
□ Visual QA (Rule 16) passed — all pages load, no console errors, no layout breaks
□ STATE.md rewritten: PHASE="Phase 6 complete", NEXT="Feature Update (Phase 7)"
IF ANY item fails → Phase 6 = INCOMPLETE → fix → re-verify before proceeding
─────────────────────────────────────────────────────────

All checks pass → Phase 6 complete. Chain ends here.
Any check fails → Claude Code attempts one auto-fix, retries, writes handoff if still failing.

After Phase 6 completes, output EXACTLY:
```
✅ Phase 6 complete. Your app is live.

  App:     http://localhost:${APP_PORT}   (check .env.dev for actual port)
  MinIO:   http://localhost:${MINIO_CONSOLE_PORT}
  MailHog: http://localhost:${MAILHOG_PORT}

  Run: cat .env.dev | grep _PORT   to see all assigned ports.

⚡ CODE-REVIEW-GRAPH SETUP (run now — required before Phase 7):
  → In your WSL2 terminal (not Claude Code), run:
    cd /path/to/your/project
    code-review-graph build
  → This indexes the entire codebase into a SQLite knowledge graph.
  → Takes 1-3 minutes depending on codebase size.
  → After this, Claude Code can use blast radius analysis before every
    Feature Update — knowing exactly which files a change will affect.
  → See: https://github.com/tirth8205/code-review-graph

  Verify it worked:
    code-review-graph status
  → Should show: indexed files count, last build timestamp.

  If code-review-graph is not installed:
    See Scenario 21 in the framework for installation instructions.

Next steps:
→ To add features:    edit docs/PRODUCT.md → say "Feature Update" in Claude Code
→ To see what's left: say "Start Phase 8" in Claude Code
→ To run a retro:     say "Governance Retro" in Claude Code
→ All commands:       see README.md in your project root
```

---

## PHASE 6.5 — FIRST RUN ERROR TRIAGE
**Trigger:** Say "First Run Error" + paste full error output

> **⚠ CONTEXT BUDGET:** Run the Universal Context Budget pre-flight (top of this file). Error triage can snowball — if fixing requires touching >12 files, split into separate fix sessions per error category.
>
> **⚠ MEMORY GOVERNANCE** (memory-governance.md): PRE: Run Tiered Decomposition (§1). POST: Run Smart Checkpoint (§2) if files changed.

Diagnose from these categories:
- **ENV_MISSING** → check .env against .env.example
- **MIGRATION_FAILED** → run pnpm db:migrate
- **PORT_CONFLICT** → lsof -i :<port>, kill process, retry. Note: dev/test uses non-standard ports (e.g. 54320 for PG, 53000 for app) — if conflict still occurs, regenerate port assignments: edit inputs.yml port values → run Phase 7 → restart services
- **IMAGE_BUILD_FAILED** → fix exact failing Dockerfile line
- **DEPENDENCY_NOT_INSTALLED** → pnpm install --frozen-lockfile
- **TYPECHECK_FAILED** → fix at source per file + line, never suppress
- **SERVICE_UNHEALTHY** → check that compose group's logs
- **AUTH_MISCONFIGURED** → check AUTH_SECRET, NEXTAUTH_URL in .env
- **DB_CONNECTION_REFUSED** → verify DATABASE_URL matches compose service name
- **CORS_ERROR** → check allowed origins in middleware or tRPC config
- **VISUAL_QA_FAILED** → check browser console errors, verify seed data exists, check auth config
- **SOCRATICODE_NOT_INDEXED** → ensure Docker is running, run codebase_index, poll codebase_status
- **PRIVATE_TAG_LEAKED** → private-tagged content found in governance doc; run pnpm tools:check-product-sync to identify and remove
- **DESIGN_SYSTEM_MISSING** → design-system/MASTER.md referenced but not found; run Phase 2.6 manually or install UI UX Pro Max skill (`/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`) then re-run
- **PORT_ALREADY_BOUND** → generated dev port already in use; check lsof -i :<port>, update the port in inputs.yml + .env.dev, restart that compose service
- **PGADMIN_UNREACHABLE** → pgAdmin container started but UI not loading; common causes: (1) pgadmin_data volume permissions — fix: docker compose down → docker volume rm ${COMPOSE_PROJECT_NAME}_pgadmin_data → docker compose up -d; (2) pgadmin-servers.json missing or malformed — fix: verify file exists at deploy/compose/{env}/pgadmin-servers.json; (3) postgres container not yet healthy when pgAdmin started — fix: ensure postgres healthcheck passes before pgAdmin depends_on resolves; access URL: http://localhost:${PGADMIN_PORT}

Output format — EXACTLY this structure, no variations:
```
CATEGORY: [one of the category names above, e.g. ENV_MISSING]
ROOT CAUSE: [one sentence — what specifically is wrong]
FIX:
  [exact command 1]
  [exact command 2]
VERIFY: [exact command to confirm the fix worked]
```

---

## PHASE 7 — FEATURE UPDATE LOOP
**Who:** Claude Code (primary — Cline deprecated, do not use) | **Where:** VS Code

**This is the most important phase. Use it for EVERY change after Phase 4.**
Edit PRODUCT.md → trigger Phase 7 → agents implement everything and keep governance in sync.

> **⚠ CONTEXT BUDGET — MANDATORY FOR EVERY FEATURE UPDATE:**
> You are Claude Sonnet 4.6. Run the Universal Context Budget pre-flight (top of this file)
> BEFORE starting any Feature Update. Estimate total files to read + create + modify.
> If >12 files OR >80K estimated tokens → split the Feature Update into sub-features:
>   - Group related changes by module (e.g. "schema + router" then "UI pages" in separate sessions)
>   - Each sub-feature gets its own branch: `feat/[feature]-[module]`
>   - Commit + STOP after each sub-feature → human opens new session for next module
> Read ONLY the PRODUCT.md sections for the current feature — NEVER the full file.
> Use `codebase_search` (Rule 17) before opening source files.
>
> **⚠ MEMORY GOVERNANCE** (memory-governance.md): PRE: Run Tiered Decomposition (§1) — classify this Feature Update's complexity before touching any files. POST: Run Smart Checkpoint (§2) on completion. MODEL: Use Architect-Execute Model (§4) — Opus plans the feature decomposition, Sonnet executes each scoped task. **CRITICAL for Phase 7 on mature projects** — this is where thrashing is most common.

**Trigger:**
- Via Claude Code: say "Feature Update" — it reads all 9 governance docs automatically
- Via Copilot (emergency fallback only): say "Feature Update" + attach all 9 docs manually

**PRE-FLIGHT CHECK — MANDATORY before Phase 7 sequence (NEW V21):**
```
0. code-review-graph check:
   IF .code-review-graph/ directory exists:
   → Good — blast radius analysis is available for this Feature Update.
   IF .code-review-graph/ directory does NOT exist:
   → Output WARNING: "code-review-graph is not set up. Blast radius analysis
     will not be available. Run 'code-review-graph build' in WSL2 terminal
     to enable it. Continuing without it — using codebase_search as fallback."
   → Continue (not blocking — but blast radius won't be available).

1. inputs.yml existence check:
   IF inputs.yml does not exist:
   → Output GAP_REPORT: SECTION: inputs.yml  PROBLEM: File missing — Phase 7 cannot run
     FIX: Re-run Phase 3 to regenerate, or restore from git: git checkout main -- inputs.yml
   → STOP. Wait for human to restore the file before proceeding.

2. inputs.yml schema validation:
   Run: pnpm tools:validate-inputs
   IF validation fails:
   → Output GAP_REPORT: SECTION: inputs.yml  PROBLEM: Schema validation failed — [list errors]
     FIX: Fix each listed field in inputs.yml then re-run pnpm tools:validate-inputs
   → STOP. Wait for human to fix inputs.yml before proceeding.

3. Git branch existence check:
   IF branch feat/[feature-slug] already exists:
   → DO NOT create a new branch. DO NOT error.
   → Run: git checkout feat/[feature-slug]
   → Append to agent-log.md: "RESUMED existing branch feat/[slug] — branch already existed"
   → Inspect git log for any partial work already committed on this branch.
   → Continue from Phase 7 step 4 (SocratiCode search).
```

**Agent behavior — MANDATORY SEQUENCE. Execute in this exact order. Do not skip or reorder:**

1. Read all 9 context docs — lessons.md first (ALL 🔴 gotchas → ALL 🟤 decisions → rest). Do not proceed until all 9 are read.
2. CONDITIONAL (Rule 21) — Design system check:
   IF the feature changes any file in apps/[web]/src/components/, apps/[web]/src/app/, or packages/ui/:
     → run: codebase_context_search { name: "design-system" }
     → if design-system/pages/[page].md exists for the specific page being changed → use that file instead of MASTER.md
   IF design-system/MASTER.md does not exist → skip this step entirely. No warning. No error.
   IF the change is backend-only (packages/db, packages/jobs, tRPC routers only) → skip this step entirely.
3. CONDITIONAL (Rule 22) — Blast-radius check:
   IF code-review-graph is installed:
     → run: get_impact_radius_tool with the list of files that PRODUCT.md declares changed
     → run: get_review_context_tool with the impacted files list
     → use the returned file list as the scope for step 8 (implement)
   IF code-review-graph is not installed → skip this step entirely. Use codebase_search results as scope instead.
4. SocratiCode search (Rule 17): run codebase_search for the affected feature area. Do this before opening any file.
5. State current status in 3–5 bullets. Show what exists now and what will change.
6. Rule 9 check: verify PRODUCT.md change → inputs.yml alignment is valid in both directions. REFUSE if violated.
7. Rule 11 check: list every file that will be deleted. Do not delete anything until human confirms with "yes".
8. Rule 20 check: strip all <private>...</private> blocks from PRODUCT.md before processing its content.
9. Clarifying questions: ask ONLY if the answer would change the implementation AND is not already in DECISIONS_LOG.md. Maximum 3 questions. If answer is in DECISIONS_LOG.md — do not ask, use the logged decision.
10. Create git branch before writing any file (Rule 23):
   - Run: git checkout -b feat/[feature-slug-from-PRODUCT.md-change]
   - If branch already exists (resuming): git checkout feat/[slug]
   - NEVER write any file on main. Always on a feature branch.

11. Implement — LINEAR SUB-STEPS. Complete each before starting the next. No batching.

   Step 11a — TEST (MANDATORY — do this BEFORE writing any implementation code):
   - Write a failing test for the declared behaviour. Do not implement yet.
   - Run the test. Confirm it fails (RED). If it passes already: the feature exists — check scope.
   - Do not proceed to 11b until RED is confirmed.

   Step 11b — IMPLEMENT (scope = blast-radius only):
   - Modify ONLY the files returned by get_impact_radius_tool (step 3) or codebase_search (step 4).
   - If a file is not in the blast-radius result and not directly required → do not touch it.
   - Write the minimal code to make the test from 11a pass.
   - Run the test. Confirm it passes (GREEN). If still RED: fix before proceeding.
   - Refactor only after GREEN. Never scaffold devcontainer files (Rule 8).

   Step 11c — METADATA (CONDITIONAL: only if PRODUCT.md declares changed entities or config):
   - Update inputs.yml to match the PRODUCT.md change.
   - Update inputs.schema.json to match.
   - Update TypeScript types in packages/shared/ for any changed entity.
   - IF no entity or config changed: skip this sub-step. Note it in the commit message.

   Step 11d — PERSISTENCE (CONDITIONAL: only if any Prisma model was added, changed, or removed):
   - Write Prisma migration: up + down.
   - Run: pnpm db:generate
   - Verify migration runs clean: pnpm db:migrate
   - IF no model changed: skip this sub-step.

   Step 11e — COMMIT (MANDATORY):
   - One atomic git commit per logical unit of work.
   - Commit message format: feat(module): description  (conventional commits — no vague messages)
   - Delete files only if PRODUCT.md explicitly removes the feature (Rule 11 — confirmation first).
   - Do not bundle unrelated changes into one commit.
12. Update all governance docs — **non-blocking: append after implementation, not during**
   (CHANGELOG_AI with attribution per Rule 15, IMPLEMENTATION_MAP, DECISIONS_LOG if new decision,
   agent-log, lessons.md in Rule 18 typed format if error resolved or decision locked)

   GOVERNANCE SELF-CHECK (MANDATORY — run before proceeding to step 13):
   □ CHANGELOG_AI.md: last entry timestamp matches this session
   □ IMPLEMENTATION_MAP.md: updated to reflect the files changed in this Feature Update
   □ STATE.md: rewritten with current PHASE/LAST_DONE/NEXT
   IF any item missing or stale → fix it NOW. Do not proceed to step 13 with stale governance.

13. **Two-stage code review (Rule 25):**
    STAGE 1: Spec compliance — every behaviour declared in PRODUCT.md is implemented.
    STAGE 2: Code quality — no any types, tests written before code, only blast-radius files touched.
    Both stages must PASS before proceeding. Fix and re-check if either fails.
14. **Run Visual QA (Rule 16)** — check all pages touched by this update
15. **Run `codebase_update`** — refresh SocratiCode index with the new changes (Rule 17)
16. **Squash-merge + cleanup (Rule 23):** squash-merge feat/[slug] to main. Delete branch. Rewrite STATE.md.
17. Update all governance docs — **non-blocking: append after merge, not during**
    (CHANGELOG_AI with attribution per Rule 15, IMPLEMENTATION_MAP, DECISIONS_LOG if new decision,
    agent-log, lessons.md in Rule 18 typed format if error resolved or decision locked)
18. Deliver: Claude Code writes directly. Others: delta ZIP with DELTA_MANIFEST.txt.
19. Remind to verify: pnpm tools:check-product-sync && pnpm typecheck && pnpm test && pnpm build

─────────────────────────────────────────────────────────
PHASE 7 OUTPUT CONTRACT — MANDATORY
Before reporting Feature Update complete, verify ALL of these:
□ All 5 sub-steps (11a–11e) completed and confirmed
□ Two-stage code review: Stage 1 (spec compliance) PASS + Stage 2 (code quality) PASS
□ CHANGELOG_AI.md: entry written with this session's timestamp and Agent: CLAUDE_CODE
□ IMPLEMENTATION_MAP.md: updated to reflect new feature state
□ STATE.md: rewritten with PHASE="Phase 7 complete", LAST_DONE=[feature name], NEXT="Feature Update or Phase 8"
□ feat/[slug] branch squash-merged to main and deleted
□ SocratiCode index refreshed via codebase_update
IF ANY item fails → Feature Update = INCOMPLETE → fix before marking done
─────────────────────────────────────────────────────────

---

## PHASE 7R — FEATURE ROLLBACK
**Trigger:**
- Via Claude Code: say "Feature Rollback: [feature name]" — reads all 9 governance docs automatically
- Via Copilot (emergency fallback only): say "Feature Rollback: [feature name]" + attach all 9 docs manually

> **⚠ CONTEXT BUDGET:** Run the Universal Context Budget pre-flight (top of this file). Rollbacks can touch many files across modules. If the feature spans >12 files, split the rollback into module-by-module sessions: revert schema first, then routers, then UI — commit after each group.
>
> **⚠ MEMORY GOVERNANCE** (memory-governance.md): PRE: Run Tiered Decomposition (§1). POST: Run Smart Checkpoint (§2) if files changed.

1. Find feature entry in CHANGELOG_AI.md
2. List all files + migrations to revert
3. Show rollback plan — wait for confirmation
4. On confirmation: remove files, write down-migrations, update governance docs
5. Write rollback entry to lessons.md as 🟢 change
6. Run `codebase_update` — refresh SocratiCode index to reflect the rollback
7. Deliver: Claude Code writes directly to workspace. Others: delta ZIP with DELTA_MANIFEST.txt.

---

## PHASE 8 — ITERATIVE BUILDOUT
**Who:** Claude Code (primary — Cline deprecated) | **Trigger:** "Start Phase 8" (Claude Code reads 9 docs auto)

> **⚠ CONTEXT BUDGET:** Run the Universal Context Budget pre-flight (top of this file) before every batch. Estimate files + tokens for the proposed batch. If >12 files or >80K tokens, split into per-feature sub-batches per the anti-thrashing rule below.
>
> **⚠ MEMORY GOVERNANCE** (memory-governance.md): PRE: Run Tiered Decomposition (§1) — classify this batch before starting. POST: Run Smart Checkpoint (§2) after each sub-batch. MODEL: Use Architect-Execute Model (§4) — Opus plans the batch decomposition, Sonnet executes each feature. **CRITICAL for Phase 8** — multiple features per batch makes thrashing almost certain without Opus planning.

Cross-references PRODUCT.md vs IMPLEMENTATION_MAP.md and proposes the next batch.
Repeats until PRODUCT.md is fully implemented.

**Agent outputs EXACTLY this format:**
```
📋 PHASE 8 — NEXT BUILD BATCH PROPOSAL
─────────────────────────────────────────────────────────
Built so far (from IMPLEMENTATION_MAP.md):
  ✅ [list what is confirmed built]

Not yet built (declared in PRODUCT.md but missing from map):
  ⬜ [item 1] — [one-line description]
  ⬜ [item 2] — [one-line description]

Proposed next batch (highest value / most unblocking):
  1. [feature/module] — [why this is highest priority]
  2. [feature/module] — [why this comes second]
  3. [feature/module] — [why this comes third]

Confirm this batch, reorder, or tell me what to change.
Reply "confirmed" to begin.
─────────────────────────────────────────────────────────
```

Wait for confirmation — do NOT start building until confirmed.
On confirmation: run Phase 7 Feature Update for each item in the batch.
After each batch: update all governance docs. Show updated "Not yet built" list.

### ⚠ ANTI-THRASHING RULE — MANDATORY (applies to ALL Phase 8 Batches)

**Model context:** Claude Sonnet 4.6 via Claude Code. 200K token context window,
~120K practical working budget, ≤80K SAFE zone for input context. Every file read,
governance doc loaded, and PRODUCT.md section parsed consumes from this budget.
The 12-file threshold is calibrated for this model: each file + overhead averages
~6-8K tokens, so 12 files ≈ 80-96K ≈ the edge of the SAFE zone.

**Problem:** On large apps with many modules, Phase 8 batches trigger "Autocompact is thrashing"
because Claude Code tries to read the full PRODUCT.md + full codebase + all governance docs
at once, filling the 120K context window within 2-3 turns. Features get silently dropped,
code gets generated incomplete, or the session produces broken output.

**CRITICAL PRINCIPLE:** Anti-thrashing exists to PROTECT the build, not to shortcut it.
Every feature in PRODUCT.md MUST be built — splitting into sub-batches changes HOW MANY
things are built per session, never WHAT gets built. Skipping or deferring features
without explicit human approval is a governance violation.

**Rule:** AFTER the batch is confirmed but BEFORE writing any code, Claude Code MUST:

1. **Scope assessment** — list every file that will be created or modified across ALL items
   in this batch (routers, services, pages, components, tests, migrations, types)
2. **Estimate the token cost:** CLAUDE.md (~5K) + active rules file (~3K) + PRODUCT.md
   sections (~2-4K each) + existing source files to read (~1-3K each) + governance
   docs (~10-15K) + output generation (~2-5K per file). If total exceeds 80K → MUST split.
3. IF the batch scope exceeds 12 files to create/modify OR estimated context exceeds
   80K tokens → the batch MUST be sub-divided into per-feature sub-batches.
   Do NOT attempt to build multiple features in one session.
4. Report the sub-division plan:
   ```
   ⚠ Phase 8 Batch [N] scope assessment: [X] features, ~[Y] files, ~[Z]K estimated tokens.
   Exceeds 80K SAFE zone. Splitting into sub-batches:
     Batch [N]-1 — [FeatureName]: [list of files] (~[N]K tokens)
     Batch [N]-2 — [FeatureName]: [list of files] (~[N]K tokens)
     Batch [N]-3 — [FeatureName]: [list of files] (~[N]K tokens)
   Starting with Batch [N]-1. I'll commit and stop after each sub-batch.
   ```
5. IF the batch scope is ≤12 files AND estimated context ≤80K → proceed as a single session.
6. The human may also FORCE sub-division at any time by saying:
   "Split this batch by feature" — even if the threshold is not reached.

**Per sub-batch rules (when sub-divided):**
- Read ONLY the PRODUCT.md sections for the current feature — do NOT read the entire file
  (a full PRODUCT.md can be 20-40K tokens alone — reading it all defeats the purpose)
- Read ONLY the codebase files relevant to the current feature
- Use codebase_search (Rule 17) to find specific symbols instead of opening files for context
- If you need a shared component or utility, read ONLY that single file — not the whole directory
- Cross-reference against PRODUCT.md before completing: verify every field, validation rule,
  permission, and UI element described for this feature is actually implemented
- Run tests for this feature
- Update governance docs for this feature (CHANGELOG_AI, IMPLEMENTATION_MAP, agent-log)
- Commit with message: "feat([feature-slug]): [what was built]"
- Update STATE.md with:
  ```
  Phase 8 Batch [N] progress:
    ✅ [N]-1 [FeatureName] — DONE ([files created/modified])
    ⬜ [N]-2 [FeatureName] — REMAINING
    ⬜ [N]-3 [FeatureName] — REMAINING
  Dependencies for next sub-batch: [any shared code or DB changes this sub-batch created
  that the next one needs to know about]
  ```
- STOP. Do NOT start the next feature. Human opens a new session.

**Completeness check (MANDATORY before marking a sub-batch DONE):**
Before committing, Claude Code MUST re-read the PRODUCT.md section for the current feature
and verify:
  □ Every user flow described is implemented (happy path + error states)
  □ Every data field in the entity is present in the Prisma schema, tRPC router, and UI form
  □ Every permission/role guard matches the Roles & Permissions table
  □ Every validation rule in the spec has a matching Zod schema
  □ Every UI element described (buttons, tables, filters, modals) exists in the page
  □ If the feature connects to another module, the integration point is wired
IF any item is missing → implement it before committing. Do NOT leave it for a future batch
unless the human explicitly says to defer it.

**If thrashing occurs mid-session despite sub-division:**
1. Immediately run `/clear` to reset context
2. Update STATE.md with exact progress (which files done, which pending for THIS feature)
3. Write a handoff note to `.cline/handoffs/` with: what's done, what's remaining,
   any partial code that needs completion
4. Commit all work done so far (even if incomplete — partial progress > lost progress)
5. STOP — human opens a new session with narrower scope for the remaining work

**Why this matters:** Phase 8 batches that thrash produce the most dangerous kind of bug —
features that LOOK complete in IMPLEMENTATION_MAP.md but are actually missing validations,
permission guards, error states, or entire user flows. The completeness check catches this
before it becomes invisible tech debt.

**Adaptive replanning after each batch (NEW V14 — from GSD-2):**
After every batch completes, BEFORE proposing the next batch:
1. Re-read PRODUCT.md and IMPLEMENTATION_MAP.md.
2. Check: does anything learned during this batch change the remaining items?
   - Did a technical constraint emerge that makes item X harder or impossible?
   - Did implementing item A reveal that item B needs to be split into two?
   - Did a decision lock out a previously planned approach?
3. IF the remaining plan needs to change: show the proposed change + reason. Ask confirmation before updating.
4. IF the plan is still valid: proceed with next batch proposal as normal.
Output EXACTLY:
```
🔄 ROADMAP CHECK after batch [N]
Remaining items reviewed: [count]
Plan change needed: YES / NO
[If YES: what changes and why]
[If NO: "Remaining plan is still valid — proceeding to next batch"]
```

**When PRODUCT.md is fully implemented → generate README.md:**
```
README.md must include:

## Running the App
  Start all services:    bash deploy/compose/start.sh dev up -d
  Stop all services:     bash deploy/compose/start.sh dev down
  Restart a service:     docker compose -f deploy/compose/dev/docker-compose.[service].yml restart

## Development Commands (run in WSL2 terminal)
  Install dependencies:  pnpm install
  Start dev server:      pnpm dev
  Run tests:             pnpm test
  Type check:            pnpm typecheck
  Lint:                  pnpm lint
  Build:                 pnpm build

## Database
  Run migrations:        pnpm db:migrate
  Seed dev data:         pnpm db:seed
  Reset DB:              pnpm db:reset
  Open Prisma Studio:    pnpm db:studio
  Generate client:       pnpm db:generate

## Governance Tools
  Validate spec:         pnpm tools:validate-inputs
  Check env vars:        pnpm tools:check-env
  Check sync:            pnpm tools:check-product-sync
  Hydration lint:        pnpm tools:hydration-lint
  Log a lesson:          bash scripts/log-lesson.sh
                         (or VS Code: Cmd/Ctrl+Shift+P → Tasks: Run Task → Log Lesson)

## Adding Features (the everyday workflow)
  1. Edit docs/PRODUCT.md — describe the change in plain English
  2. Say "Feature Update" in Claude Code — Claude Code implements everything automatically
  3. Run: pnpm tools:check-product-sync && pnpm typecheck && pnpm test

## Codebase Search (SocratiCode)
  Index codebase:        ask Claude Code "Index this codebase"
  Update index:          codebase_update {} (Claude Code does this automatically after Feature Update)
  Requires:              Docker running

## SpecStory — Change History
  All sessions auto-captured to .specstory/history/
  Attribution reconciliation: say "Governance Sync" in Claude Code

## Service URLs (dev/test — ports assigned during Phase 3, stored in .env.dev)
  View all ports:        cat .env.dev | grep _PORT
  App:                   http://localhost:${APP_PORT}
  MinIO console:         http://localhost:${MINIO_CONSOLE_PORT}
  pgAdmin (DB UI):       http://localhost:${PGADMIN_PORT}   (credentials in .env.dev)
  MailHog (email):       http://localhost:${MAILHOG_PORT}
  Prisma Studio:         http://localhost:${STUDIO_PORT} (when pnpm db:studio is running)
```

---

## SESSION RESUME
**Trigger:** "Resume Session" + attach 3 docs:
`project.memory.md` + `docs/IMPLEMENTATION_MAP.md` + `docs/DECISIONS_LOG.md`

> **⚠ CONTEXT BUDGET:** Resume reads 3 docs (~5-10K tokens) then continues the previous phase. After resuming, apply the context budget pre-flight for whatever phase you're continuing — estimate scope before building.

**Output EXACTLY this format:**
```
✅ Session restored — [App Name from project.memory.md]

BUILT SO FAR:
  [list each completed phase or feature from IMPLEMENTATION_MAP.md]

LOCKED DECISIONS:
  [list each locked decision from DECISIONS_LOG.md — one line each]

ACTIVE DEV MODE: MODE A — WSL2 native (only supported environment)
ACTIVE RULES: V31 — 30 rules. Rule 4 (read 9 docs first), Rule 17 (SocratiCode search), Rule 18 (typed lessons), Rule 21 (design system), Rule 22 (random ports + container naming, WSL2 native only), Rule 23 (git branching), Rule 24 (fresh context), Rule 25 (two-stage review), Rule 28 (priority ladder), Rule 29 (no fuzzy), Rule 30 (Context7). H1–H4 System Hardening active. UI Component Rules active (V29). Compact CLAUDE.md architecture active (V30). Claude Sonnet 4.6 primary (V30). Phase 2.8 Clickable Mockup Review active in Planning Assistant chat (V31).

Which phase are you continuing from?
```

---

## GOVERNANCE RETRO
**Trigger:** "Governance Retro" — Claude Code reads agent-log.md + CHANGELOG_AI.md + git log automatically

> **⚠ CONTEXT BUDGET:** Retro reads governance logs which can be large on mature projects. If agent-log.md + CHANGELOG_AI.md exceed 40K tokens combined, read only the last 2 weeks of entries.

```
📋 GOVERNANCE RETRO — [date range]
─────────────────────────────────────────────────────────
WHAT WAS BUILT
  ✅ [feature/fix] — [date] — Agent: [who]

ERRORS ENCOUNTERED AND RESOLVED
  🔧 [error type] — [date] — Fix: [what resolved it]

WHAT IS STILL IN PROGRESS
  ⏳ [item] — started [date], last touched [date]

GOVERNANCE HEALTH
  Rule 9 violations caught:  [count]
  Handoff files written:     [count]
  Lessons added to memory:   [count]
  Unattributed SpecStory diffs reconciled: [count]

VELOCITY
  Features shipped this week:  [count]
  Average feature cycle time:  [estimated from CHANGELOG timestamps]

RECOMMENDED FOCUS FOR NEXT SESSION
  [top 2–3 items from Phase 8 "not yet built" list]
─────────────────────────────────────────────────────────
```

---

## GOVERNANCE SYNC
**Trigger:**
- Via Claude Code: say "Governance Sync" — it reads all 9 governance docs + .specstory/history/ automatically
- Via Copilot (emergency fallback only): say "Governance Sync" + attach all 9 docs manually
- Conflict resolution variant: "Governance Sync — conflict resolution"

> **⚠ CONTEXT BUDGET:** Governance Sync reads 9 docs + SpecStory history. On mature projects this can exceed 80K tokens. If .specstory/history/ has many entries, read only entries since the last CHANGELOG timestamp — not the full history.

**Governance Sync reads SpecStory history for attribution reconciliation:**

```
CASE A — code drifted, PRODUCT.md untouched:
  "Governance Sync" + attach 9 docs
  Agent reads .specstory/history/ for diffs since last CHANGELOG entry
  Matches diffs to agent sessions → attributes COPILOT or HUMAN where no session found
  Shows reconciliation table → asks confirmation
  Updates CHANGELOG_AI.md with attributed entries

CASE B — code AND PRODUCT.md both changed:
  "Governance Sync — conflict resolution" + 9 docs
  Agent shows conflict table. You resolve each contradiction.
  Agent updates all governance docs + attributes SpecStory diffs.

Prevention: run Phase 7 for any change > 5 lines. One Governance Sync per day max.
```

---

## OPTIONAL TOGGLES (applied via Phase 7)

```yaml
tenancy:
  mode: multi

deploy:
  k8s:
    enabled: true

apps:
  - name: admin
    framework: next
    port: null  # Phase 3 assigns a random port from ports.dev.base+12 — never hardcode

jobs:
  enabled: true
  provider: bullmq

storage:
  enabled: true
  provider: minio
```

---

## HUMAN GUIDE — HOW TO ADD FEATURES OR CHANGE ANYTHING

> **Golden rule: edit `docs/PRODUCT.md` only. Agents do the rest.**

### LOG LESSON — Human quick-log for personal discoveries

**When to use:** You personally discovered something mid-session — a gotcha, a fix, a decision — and want it in lessons.md immediately in Rule 18 typed format, without waiting for Claude Code to write it after a completed task.

**Examples of when this is useful:**
- You found that a service port conflicts with another project running on the same machine
- You made a manual config decision outside of Claude Code (e.g. a .env choice)
- You learned something from the docs or a blog post that's directly relevant to your project
- You want to pre-warn Claude Code about a known pitfall before it hits it

**How to trigger:**
```
VS Code Command Palette → "Tasks: Run Task" → "Log Lesson"
```
Or from the WSL2 terminal:
```bash
bash scripts/log-lesson.sh
```

**What it asks (5 questions, ~30 seconds):**
1. Type? [1=🔴 gotcha  2=🟡 fix  3=🟤 decision  4=⚖️ trade-off  5=🟢 change]
2. Short title
3. Affected files (or "none")
4. Keywords / concepts
5. What happened and why does it matter?

**Output:** Appends a correctly formatted Rule 18 entry to `.cline/memory/lessons.md` immediately.
Claude Code reads it with correct priority (🔴 first) next session — no extra steps needed.

**Rule:** Never write free-form text to lessons.md directly. Always use this script or let Claude Code write it. The typed format is what allows Claude Code to read gotchas first and decisions second.


### ⚠️ CRITICAL — Never re-run Phase 2 on an existing project

For any change after Phase 4 — always use Phase 7.

If you accidentally re-ran Phase 2:
1. Say "STOP. Do not generate files. I accidentally re-ran Phase 2."
2. Attach 9 existing context docs
3. Ask agent to reconstruct inputs.yml from codebase + governance docs
4. Confirm reconstruction → proceed with Phase 7

---

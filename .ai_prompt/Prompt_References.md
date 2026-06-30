# Prompt References — Spec-Driven Platform V31

> **Purpose:** Every prompt you need from empty project folder to production-ready app.
> **Four scenario groups match your actual lifecycle — no noise, no filler.**
>
> **What's new in this edition:**
> - Added Group 4 — Planning Assistant Prompts (for the Planning Assistant session — Claude Code or Claude.ai)
> - Added 2.9 — Validate Spec Consistency (pre-Feature-Update sanity check)
> - Added 2.10 — Pause/Resume Mid-Part (safely interrupt Phase 4)
> - Added 3.12 — Lessons Audit (periodic lessons.md cleanup)
> - Added 3.13 — Dependency Health Check (weekly `pnpm audit`)
> - Added 3.14 — Rollback Safely (before dangerous operations)
> - Added 4.1-4.7 — Planning Assistant prompts for spec evolution + mid-chat template upgrade + visual continuity workflow
> - Added 1.2.5 — Credentials Setup Kit (comprehensive guide to gathering GitHub + Docker Hub + SMTP + 3rd-party credentials BEFORE Phase 3)
> - Added 1.7, 2.11-2.12, 3.15-3.18 — code-review-graph workflows (7 new prompts for blast-radius analysis, architecture maps, PR review, debug, onboarding)
> - Added 1.1.5 — Re-deploy V31 (restore clean state after hand-edits); expanded 3.11 — Future framework upgrade with safety-first workflow
> - Added 1.4.0 — Deep Pre-Upgrade Analysis (universal 8-dimension analyzer that runs before 1.4.2 — detects phase state, governance integrity, rule compliance, infrastructure gaps, and outputs prioritized fix plan)
> - Added 1.2.6 — Top Up CREDENTIALS.md (routine ongoing fill); Added 1.2.7 — Add New Credential Section Mid-Project (via Phase 7 governance)
> - Added 4.8 — Adopt a DESIGN.md Aesthetic (derives Visual Theme + Color Palette + Typography + Layout as shadcn/ui CSS variable overrides from a named theme direction; shadcn/ui is the only implementation); paired with new **Scenario 33** in scenarios.md
> - Added 4.9, 4.10, 4.11, 4.12 — **New Planning Assistant arrived?** decision-tree workflow for 4 distinct project states (spec done, mid-build, production, single-section backfill)
> - Added 1.8 — **Combined Upgrade: Framework + Planning Assistant** — enforces correct order (framework FIRST, Planning Assistant SECOND) when both upgrades are pending
> - Added **Planning Assistant Rule 11** — n8n + OpenClaw automation opt-in (signal detection in Step 5, conditional infra in Step 7, conditional Integrations template with workflow table). Zero footprint when not used. Handoff docs: `n8n-handoff.md` + `openclaw-handoff.md` (gitignored)
> - Added **4.13** — Add Automation to Existing Project (n8n / OpenClaw / Hybrid) — for when you didn't set up automation during initial planning but need it later mid-build or in production
> - Added **3.19** — Emergency Anti-Thrashing: Fix Autocompact Thrashing in Any Phase — general-purpose prompt for mid-session rescue + proactive scope assessment, works in any phase or situation
> - Added **3.20** — Memory Governance Baseline (V31.2) — first-time setup for existing Phase 7/8 projects, writes Claude Code memory for zero-cost resume
> - Added **3.21** — Opus Planning Session (V31.2) — Architect-Execute Model: Opus decomposes tasks, dispatches Sonnet subagents; 30K token budget gate per task
> - Added **3.22** — Thrashing Recovery (V31.2) — emergency Opus session to decompose interrupted work after thrashing; includes THRASHING status detection
> - Added **Scenario 34** — CREDENTIALS.md Agent-Proof Upgrade (local shell script pattern for credential file format upgrades that agents cannot read into context)
> - Expanded `.gitignore` entries across bootstrap, Master Prompt, deploy script — 21 new entries covering third-party AI tools (`.agents/`, `.cursor/`, `.windsurf/`, etc.) + automation handoff docs
> - **NEW — Interactive HTML version** available at `Prompt_References.html` (same content, browser UI with search, expand/collapse, one-click copy, responsive mobile layout)

---

## How the Spec-Driven AI Mega Prompt Works

The framework runs as a sequence of **phases** (Phase 0 → 8). Each phase has a strict **output contract** — it cannot close until that contract is satisfied. Some phases embed **skill sub-routines** that act as quality gates: the parent phase blocks until the sub-routine completes.

> **Mental model — the contract:** Phases drive the schedule. Skills are *gates inside* the phases. A phase does not advance until its gate is green.

### The three skill-gated activation windows

```
Phase 0 → 1 → 2 → 2.5            (bootstrap + interview — no gate)
                ↓
   ┌──────────────────────────────────────────────────────────────┐
   │  Phase 2.8   ▼ WINDOW 1 — visual baseline gate ▼             │
   │              PA emits MOCKUP.jsx + DESIGN.md                  │
   │              → /design-tokens   (expand tokens)               │
   │              → /design-review   (audit mockup)                │
   │              → /design-refine   (fix flagged components only) │
   │              ▲ Phase 2.8 cannot close until gate is green ▲   │
   └──────────────────────────────────────────────────────────────┘
                ↓
Phase 3 → 3.3 → 3.5              (spec files → prototype gate → exec plan)
                ↓
   ┌──────────────────────────────────────────────────────────────┐
   │  Phase 3.3   ▼ WINDOW 1.5 — interactive prototype gate ▼     │
   │              build client-validated prototype w/ simulated    │
   │              backend from MOCKUP.jsx + Phase 3 schema          │
   │              → /design-tokens · /design-review · /design-refine│
   │                (design system FINALIZES here — V32.6)          │
   │              ▲ cannot close until prototype is signed off ▲    │
   └──────────────────────────────────────────────────────────────┘
                ↓
Phase 4.1 → 4.2 → 4.3 → 4.4      (monorepo, DB, tRPC, Auth — no gate)
                ↓
   ┌──────────────────────────────────────────────────────────────┐
   │  Phase 4 Parts 5-6   ▼ WINDOW 2 — wire + regression gate ▼   │
   │              wire validated prototype → production backend    │
   │              (swap simulated layer for real tRPC/Prisma)       │
   │              → regression /design-review (confirm no break)    │
   │              ▲ Parts 5-6 cannot close until gate is green ▲   │
   └──────────────────────────────────────────────────────────────┘
                ↓
Phase 4.7 → 4.8 → 5 → 6           (jobs, storage, validate, Docker — no gate)
                ↓
   ┌──────────────────────────────────────────────────────────────┐
   │  Phase 7   ▼ WINDOW 3 — per-UI-feature gate ▼                 │
   │            feature touches UI?                                 │
   │              → re-run /design-review on diff                   │
   │              → /design-refine on flagged                       │
   │            ▲ feature cannot mark DONE until gate is green ▲   │
   └──────────────────────────────────────────────────────────────┘
                ↓
Phase 8 → buildout loop (gate re-fires per UI gap detected)
```

### The architectural contract behind the windows

| Role | Model | Job | Token Discipline |
|------|-------|-----|------------------|
| **Architect** | Opus 4.6 / 4.7 | Plan, decompose, dispatch — never execute writes > 200 lines directly | Stays in 200K window because it only plans |
| **Executor swarm** | Sonnet 4.6 (parallel) | Receive scoped slices, write code, run validations | ≤ 12 files OR ≤ 80K tokens per Sonnet |
| **Gate-keepers** | designer-skills (Phase 2.8 / 4.5-6 / 7) | Audit + refine UI tier; INHERIT-not-REPLACE the PA baseline | Reads MOCKUP.jsx + DESIGN.md, writes surgical refinements only |
| **Memory** | Smart Checkpoint Protocol (V31.1 → V32.3) | Auto-persist progress at 18 phase hooks; rehydrate on resume | Tiered Decomposition (Tier 1/2/3) prevents overflow |

**Why this prevents thrashing:**
- Opus stays inside its 200K window because it only **plans and dispatches** — it never reads 19 files itself.
- Sonnet swarms parallelize work without crossing each other's context. Each Sonnet gets a slice it can hold whole.
- Gate-keepers stop half-finished UI from leaking forward, so later phases don't have to re-do work.
- Memory governance auto-persists at every phase hook, so a `/clear` or autocompact never loses state.

---

## Prerequisites (already done before any prompt below runs)

- ✅ WSL2 Ubuntu installed, Node 22 + pnpm + Docker Desktop all working
- ✅ VS Code with Claude Code CLI installed (Cline extension optional — deprecated V31, kept installed only as emergency fallback)
- ✅ You already ran `Planning_Assistant.md` in claude.ai — final `PRODUCT.md` is ready (plus `DESIGN.md` if you chose a shadcn/ui theme direction in Phase 2.8 Step 0, plus the mockup HTML archive if you saved it per prompt 4.7)
- ✅ You have the 23 V32 framework files (17 in `.ai_prompt/` + `spec-executor.md` + `settings.json` deployed to `.claude/` + `deploy.sh` at project root + `lint-deploy.sh` deployed to `scripts/`) — see Appendix A for the V32 `spec-update` deployment workflow

## The Starting State

```
your-project/                      ← empty folder (or existing project)
├── .ai_prompt/                    ← you drop all 16 V32 reference files in here
│   ├── CLAUDE_compact.md
│   ├── Master_Prompt.md
│   ├── bootstrap.md
│   ├── phases.md
│   ├── security.md
│   ├── ui-rules.md
│   ├── scenarios.md
│   ├── templates.md
│   ├── memory-governance.md       ← V31.1 Memory Governance Layer (NEW)
│   ├── Planning_Assistant.md
│   ├── Framework_Feature_Index.md
│   ├── AI_Tools_Reference.md
│   ├── Security_Checklist.md
│   ├── ChatGPT_Cross_Audit.md
│   ├── Prompt_References.md       ← this file (markdown version)
│   └── Prompt_References.html     ← interactive UI (open in browser)
├── .claude/
│   ├── agents/
│   │   └── spec-executor.md       ← V32.7.2 Sonnet executor subagent (deployed by script)
│   └── settings.json              ← V32.7.2 framework settings caps (merge-deployed by script)
├── deploy.sh                  ← you drop this at project root (19th file)
└── docs/
    ├── PRODUCT.md                 ← from Planning Assistant — required
    ├── DESIGN.md                  ← from Planning Assistant Step 7b — if you chose a shadcn/ui theme direction in Phase 2.8
    └── mockups/                   ← from prompt 4.7 — if you saved the Phase 2.8 mockup HTML archive
        └── [appname]-phase-2.8-mockup.html
```

Tip: on V32 machines, skip the manual `.ai_prompt/` copy step — use `spec-update .` (Appendix A) which syncs all 16 files + runs deploy in one command.

---

# SCENARIO GROUP 1 — Start from Empty Project (or adopt existing)

Run these **once** to bootstrap the project and scaffold the full codebase.

## 1.1 — Deploy the V31 framework files

**Where:** WSL2 terminal at project root

```bash
bash deploy.sh
```

**What it does:** Copies `CLAUDE.md` (to project root) and `.ai_prompt/*` (all 7 detail files: `phases.md`, `memory-governance.md`, `security.md`, `ui-rules.md`, `bootstrap.md`, `scenarios.md`, `templates.md` — read on-demand), and `AI/Master_Prompt.md` into the project. `.claude/rules/` is intentionally left empty (V32.7) — CLAUDE.md auto-loads; detail files are Read explicitly per task. Appends V31 entries to `.gitignore` (preserves your existing entries). Intelligent — skips anything already present, backs up anything it overwrites, refuses to touch PRODUCT.md / CREDENTIALS.md / .env / your app code.

---

## 1.1.5 — Re-deploy V31 framework (restore clean state — NEW)

**When:** You've hand-edited `CLAUDE.md` or files in `.ai_prompt/` and want to restore stock V31 state. Also useful if framework files get corrupted, accidentally deleted, or you suspect they've drifted from canonical V31.

**Where:** WSL2 terminal at project root.

**Important:** This is different from 1.1 (initial deploy) in intent only — the command is the same. The deploy script is idempotent by design.

### 1.1.5.1 — Verify you have the stock V31 files

Ensure `.ai_prompt/` contains the 15 stock V31 files (download from your V31_Complete_Set backup if unsure). If your `.ai_prompt/` has hand-edits, restore those from backup first — the deploy script reads from `.ai_prompt/`, so any edits there will propagate into your project.

### 1.1.5.2 — Run the deploy script

```bash
bash deploy.sh
```

**What it does:**
- Backs up your current `CLAUDE.md` as `CLAUDE.md.YYYYMMDD_HHMMSS.bak`
- Backs up each `.ai_prompt/*.md` file the same way
- Copies stock V31 files from `.ai_prompt/` into their target locations
- Leaves `.gitignore` alone if V31 entries already present (additive only)
- **Never touches:** `docs/PRODUCT.md`, `CREDENTIALS.md`, `.env.*` files, `apps/`, `packages/`, `deploy/`

### 1.1.5.3 — Verify restoration

```bash
# Check compact CLAUDE.md is stock (~200 lines)
wc -l CLAUDE.md

# Check .claude/rules/ is empty (V32.7 — all detail files now in .ai_prompt/)
ls .claude/rules/

# Check .ai_prompt/ contains all 7 detail files (phases, memory-governance, security, ui-rules, bootstrap, scenarios, templates)
ls .ai_prompt/

# Check Master Prompt reference is present
ls AI/Master_Prompt.md
```

### 1.1.5.4 — Clean up old backups (after verification)

Once you're sure the restore worked:

```bash
# Remove the auto-backups from this restore
rm -f CLAUDE.md.*.bak
rm -f .ai_prompt/*.bak
```

**Why this prompt exists:** Nothing in V31 actively prevents you from editing CLAUDE.md or the modular rules — those files are HUMAN-owned by design. But if you break something while editing, you need a safe, documented way back. This is it.

---

## 1.2 — Run the Universal Analyzer

**Where:** WSL2 terminal at project root
```bash
claude
```

**Paste this as your first message:**
```
Analyze this project's current state and tell me exactly what setup path to follow.

You are reading the new V31 compact CLAUDE.md. Before suggesting any action, scan the
filesystem thoroughly and produce a detection report.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DETECTION — run all checks, do not modify any file
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Check 1 — V31 framework files in place:
  [ ] CLAUDE.md at project root — confirm it's the compact (~200 line) version
  [ ] .claude/rules/ is empty (V32.7); all 7 detail files are in .ai_prompt/
  [ ] .ai_prompt/ contains 7 detail files: phases.md, memory-governance.md, security.md, ui-rules.md, bootstrap.md, scenarios.md, templates.md
  [ ] AI/Master_Prompt.md exists

Check 2 — PRODUCT.md state:
  [ ] docs/PRODUCT.md exists and has all 11 required sections

Check 3 — Governance docs state:
  [ ] docs/DECISIONS_LOG.md, CHANGELOG_AI.md, IMPLEMENTATION_MAP.md
  [ ] project.memory.md, inputs.yml, inputs.schema.json
  [ ] .cline/memory/lessons.md, agent-log.md

Check 4 — Runtime artifacts:
  [ ] CREDENTIALS.md (count remaining ⏳ markers)
  [ ] .env.dev / .env.staging / .env.prod
  [ ] scripts/sync-credentials-to-env.sh
  [ ] .vscode/mcp.json (3 servers: socraticode, context7, shadcn)

Check 5 — App code presence:
  [ ] package.json, pnpm-workspace.yaml
  [ ] apps/, packages/, deploy/ folders
  [ ] What framework stack is used (Spec-Driven default or something else)?

Check 6 — Prior version indicators:
  [ ] CLAUDE.md.*.bak files?
  [ ] AI/Master_Prompt_v2*.md (older versions)?
  [ ] CHANGELOG_AI.md entries referencing V24/V25/V26/V27/V28/V29/V30?
  [ ] L6 security layer: middleware ($use) or extension ($allOperations)?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROUTING — assign ONE situation based on checks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Situation A — GREENFIELD (empty project)
  Signals: V31 files ✅, no apps/, no inputs.yml, no CHANGELOG_AI entries.
  → Next: Run prompt 1.3 (Bootstrap)

Situation B — V31 UPGRADE (existing Spec-Driven, older version)
  Signals: apps/ or packages/ has Spec-Driven stack code, inputs.yml exists,
           CHANGELOG_AI has CLAUDE_CODE/CLINE entries, prior version indicators.
  → Next: Run prompt 1.4 (V31 Upgrade Reconciliation)

Situation C — BROWNFIELD (existing non-Spec-Driven project)
  Signals: apps/ or src/ has code but NOT Spec-Driven stack (Laravel, Django, Rails,
           old Next.js pages, etc.), no governance docs, no inputs.yml.
  → Next: Run prompt 1.5 (Brownfield Adoption)

Situation D — AMBIGUOUS
  Signals: mixed state — partial migration, abandoned prior version, etc.
  → Next: Run prompt 1.6 (Manual Triage)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — mandatory
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

═══════════════════════════════════════════════════════════════════
V31 PROJECT STATE ANALYSIS
═══════════════════════════════════════════════════════════════════
V31 framework files:    [ALL PRESENT / PARTIAL: list / NOT DEPLOYED]
docs/PRODUCT.md:        [EXISTS — N/12 sections / MISSING]
Governance docs:        [N of 9 exist / NONE]
Runtime artifacts:      [list with counts]
App code detected:      [YES — stack: X / NO — empty]
Prior version:          [V24-V30 / NONE / UNKNOWN]

DETECTED SITUATION:     [A / B / C / D]
REASONING:              [2-3 sentences]
RECOMMENDED NEXT PROMPT: [1.3 / 1.4 / 1.5 / 1.6]

PRE-FLIGHT WARNINGS:    [any concerns to address first]
═══════════════════════════════════════════════════════════════════

DO NOT modify any file. DO NOT run any phase. Wait for my confirmation.
```

**What happens next:** Claude outputs the report and tells you which prompt to run next (1.3, 1.4, 1.5, or 1.6).

---

## 1.2.5 — Prepare Credentials Before Phase 3 (Setup Kit — NEW)

**When:** Right after Bootstrap completes and before you start Phase 2. This is the single best time to gather every external service credential your app will need, so that by the time Phase 5 runs its credential gate, everything is filled in and `⏳` placeholders are gone.

**Where:** WSL2 terminal (for gh CLI) + your browser (for external service dashboards) + your project root CREDENTIALS.md (for filling values).

**Why bother now?** Bootstrap Step 18 writes CREDENTIALS.md with `⏳ FILL LATER` placeholders for everything AI cannot generate. Phase 5 has a blocking gate that runs `grep -c "⏳"` and stops validation if any REQUIRED placeholders remain. Filling these proactively means Phase 5 runs smoothly the first time.

### Part 1 — GitHub setup (gh CLI recommended)

**Install gh CLI (one-time per machine):**

```bash
# WSL2 Ubuntu
(type -p wget >/dev/null || (sudo apt update && sudo apt-get install wget -y)) \
  && sudo mkdir -p -m 755 /etc/apt/keyrings \
  && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
  && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && sudo apt update \
  && sudo apt install gh -y
```

**Authenticate (browser OAuth — no PAT copy/paste needed for git operations):**

```bash
gh auth login
# Choose: GitHub.com → HTTPS → Login with web browser
# Paste the one-time code → authorize in browser → done
```

**Verify authentication:**

```bash
gh auth status
# Should show: ✓ Logged in to github.com as [your-username]
```

**Create GitHub repo + set remote in one command:**

```bash
cd ~/projects/[app-name]
gh repo create [your-username]/[repo-name] --private --source=. --remote=origin --push=true
```

This creates the GitHub repo, adds it as `origin`, and pushes your first commit. Future `git push` works normally after this.

**Still need a PAT?** Yes — for GitHub Actions workflow (Docker image publish). The `gh` OAuth token is for CLI operations; GitHub Actions Secrets need a Personal Access Token. See Part 2 below.

### Part 2 — Credentials shopping list (what to gather BEFORE Phase 3)

Go through this list in order. The earlier items block later items.

#### 🐙 GitHub Personal Access Token (PAT)

**Required for:** GitHub Actions workflows — Docker image publish, webhook triggers, repo access from CI.

**Where:** `github.com/settings/tokens`

**What to copy:**
- Classic PAT (recommended for simplicity) OR Fine-Grained PAT (recommended for per-repo scoping)
- Token value (starts with `ghp_...` for Classic, `github_pat_...` for Fine-Grained)

**Scopes needed:**
- Classic: `repo`, `workflow`, `write:packages` (if publishing GitHub Container Registry images)
- Fine-Grained: Repository access → selected repos → Contents (r/w), Pull requests (r/w), Metadata (read), Actions (r/w), Workflows (r/w)

**⚠ Store immediately in CREDENTIALS.md** — token is shown only once, you can't retrieve it later (rotate if lost).

#### 🐳 Docker Hub Access Token

**Required for:** Publishing Docker images to Docker Hub. Only needed if `docker.publish: true` in `inputs.yml`.

**Where:** `hub.docker.com → Account Settings → Security → New Access Token`

**What to copy:**
- Docker Hub username
- Access token value (starts with `dckr_pat_...`)

**Permissions needed:** Read, Write, Delete

**Token naming convention:** `[app-name]-github-ci` (e.g. `powerbyte-erp-github-ci`)

**⚠ NOT your Docker Hub password** — this is a separate scoped token. Token is shown only once — save immediately.

#### 📧 SMTP Credentials (Email)

**Required for:** Staging + production email delivery (transactional emails, password resets, notifications). Dev uses MailHog — no external config needed.

**Provider options (pick one per environment):**

| Provider | Free tier | Best for | Signup URL |
|---|---|---|---|
| **Gmail (App Password)** | 500/day | Solo dev, small team | `myaccount.google.com/apppasswords` — requires 2FA on Gmail |
| **SendGrid** | 100/day | Production | `sendgrid.com/signup` |
| **Mailgun** | 100/day (first 3 months) | Production | `mailgun.com/signup` |
| **Amazon SES** | 62k/month (EC2-hosted) | Production AWS | `aws.amazon.com/ses` |
| **Resend** | 3000/month | Modern transactional | `resend.com/signup` |

**What to collect (per environment — same values usually work for staging + prod):**
- SMTP host (e.g. `smtp.gmail.com`, `smtp.sendgrid.net`)
- SMTP port (587 for STARTTLS, 465 for SSL)
- Username (email or API key name, depends on provider)
- Password or API key
- From address (e.g. `noreply@yourdomain.com`)
- From name (e.g. `Powerbyte ERP`)

**⚠ Domain DNS records needed** — for production, set up SPF + DKIM + DMARC records on your sending domain. Every provider has docs on this.

#### 🦎 Komodo (Deployment Manager)

**Required for:** Deploying staging/prod compose stacks via Komodo UI. Only needed if `deployment.manager: komodo` in `inputs.yml`.

**Prerequisites:**
- Komodo Core instance running somewhere (VPS, home server, cloud VM)
- Komodo login credentials (if UI login enabled)

**What to collect:**
- Komodo UI URL (e.g. `https://komodo.yourdomain.com` or `http://[vps-ip]:9120`)
- Komodo username + password (if login enabled)

**OPTIONAL (V27+ auto-update recommended instead):**
- Staging webhook URL (only for legacy webhook-triggered deploys)
- Prod webhook URL (only for legacy webhook-triggered deploys)
- Webhook secret

**V27+ recommendation:** Use Komodo auto-update (`auto_update: true` on staging, manual deploy via Komodo UI for prod). This eliminates webhook credentials entirely. Staging polls Docker Hub for `:staging-latest` tag automatically. Prod deploys on human click in Komodo UI.

#### 💳 Xendit (Payment Gateway — SEA markets)

**Required for:** Accepting payments. Only needed if `payment.gateway: xendit` in `inputs.yml`.

**Where:** `dashboard.xendit.co → Settings → API Keys`

**What to collect (both environments needed):**
- Test Secret Key (starts with `xnd_development_...`)
- Test Public Key (starts with `xnd_public_development_...`)
- Live Secret Key (starts with `xnd_production_...`) — only after KYC approval
- Live Public Key (starts with `xnd_public_production_...`)
- Webhook verification token (x-callback-token) — configured in Webhook settings

**Webhook endpoint to configure in Xendit:**
- URL: `https://yourdomain.com/api/webhooks/xendit`
- Events: invoice.paid, invoice.expired, ewallet.charge.paid, etc. (based on your flows)

**⚠ KYC required** — Live keys only activate after Xendit verifies your business. Test keys work immediately for development.

#### 🛡️ Cloudflare Turnstile (Bot Protection)

**Required for:** Production bot protection on public forms (login, register, contact, password reset, payment). Always required for production per V31 defaults. Dev + staging use Cloudflare's official test keys — no config needed.

**Where:** `dash.cloudflare.com → Turnstile → Add Site`

**Setup:**
- Widget name: `[App Name] Production`
- Hostname: your production domain (e.g. `powerbyte-erp.com`)
- Mode: **Managed** (recommended — auto-adjusts friction based on threat level)
- Pre-clearance: **Enabled** (optional)

**What to collect:**
- Site Key (public — safe to commit)
- Secret Key (private — goes in CREDENTIALS.md)

**⚠ FREE tier hostname limit** — Cloudflare Turnstile free tier allows 1 widget per account by default. V31 strategy: production domain only as registered hostname. Dev + staging use Cloudflare's public test keys (`1x00000000000000000000AA` site key, `1x0000000000000000000000000000000AA` secret key) which always pass — no hostname slot consumed.

#### 🔑 Third-Party API Keys (Project-Specific)

**Required for:** Any external service your PRODUCT.md declares. Check your PRODUCT.md Integrations section for this list.

**Common services (fill as needed):**

| Category | Services | Where to get keys |
|---|---|---|
| **LLM/AI** | OpenAI, Anthropic, Groq, Together, Replicate | Each provider's dashboard |
| **SMS** | Twilio, MessageBird, Vonage, Semaphore (PH) | Each provider's dashboard |
| **Maps** | Google Maps, Mapbox | Google Cloud Console / Mapbox dashboard |
| **Analytics** | PostHog, Mixpanel, Plausible, Umami | Each provider's dashboard |
| **Error tracking** | Sentry, Rollbar, Bugsnag | Each provider's dashboard |
| **File storage (external)** | AWS S3, Backblaze B2, Cloudflare R2, Wasabi | Each provider's dashboard |
| **Transactional push** | Firebase Cloud Messaging, Expo Push | Firebase Console / Expo dashboard |
| **Auth (if not Auth.js)** | Keycloak admin, SAML IdP config | Your Keycloak/IdP instance |

**Default V31 stack is key-light by design.** Most V31 apps need: GitHub + Docker Hub + SMTP + Turnstile + optional payment gateway. Only add more keys if PRODUCT.md explicitly requires the service.

### Part 3 — Fill sequence (recommended order)

Filling credentials in this order minimizes dependency chains:

1. **GitHub PAT** first — needed for `git push` with authentication and GitHub Actions workflows
2. **Docker Hub token** — needed for CI Docker image publish (if `docker.publish: true`)
3. **SMTP** — always required for staging/prod, easiest to set up with Gmail app password
4. **Third-party APIs** — based on PRODUCT.md Integrations section
5. **Payment (Xendit)** — only if app accepts payments (requires KYC)
6. **Turnstile** — last, requires production domain to be registered

### Part 4 — After filling CREDENTIALS.md

```bash
# Propagate filled values from CREDENTIALS.md into .env.dev / .env.staging / .env.prod
bash scripts/sync-credentials-to-env.sh
```

This script is idempotent — it skips any value still showing `⏳`, so you can re-run it safely as you fill more credentials over time.

**Verify no REQUIRED placeholders remain:**

```bash
# Count remaining ⏳ placeholders
grep -c "⏳" CREDENTIALS.md

# List sections still unfilled
grep -B1 "⏳" CREDENTIALS.md | grep "^##" | sort -u
```

Zero `⏳` markers = Phase 5 credential gate will pass. Some OPTIONAL `⏳` can remain (e.g. Komodo webhooks if using auto-update instead).

### Part 5 — Sanity checklist before Phase 3

Before you run `Start Phase 3` in Claude Code, verify:

- ☑ `gh auth status` shows you're authenticated on github.com
- ☑ GitHub repo exists — check `git remote -v` shows `origin`
- ☑ Docker Hub account created + access token acquired (if publishing images)
- ☑ SMTP provider chosen + credentials acquired
- ☑ Third-party API accounts created based on PRODUCT.md Integrations section
- ☑ Domain name registered (for production Turnstile + DNS records)
- ☑ CREDENTIALS.md filled with values where you have them
- ☐ Some `⏳` placeholders still remain? That's fine — Phase 5 will list REQUIRED ones that block

### Part 6 — Troubleshooting

**`gh auth login` browser doesn't open:**
```bash
# Use device code flow instead
gh auth login --web --hostname github.com
# Or use token flow
gh auth login --with-token < mytoken.txt
```

**`gh repo create` says repo already exists:**
```bash
# You probably created the repo via browser earlier. Just add remote manually:
git remote add origin https://github.com/[user]/[repo].git
git branch -M main
git push -u origin main
```

**Docker Hub token doesn't work in GitHub Actions:**
- Verify token was added to GitHub repo Settings → Secrets and variables → Actions
- Secret names must match workflow: `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN`
- Re-generate token if unsure — old token may have been copied incorrectly

**Gmail app password rejected by SMTP:**
- 2FA must be enabled on your Gmail account first
- App password is 16 characters with spaces — remove spaces when pasting into CREDENTIALS.md
- Use `smtp.gmail.com` port 587 with STARTTLS

**Xendit webhook 401 errors:**
- Verify `x-callback-token` in CREDENTIALS.md matches the token set in Xendit dashboard
- Check webhook endpoint URL is publicly accessible (not localhost)
- For dev testing: use ngrok or Cloudflare Tunnel to expose local webhook endpoint

**Turnstile widget not rendering:**
- Site Key must be public (safe to commit) — don't confuse with Secret Key
- Hostname in Turnstile dashboard must match production domain exactly (no wildcards on free tier)
- Dev + staging: verify you're using the official Cloudflare test site key `1x00000000000000000000AA`

**`sync-credentials-to-env.sh` script missing:**
- Script is written by Phase 3. If you haven't run Phase 3 yet, it doesn't exist.
- To propagate credentials BEFORE Phase 3: manually copy values from CREDENTIALS.md into `.env.dev` (not recommended — let Phase 3 generate the env files)

### Part 7 — What happens in Phase 5 (credential gate)

When you run `Start Phase 5` in Claude Code:

1. Phase 5 pre-flight runs `grep -c "⏳" CREDENTIALS.md`
2. If count is 0 OR only OPTIONAL sections have `⏳`: validation proceeds
3. If REQUIRED sections still have `⏳`: Phase 5 BLOCKS and outputs a list of unfilled sections with direct URLs to acquire each one
4. You fill the missing values, run `bash scripts/sync-credentials-to-env.sh`, and retry `Start Phase 5`

**REQUIRED sections that block Phase 5:**
- 🐙 GitHub (Username + PAT)
- 🐳 Docker Hub (Username + Token) — if `docker.publish: true`
- 📧 SMTP (Host + Port + Username + Password + From address + From name) — staging/prod only
- 🦎 Komodo UI URL — if `deployment.manager: komodo`
- 💳 Xendit (all API keys + webhook token) — if `payment.gateway: xendit`
- 🛡️ Cloudflare Turnstile (LIVE Site Key + LIVE Secret Key) — prod only

**OPTIONAL sections that allow `⏳` to remain:**
- Komodo webhook URLs + webhook secret (only for legacy webhook-triggered deploys)
- Third-Party API Keys (project-specific — fill as you integrate each service)

---

## 1.2.6 — Top Up CREDENTIALS.md (routine ongoing fill — NEW)

**When:** You have new values to add to EXISTING `⏳ FILL LATER` sections in CREDENTIALS.md. Use in any of these situations:
- **Phase 5 blocked** — the credential gate flagged a REQUIRED `⏳` placeholder
- **KYC approval came through** — Xendit live keys are now available
- **A credential rotated** — GitHub PAT expired, Docker Hub token rotated, Xendit webhook token changed
- **You deferred filling earlier** — ran 1.2.5 with partial info, now you have the rest

**Where:** WSL2 terminal + your project root CREDENTIALS.md (for editing values).

### 1.2.6.1 — List what's still unfilled

```bash
# Count remaining ⏳ placeholders
grep -c "⏳" CREDENTIALS.md

# List sections that still have ⏳ placeholders
grep -B1 "⏳" CREDENTIALS.md | grep -E "^##|^###" | sort -u

# Show exact lines with ⏳ markers (with line numbers for fast editing)
grep -nE "⏳" CREDENTIALS.md
```

### 1.2.6.2 — Edit CREDENTIALS.md

Open in your editor and replace `⏳ FILL LATER` markers with actual values.

**Safety rules:**
- Never remove section headers — only replace `⏳` values
- Keep format exactly as-is (the sync script depends on it)
- Don't edit `.env.*` files directly — let the sync script handle that
- If a section is marked OPTIONAL and you genuinely don't need it, leave the `⏳` — Phase 5 won't block on OPTIONAL

### 1.2.6.3 — Propagate to .env files

```bash
bash scripts/sync-credentials-to-env.sh
```

Script is idempotent — skips any value still showing `⏳`, only updates newly-filled ones. Safe to run multiple times.

### 1.2.6.4 — Verify propagation

```bash
# Count remaining ⏳ in CREDENTIALS.md
grep -c "⏳" CREDENTIALS.md

# Verify new values reached .env files (spot-check)
grep -E "GITHUB_TOKEN|SMTP_HOST|TURNSTILE_SECRET" .env.dev .env.staging .env.prod 2>/dev/null | grep -v "⏳"
```

### 1.2.6.5 — Re-run Phase 5 if it was blocked

If Phase 5 was blocking before this top-up:

```
Start Phase 5
```

Phase 5 will re-run its credential gate. If all REQUIRED sections are now filled, it proceeds.

> **Tip:** This prompt is safe to run at ANY point in the project lifecycle — Phase 0, during development, or after production V1.0. The sync script never overwrites a filled value with `⏳`, so re-running won't cause regressions.

---

## 1.2.7 — Add New Credential Section Mid-Project (via Phase 7 — NEW)

**When:** Phase 7 Feature Update introduces a NEW integration not in the original CREDENTIALS.md. Examples:
- Adding SMS notifications → need Twilio keys
- Adding analytics → need PostHog keys
- Adding a new MCP server → new API key
- Integrating a new payment method beyond Xendit

**Where:** Planning Assistant session (Claude Code or Claude.ai) (to update PRODUCT.md) → then Claude Code (for Phase 7).

**Approach:** Adding a new credential section is a feature change, not a config tweak. It flows through Phase 7 so governance stays clean (branch + CHANGELOG_AI + agent-log + lessons if tricky).

### 1.2.7.1 — Update PRODUCT.md first (Planning Assistant chat)

Use 4.3 Add Feature in the Planning Assistant chat. Specifically:

```
Add Feature: [SERVICE NAME] integration

I want to add [service] for [purpose — e.g. "Twilio for SMS notifications on
password reset and 2FA"].

Update PRODUCT.md Integrations section to include:
- Service name + version/API version if applicable
- Purpose (what it's for in this app)
- Auth method (API key / OAuth / webhook token / etc.)
- Which modules use it
- Staging vs production behavior (same keys? different keys per env?)

Do NOT regenerate the rest of PRODUCT.md. Show diff before write.
```

Save the updated PRODUCT.md to `docs/PRODUCT.md` in your project.

### 1.2.7.2 — Run Phase 7 Feature Update (Claude Code)

```
Feature Update

The new integration is declared in docs/PRODUCT.md Integrations section.
Execute the standard Phase 7 sequence. When you reach the implementation step,
make sure to:

1. Append a new section to CREDENTIALS.md following V31 format:
   - Section header with emoji + service name
   - Required credentials list with ⏳ FILL LATER markers
   - "Where to get keys" URL comment
   - OPTIONAL or REQUIRED tag per field

2. Update scripts/sync-credentials-to-env.sh to propagate the new variables
   to .env.dev / .env.staging / .env.prod:
   - Add sed or awk replacement lines for each new credential
   - Preserve existing propagation logic
   - Keep the idempotency (skip if value still ⏳)

3. Implement the integration code (client setup, tRPC routers, whatever the
   feature requires per PRODUCT.md).

4. Write tests (RED → GREEN per Phase 7 standard).

5. Update governance docs per standard Phase 7: CHANGELOG_AI, agent-log,
   IMPLEMENTATION_MAP.
```

### 1.2.7.3 — Fill the new credentials

After Phase 7 completes, run **1.2.6 Top Up CREDENTIALS.md** to fill the newly-added `⏳` markers with real values.

### 1.2.7.4 — Merge + verify

Standard Phase 7 finishes with squash-merge. Then:

```bash
bash scripts/sync-credentials-to-env.sh
grep -c "⏳" CREDENTIALS.md  # should be 0 for REQUIRED sections
```

> **Why through Phase 7?** Adding an integration touches multiple files (CREDENTIALS.md + sync script + integration code + tests). Phase 7 handles all of that in one governed change with full attribution. Doing it ad-hoc would bypass lessons.md, CHANGELOG_AI, and the branch-per-feature convention that makes V31 rollbacks possible.

---

## 1.3 — Greenfield: Full Setup (Situation A)

Use this path when the Analyzer classifies your project as **Situation A** (empty or nearly empty).

### 1.3.1 — Place PRODUCT.md (+ DESIGN.md + mockup) + run Bootstrap

Drop the Planning Assistant deliverables into your project's `docs/` folder:
- `docs/PRODUCT.md` (always — required)
- `docs/DESIGN.md` (if you chose a shadcn/ui theme direction in Phase 2.8 Step 0)
- `docs/mockups/[appname]-phase-2.8-mockup.html` (if you saved the HTML archive per prompt 4.7)

Then in Claude Code:
```
Bootstrap
```

**What happens:** Runs all 20 Bootstrap steps — folder structure, governance docs, `.vscode/mcp.json`, `.specstory/config.json`, typed `lessons.md`, `CREDENTIALS.md` with AI-generated secrets + `⏳ FILL LATER` placeholders, and the Loading Library Lock (DECISIONS_LOG.md entry for ui-rules.md Rule 11 dual-path). **Does not block on credentials.** CREDENTIALS.md is the required gate for Phase 2 — Phase 2 will refuse to start without it.

### 1.3.2 — Phase 2 operational interview
```
Start Phase 2
```
Paste your `docs/PRODUCT.md` when prompted. Phase 2 is NOT a duplicate of the Planning Assistant interview — it asks ONLY the operational/machine-local questions Planning Assistant couldn't know: Docker Hub username + image name (must be unique on your account), model routing (which Claude model runs which phase), dev port ranges to avoid on this machine, git worktree preference, CORS allowed origins per environment, Komodo webhook config, Turnstile widget hostname strategy. Skip-logic auto-removes sections not applicable to your PRODUCT.md (e.g. no payments declared → skip payment gateway questions).

### 1.3.3 — Confirm Phase 2.5 summary
```
confirmed
```
Auto-chains into Phase 2.6 (design system — reads `docs/DESIGN.md` if present) and Phase 2.7 (spec stress-test). Phase 2.8 is SKIPPED in Claude Code — it already ran in the Planning Assistant session.

### 1.3.3b — Phase 2.8 Clickable Mockup Review (NEW V31 — Planning Assistant session — Claude Code (preferred) or Claude.ai)

This phase runs in the Planning Assistant session — Claude Code (preferred) or Claude.ai — BEFORE you bring PRODUCT.md to your project. After Phase 2.7 stress-test passes, the Planning Assistant first asks if you want to choose a shadcn/ui theme direction (optional), then auto-generates an interactive React (.jsx) mockup with realistic industry-appropriate data so you can verify the spec visually before Phase 3 locks the architecture. After you confirm, it generates an HTML archive version and (if you chose a theme direction) writes shadcn/ui CSS variable overrides to docs/DESIGN.md. **Claude Code PA path:** the mockup is written as `docs/MOCKUP.jsx` — preview it via `npm run dev` (Vite) or save the rendered HTML archive locally. **Claude.ai path:** Claude.ai renders MOCKUP.jsx as a live artifact; click the download button to save the HTML archive.

You don't need to type a trigger — it runs automatically. To respond after viewing the mockup:
```
confirmed
```
Or to skip the mockup entirely (not recommended on first run):
```
skip mockup
```
Or to request a specific placeholder screen be promoted to full fidelity:
```
expand [ScreenName]
```

Budget: max 3 full regenerations + 5 single-screen expansions per project. Auto-skipped if PRODUCT.md has fewer than 2 declared screens.

### 1.3.4 — Phase 3 spec generation
```
Start Phase 3
```
Produces `inputs.yml`, env files, random dev ports, `scripts/sync-credentials-to-env.sh`.

### 1.3.5 — Phase 4 scaffold (Part-by-Part, fresh session each Part — Rule 24)

Open a **new** Claude Code session per Part:
```
Start Part 1
```
After each Part completes, close session and open a new one:
```
Start Part 2
Start Part 3
Start Part 4
Start Part 5
Start Part 6
Start Part 7
Start Part 8
```

Part assignments: (1) Root config · (2) shared + api-client · (3) db (L3/L5/L6) · (4) ui + jobs + storage · (5) Web app · (6) Mobile app if declared · (7) tools + compose + SocratiCode · (8) CI + governance + index

### ⚠ Anti-Thrashing: Module-by-Module Execution (for large apps)

**When:** You hit "Autocompact is thrashing" during any Phase 4 Part — especially Parts 3-6 (tRPC routers + UI pages) and Part 8 (Mobile) on apps with 15+ entities. This means the context window is filling up because Claude Code is reading too many files per turn.

**The fix: scope each session to ONE module instead of the entire Part.**

**For Parts 3-6 (tRPC routers + UI pages):**
```
Start Phase 4 Part [N] — [ModuleName] module ONLY.

Rules for this session:
1. Read ONLY the PRODUCT.md sections for [ModuleName] — do NOT read 
   the entire PRODUCT.md
2. Read ONLY the tRPC router / UI files for this module
3. Read ONLY the Prisma models relevant to this module
4. Build everything for this module, then run tests
5. Commit with message: "feat([part-scope]): [ModuleName] [what was built]"
6. Update STATE.md with "[ModuleName] — DONE"
7. Do NOT start the next module — session ends here

If you need to reference a shared component or utility, read ONLY that 
single file — do not read its entire directory.
```

Then start a fresh session for each remaining module. Example for a 10-module ERP — Part 5 (UI) becomes 8-12 sessions instead of one, each touching 6-12 files max.

**For Part 8 (Mobile — Expo + WatermelonDB + offline sync):**

Part 8 is the heaviest because it mirrors the web app for a different platform. Split it into layers first, then modules:

```
Session 8a — Expo scaffold + navigation + auth:
  Start Phase 4 Part 8 — Expo project scaffold ONLY.
  Set up: project structure, navigation (expo-router), auth flow, 
  theme provider with DESIGN.md tokens. Do NOT build any screens yet.
  Commit and stop.

Session 8b — WatermelonDB schema + sync engine:
  Resume Phase 4 Part 8 — WatermelonDB setup ONLY.
  Build: WatermelonDB schema (mirror Prisma models for Mobile First 
  entities only), sync engine with conflict resolution, pull/push 
  protocol. Do NOT build any screens yet. Commit and stop.

Session 8c — Push notifications:
  Resume Phase 4 Part 8 — Expo Push notification setup ONLY.
  Build: push token registration, notification handler, background 
  handler. Commit and stop.

Session 8d onward — one Mobile First module per session:
  Resume Phase 4 Part 8 — [ModuleName] mobile screens ONLY.
  Build ONLY screens classified as "Mobile First" in PRODUCT.md 
  Mobile Needs table. Mobile Ready pages are already handled by 
  the responsive web app (Parts 5-6) — skip them here.
  Read ONLY this module's PRODUCT.md section. Commit and stop.
```

**Key rule for Part 8:** Not every page gets a native mobile screen. Only pages marked **Mobile First** in the PRODUCT.md Mobile Needs table are built here. **Mobile Ready** pages rely on the responsive web layout from Parts 5-6.

**Resume between module sessions:**
```
Resume session. Read STATE.md for current status, then read the latest 
handoff note in .cline/handoffs/ before doing anything.

Continue Phase 4 Part [N] — next module is [ModuleName].
Read ONLY PRODUCT.md sections for this module.
```

### 1.3.6 — Fill CREDENTIALS.md ⏳ placeholders

Open `CREDENTIALS.md` and replace every `⏳ FILL LATER` with real values (GitHub PAT, Docker Hub token, SMTP, Komodo URL, Xendit keys, Turnstile prod keys). Then:
```bash
bash scripts/sync-credentials-to-env.sh
```

### 1.3.7 — Phase 5 validation
```
Start Phase 5
```

Pre-flight checks `CREDENTIALS.md` for unfilled required ⏳ fields. Then runs 9 validation commands (install, validate-inputs, check-env, check-product-sync, lint, typecheck, test, build, audit).

### 1.3.8 — Phase 6 Docker + Visual QA
```
Start Phase 6
```
Starts Docker services, runs migrations, seeds DB, runs 5 Visual QA checks. App is live.

---

## 1.4 — V31 Upgrade Reconciliation (Situation B)

Use when the Analyzer classifies your project as **Situation B** (existing Spec-Driven project on V24–V30).

### 1.4.0 — Deep Pre-Upgrade Analysis (NEW — comprehensive state + gap report)

**When:** Before running 1.4.2 (V31 Upgrade Reconciliation). This is a universal pre-upgrade analyzer that works regardless of which prior Spec-Driven version built your project. Run this ONCE per project to get a complete picture of where you are, what's missing, and what's risky — before touching anything.

**Where:** Claude Code at project root.

**Duration:** 15-30 minutes for a comprehensive scan. Agent reads all governance docs + spot-checks code compliance via `codebase_search` and `grep`.

**Output:** Single-shot report (~300-500 lines) with 8 dimensions + prioritized fix plan. No writes, no modifications. Read-only analysis.

**Prerequisite:** V31 framework files should already be deployed via `bash deploy.sh` (prompt 1.1). That's what the agent uses to know what V31 *expects*. If you haven't deployed V31 files yet, run 1.1 first, then come back here.

```
Deep Pre-Upgrade Analysis

My project is an existing Spec-Driven codebase built on a prior version (V24-V30).
V31 files are now deployed via deploy.sh. Before I run 1.4.2 reconciliation,
I need a comprehensive 8-dimension analysis of my current state.

You are reading the new V31 compact CLAUDE.md. Execute ALL 8 dimensions below and
produce a single-shot report. Expect ~300-500 lines of output — that's normal for
this analyzer.

CRITICAL: Do NOT modify any file. Do NOT propose writes. Do NOT run any phase.
Report only. I will decide next steps after reading your report.

If any command fails (tests broken, build broken, etc.) — report the failure and
keep going. Broken state is exactly what this analyzer is meant to surface.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIMENSION 0 — PRE-FLIGHT SANITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before analyzing, verify V31 files are deployed:
  0.1  CLAUDE.md exists at project root AND is ~200 lines (compact V31)
  0.2  .claude/rules/ is empty (V32.7); .ai_prompt/ contains 7 detail files (phases.md,
       memory-governance.md, security.md, ui-rules.md, bootstrap.md, scenarios.md, templates.md)
  0.3  AI/Master_Prompt.md exists

IF any of 0.1-0.3 is missing:
  → STOP. Output: "V31 files not deployed. Run 1.1 (bash deploy.sh) first."
  → Do NOT proceed to Dimensions 1-7.

IF all 0.1-0.3 pass → continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIMENSION 1 — PRIOR FRAMEWORK VERSION DETECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Determine which V24-V30 version built this project. Use these heuristics:
  1.1  Check AI/ folder for old Master_Prompt_v*.md files (pre-V31)
  1.2  Check CHANGELOG_AI.md first 5 entries for version tags
  1.3  Check .clinerules type:
       — .clinerules is a directory → V27 or older
       — .clinerules is a file       → V28+
  1.4  Check CREDENTIALS.md format:
       — no "🚨 FILL THESE IN BEFORE PHASE 5" header → V28 or older
       — has header + ⏳ FILL LATER markers           → V29+
  1.5  Check .vscode/mcp.json:
       — has shadcn server → V29+
       — socraticode+context7 only → V27-V28
       — empty or missing → V26 or older
  1.6  Check security layer L6 pattern:
       — $allOperations extension → V28+
       — $use middleware          → V24-V27

Report: "Project was most likely built on V[X]" with reasoning based on heuristics above.
If evidence is contradictory, list all signals and mark as AMBIGUOUS.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIMENSION 2 — PHASE STATE DETECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read: docs/IMPLEMENTATION_MAP.md, docs/CHANGELOG_AI.md, project.memory.md,
      docs/DECISIONS_LOG.md, .cline/memory/agent-log.md

Determine and report:
  2.1  Last completed phase (most recent "Phase N completed" entry in CHANGELOG_AI)
  2.2  Current phase in progress (if any — "Phase N started" without matching "completed")
  2.3  Open feature branches: git branch --list "feat/*"
  2.4  Unresolved Phase 6.5 errors: grep lessons.md for "STATUS: OPEN" or similar
  2.5  App deployment state:
       — dev running? (docker ps | grep -c "dev\|app-dev")
       — staging deployed? (check deploy/compose/staging/ + last commit to deploy workflow)
       — production live? (check deploy/compose/prod/ + last production deploy timestamp)
  2.6  Days since last Phase 7 Feature Update (parse CHANGELOG_AI timestamps)
  2.7  Total features implemented (count "Feature Update" entries in CHANGELOG_AI)
  2.8  Any pending mid-Part handoffs: ls .cline/handoffs/pause-*.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIMENSION 3 — GOVERNANCE DOC INTEGRITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Check each of 9 governance documents for existence + basic health:
  3.1  docs/PRODUCT.md                     (exists? all 12 sections present?)
  3.2  inputs.yml                          (exists? schema validates? pnpm tools:validate-inputs)
  3.3  inputs.schema.json                  (exists?)
  3.4  docs/CHANGELOG_AI.md                (exists? non-empty? has agent attribution?)
  3.5  docs/DECISIONS_LOG.md               (exists? non-empty?)
  3.6  docs/IMPLEMENTATION_MAP.md          (exists? reflects current state?)
  3.7  project.memory.md                   (exists? has recent updates?)
  3.8  .cline/memory/lessons.md            (exists? typed entries? line count?)
  3.9  .cline/memory/agent-log.md          (exists? recent entries?)

For each, report: EXISTS / MISSING / CORRUPT / EMPTY + line count + last modified date.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIMENSION 4 — RULE COMPLIANCE SCAN (code spot-check)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run these spot-checks against the codebase. Report each as PASS/FAIL with evidence.

  4.1  L6 Prisma pattern (V31 expects $allOperations extension, NOT $use middleware):
       — grep -rn "prisma\.\$use\|Prisma\.\$use" packages/db/ src/server/
       — grep -rn "\.\$allOperations\|extension.*allOperations" packages/db/
       Report: CURRENT = middleware OR extension OR NEITHER

  4.2  Tenant scoping (shared schema + tenant_id):
       — grep -rn "tenantId" packages/db/schema.prisma
       — codebase_search: "database queries missing tenant isolation"

  4.3  TypeScript strict mode:
       — cat tsconfig.json → verify "strict": true
       — check each apps/*/tsconfig.json + packages/*/tsconfig.json

  4.4  Route Handler auth bypass risk:
       — find src/app/api/**/route.ts
       — for each: does it have "// Non-tRPC: manual auth required" comment + auth check?

  4.5  Input validation uses strict Zod:
       — grep -rn "z\.any()\|z\.unknown()" src/server/trpc/ → should be 0 on user inputs
       — codebase_search: "Zod schemas without .strict()"

  4.6  UI component library compliance (V29+):
       — grep -rn "@mui/\|@ant-design/\|@chakra-ui/\|mantine\|daisyui" package.json apps/
       Should be 0. Only shadcn/ui is permitted.

  4.7  No secrets in frontend bundles:
       — grep -rn "NEXT_PUBLIC_.*SECRET\|NEXT_PUBLIC_.*KEY\|NEXT_PUBLIC_.*TOKEN" .env* 2>/dev/null
       Should be 0.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIMENSION 5 — CONFIG & INFRASTRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  5.1  .vscode/mcp.json content:
       — Expected V31: socraticode, context7, shadcn (3 servers)
       — Report which are present / missing

  5.2  scripts/sync-credentials-to-env.sh:
       — exists? chmod +x? (V31 requirement, Phase 3 Step 6.5)

  5.3  CREDENTIALS.md format:
       — has "🚨 FILL THESE IN BEFORE PHASE 5" header? (V31 pattern)
       — count ⏳ FILL LATER placeholders remaining
       — any filled values that look like real secrets?

  5.4  Deployment strategy:
       — deploy/compose/staging/docker-compose.yml — auto_update: true? (V27+ default)
       — deploy/compose/prod/docker-compose.yml — auto_update: false? (V27+ default)
       — Traefik labels present? (V27+ pattern)

  5.5  Turnstile configuration (V27+):
       — apps/*/src/components — any Turnstile widget?
       — .env.prod — TURNSTILE_* keys filled?

  5.6  Xendit configuration (V27+, if payment gateway used):
       — packages/payments or similar — any Xendit integration?
       — webhook security: x-callback-token verification present?

  5.7  Node.js + pnpm versions:
       — .nvmrc or package.json engines.node — should be v22 LTS
       — package.json packageManager — should be pnpm@10

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIMENSION 6 — CODE QUALITY INDICATORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run these commands (if they fail, report the failure and continue):
  6.1  pnpm audit --json 2>/dev/null | head -20 → critical/high count
  6.2  pnpm test --reporter=min 2>&1 | tail -10 → passing / failing / broken
  6.3  pnpm build 2>&1 | tail -10 → clean / warnings / errors
  6.4  TODO/FIXME/XXX in security-sensitive paths:
       — grep -rn "TODO\|FIXME\|XXX" src/server/trpc/ src/middleware.ts packages/db/ 2>/dev/null
  6.5  Large files that may have grown beyond scope:
       — find src/ -name "*.ts" -size +20k -not -path "*/node_modules/*" 2>/dev/null | head -10
  6.6  Lessons.md health:
       — line count (V31 target: <500 lines — run 3.12 Lessons Audit if >500)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIMENSION 7 — RISK ASSESSMENT + PRIORITIZED FIX PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Based on findings from Dimensions 1-6, classify EVERY finding:
  🔴 BLOCKS V31 upgrade        — must fix before running 1.4.2
  🟡 SAFE to defer             — can proceed to 1.4.2, fix after
  🟢 Informational             — no action needed

Blocker criteria (🔴):
  — Missing PRODUCT.md or all 12 sections not present
  — Governance doc corrupt (cannot be parsed)
  — Build broken (Dimension 6.3 fails hard)
  — Current deployment is in a half-migrated state (some files V30, some V24)
  — CREDENTIALS.md has real secrets in a committed file (grep for long entropy strings)

Deferrable criteria (🟡):
  — Single config drift (e.g. missing shadcn MCP)
  — Deprecated lessons.md entries > 500 lines
  — Minor TODO/FIXME in non-critical paths
  — Test suite has N failures but build works

Informational (🟢):
  — Prior version detected
  — Phase state snapshot
  — File counts and sizes

CATASTROPHIC FLAG:
  IF the project is in a fundamentally broken state (PRODUCT.md missing + no
  governance docs + no working build), add a CATASTROPHIC flag and recommend:
  "Consider starting a fresh V31 project rather than upgrading. The effort to
  repair may exceed the effort to rebuild."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — single-shot mandatory structure
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Present the entire report in this exact structure. Do not deviate.

═══════════════════════════════════════════════════════════════════
V31 DEEP PRE-UPGRADE ANALYSIS REPORT
Project: [detected project name from PRODUCT.md or package.json]
Analysis date: [today's date]
Prior framework version: [detected V24-V30 or AMBIGUOUS]
═══════════════════════════════════════════════════════════════════

### Dimension 0 — Pre-flight Sanity
[0.1-0.3 results]

### Dimension 1 — Prior Framework Version
[reasoning + conclusion]

### Dimension 2 — Phase State
[2.1-2.8 with evidence]

### Dimension 3 — Governance Doc Integrity
[3.1-3.9 with status + line counts]

### Dimension 4 — Rule Compliance Scan
[4.1-4.7 with PASS/FAIL + evidence snippets]

### Dimension 5 — Config & Infrastructure
[5.1-5.7 with evidence]

### Dimension 6 — Code Quality Indicators
[6.1-6.6 with command outputs]

### Dimension 7 — Risk Assessment + Prioritized Fix Plan
🔴 BLOCKERS: [count + list with evidence]
🟡 DEFERRABLE: [count + list]
🟢 INFORMATIONAL: [count + list]
⚡ CATASTROPHIC: [YES/NO] — if YES, explain
───────────────────────────────────────────────────────────────────
Phase A — Fix before 1.4.2:
  [ordered list with specific next prompts or commands]

Phase B — Fix after V31 upgrade succeeds:
  [ordered list]

Phase C — FYI:
  [list]

═══════════════════════════════════════════════════════════════════
RECOMMENDED NEXT ACTION
═══════════════════════════════════════════════════════════════════
IF Phase A has 0 blockers AND no CATASTROPHIC flag:
  → PROCEED to 1.4.2 (V31 Upgrade Reconciliation)
IF Phase A has blockers:
  → FIX those first, re-run this analyzer, then proceed to 1.4.2
IF CATASTROPHIC flag is set:
  → CONSIDER fresh V31 project. Upgrade cost may exceed rebuild cost.

═══════════════════════════════════════════════════════════════════

Read-only mode: confirmed — no files were modified

DO NOT modify any file. Wait for my confirmation before any fix action.
```

**What happens next:**
1. Review the report carefully — especially 🔴 BLOCKERS list and the CATASTROPHIC flag
2. Fix each blocker in a fresh session (use specific prompts the analyzer recommends)
3. Re-run this analyzer to confirm blockers are gone
4. Proceed to 1.4.2 (V31 Upgrade Reconciliation)
5. Then 1.4.3 targeted fixes → 1.4.4 cleanup → 1.4.5 commit → 1.4.6 verify

> **Why this matters:** 1.4.2's 6-item checklist is narrow. This 1.4.0 analyzer catches everything 1.4.2 might miss — phase state inconsistencies, code compliance drift, infrastructure gaps, test/build health. Running 1.4.0 first turns the V31 upgrade from "hope it works" into "know it will work."

### 1.4.1 — Safety backup first
```bash
git add -A
git commit -m "chore: pre-V31-upgrade snapshot" --allow-empty
git tag "pre-v31-upgrade-$(date +%Y%m%d)"
```

### 1.4.2 — Run the reconciliation prompt
```
V31 Upgrade Reconciliation

My project is already on a prior Spec-Driven version. The new V31 compact CLAUDE.md
and .ai_prompt/ detail files are in place via deploy.sh. Execute this reconciliation:

1. Read project.memory.md + docs/IMPLEMENTATION_MAP.md + docs/DECISIONS_LOG.md.
   State what phase this project is in and what's been built.

2. Cross-check V31 expectations against current state:
   a. Does scripts/sync-credentials-to-env.sh exist? (V31 requirement)
   b. Does .vscode/mcp.json list shadcn MCP server? (V29+ requirement)
   c. Does packages/db use Prisma extension ($allOperations) for L6?
      Or is it middleware ($use) — older V24-V27 pattern?
   d. Does CREDENTIALS.md have "🚨 FILL THESE IN BEFORE PHASE 5" header
      with ⏳ FILL LATER placeholders? (V31 pattern)
   e. Are there old Master_Prompt_v2*.md files in AI/ folder?
   f. Does CHANGELOG_AI.md use CLAUDE_CODE attribution for recent entries?
      (V31: Claude Code is primary; CLINE is deprecated but preserved for historical entries)

3. Output a V31 RECONCILIATION REPORT with PASS/FAIL per item and exact fix needed.

4. DO NOT modify any file. DO NOT re-run Bootstrap (would wipe CREDENTIALS.md).
   DO NOT regenerate PRODUCT.md, inputs.yml, or any docs/ file.
   DO NOT touch .env files. Preserve lessons.md, agent-log.md, CHANGELOG_AI.md.

Report only. Wait for my confirmation before any write.
```

### 1.4.3 — Execute targeted fixes (one per fresh session)

Based on the report, run these as needed:

**If `sync-credentials-to-env.sh` is missing:**
```
Regenerate scripts/sync-credentials-to-env.sh per V31 Phase 3 Step 6.5.
Do not touch any other file. chmod +x after creation.
```

**If shadcn MCP missing from .vscode/mcp.json:**
```
Add shadcn MCP server entry to .vscode/mcp.json per V31 Bootstrap Step 10.
Preserve socraticode and context7 entries. Show diff before write.
```

**If L6 still uses middleware pattern:**
```
Migrate L6 from Prisma middleware ($use) to extension ($allOperations) per V31
Secure Code Generation section 1. Show diff for packages/db/ before write.
Confirm existing tests still pass after migration.
```

**If CREDENTIALS.md is in old format:**
```
Convert CREDENTIALS.md to V31 format: add "🚨 FILL THESE IN BEFORE PHASE 5" header
with section list. Mark any human-provided fields needed with ⏳ FILL LATER.
PRESERVE all currently filled values exactly — do not regenerate any secret.
Show diff before write.
```

### 1.4.4 — Cleanup old Master Prompts
```bash
rm -f AI/Master_Prompt_v2*.md  # keep only v31
find . -name "*.bak" -mtime -1 -delete  # remove recent backups once confirmed
```

### 1.4.5 — Commit the upgrade
```bash
git add -A
git commit -m "chore: upgrade Spec-Driven Platform V[X] → V31"
```

### 1.4.6 — Verify
```
Start Phase 5
```

---

## 1.5 — Brownfield Adoption (Situation C)

Use when the Analyzer classifies your project as **Situation C** (existing non-Spec-Driven project — Laravel, Django, old Next.js, etc.).

### 1.5.1 — Safety backup
```bash
git add -A
git commit -m "chore: pre-brownfield-adoption snapshot" --allow-empty
git tag "pre-spec-driven-adoption-$(date +%Y%m%d)"
git checkout -b chore/adopt-spec-driven
```

### 1.5.2 — Reverse-engineer prompt
```
Brownfield Adoption — Reverse-Engineer Project

This project was NOT built with the Spec-Driven Platform. I want to adopt V31
going forward WITHOUT rewriting existing code. Execute this reverse-engineering:

1. Inventory the codebase:
   - Framework/stack? (Next.js pages/App router, Express, Laravel, Django, etc.)
   - Database? ORM/query builder? Auth system? UI library?
   - File storage? Job queue? Deployment target?

2. Identify modules + features from app directory structure, API routes, DB models.

3. Identify roles + permissions — grep for role/permission/isAdmin/authorize patterns.

4. Identify integrations — third-party clients, webhooks, external service env vars.

5. Produce a REVERSE-ENGINEERED PRODUCT.md draft with all 12 sections filled
   based on findings. Mark unknown fields "TBD — confirm with Bonito".

6. Produce a STACK GAP REPORT showing current stack vs Spec-Driven defaults
   with MIGRATE / KEEP / DECIDE LATER recommendation per mismatch + effort estimate.

7. DO NOT write any file yet. Output draft PRODUCT.md and Stack Gap Report to chat.
```

### 1.5.3 — Refine PRODUCT.md (iterate)

Paste corrections:
```
Refine PRODUCT.md based on these corrections:
[paste your corrections in plain English]

Output the final PRODUCT.md to chat for my confirmation before writing.
```

### 1.5.4 — Adoption-mode Bootstrap (write files, don't rebuild code)

When PRODUCT.md draft is accurate:
```
Write the finalized PRODUCT.md to docs/PRODUCT.md.

Then run Bootstrap in ADOPTION mode:
- Create docs/DECISIONS_LOG.md with: "BROWNFIELD ADOPTION: project existed before
  Spec-Driven Platform V31. Existing stack locked based on code audit."
- Create docs/CHANGELOG_AI.md with: "[today] | HUMAN | BROWNFIELD_ADOPTION |
  Adopted Spec-Driven Platform V31. Pre-existing code attributed to HUMAN."
- Create docs/IMPLEMENTATION_MAP.md documenting what's already built vs remaining
- Create project.memory.md
- Create .cline/memory/lessons.md (empty) and agent-log.md with adoption entry
- Create inputs.yml reflecting EXISTING stack (not Spec-Driven defaults)
- DO NOT run Phase 4 — code already exists
- DO NOT modify any app code
- DO NOT overwrite any .env file

Show diff plan before writing any file.
```

### 1.5.5 — Handle stack gaps over time (optional, incremental)

For each MIGRATE item in the Stack Gap Report, use Feature Update flow later:
```
Feature Update

Context: migrating from [current tech] to [Spec-Driven default] per brownfield
Stack Gap Report. See docs/DECISIONS_LOG.md for migration plan.

Migrate: [specific module/feature]
use context7
```

Migrations happen gradually — you do NOT need to migrate everything at once.

### 1.5.6 — Retrofit security layer (if using Prisma)
```
Feature Update

Retrofit L3 RBAC + L5 AuditLog + L6 Prisma extension ($allOperations) into
packages/db per V31 Secure Code Generation. Do not modify existing models —
only add security layer. Show migration diff + test plan.
```

---

## 1.6 — Manual Triage (Situation D)

Use when the Analyzer returns **Situation D** (ambiguous state).

```
Analyzer flagged ambiguous state: [paste reasoning from report].

Help me triage manually. Specifically:
- [list what's confusing or conflicting]
- What data do you need from me to classify this correctly?

Do not modify any file. Ask clarifying questions only.
```

---

## 1.7 — Build the code-review-graph (one-time per project, after Phase 6 — NEW)

**When:** After Phase 6 completes and your app is live. Run this once per project to build the structural code graph that powers blast-radius analysis in Phase 7 Feature Updates.

**Where:** WSL2 terminal at project root.

**Prerequisite:** code-review-graph plugin installed once per machine — see Master Prompt Scenario 21 for install details (`claude plugin add tirth8205/code-review-graph`).

```bash
# Build the initial graph (~10 seconds for a 500-file project)
code-review-graph build

# Verify the graph is healthy
code-review-graph status

# Start watch mode in a background terminal (keeps graph fresh on every save/commit)
code-review-graph watch
```

**What happens:** Tree-sitter parses every tracked file into a SQLite graph at `.code-review-graph/`. Once built, Claude Code's 28 MCP tools can query blast radius, architecture, call graphs, and impact analysis without re-reading your whole repo. Result: 6.8× fewer tokens on reviews, up to 49× on monorepo tasks.

> After this one-time build, the graph maintains itself via file-save hooks + watch mode. You don't need to rebuild unless you do a large refactor or DB schema change — see 3.18 for that case.

---

## 1.8 — Combined Upgrade: Framework Version + Planning Assistant (NEW)

**Type:** Composition (references 1.4.0, 1.4, 4.9, 4.10, 4.11)

**When:** You have TWO pending upgrades at once:
- Your project codebase is on an older framework version (V24-V30) AND
- A new Planning Assistant version has been released

This is the most common situation during version bumps because framework releases typically ship with matching Planning Assistant updates. Running them in the wrong order creates real problems.

**Where:** Planning Assistant session (Claude Code or Claude.ai) (spec update) + WSL2 terminal (framework deploy) + Claude Code (reconciliation + Feature Updates).

### Why Order Matters

**❌ Wrong order (Planning Assistant first, then framework):**
- You update PRODUCT.md with new V31 expectations (e.g. Step 8b Mobile strategy)
- You run 4.10 delta analysis on code that's still structured per V28/V29/V30 conventions
- Claude Code's V31 reconciliation logic doesn't recognize the older code layout
- Feature Updates fail or produce malformed changes
- You end up in a broken half-migrated state

**✓ Right order (framework first, then Planning Assistant):**
- Framework files (CLAUDE.md, `.claude/rules/`, deploy script) upgrade to V31 FIRST
- Code structure is reconciled to V31 via Phase 7 Feature Updates
- THEN new Planning Assistant adopted, PRODUCT.md updated
- THEN delta analysis + adoption Feature Updates run against V31-compatible code
- Clean, incremental, rollback-safe

### 1.8.1 — Decide Your Project State First

Identify where your project is in its lifecycle. The downstream step changes based on this:

| Project state | Step after framework upgrade | Use |
|---|---|---|
| **Pre-build** — PRODUCT.md written but Bootstrap not run yet | 4.9 (Spec done, not built yet) | Never hit real code, low risk |
| **Mid-build** — Phase 3+ in progress, partial codebase | 4.10 (Project mid-build) | Delta analysis + targeted Feature Updates |
| **In production** — Phase 8 done, app live | 4.11 (Project done / in production) | Tiered deployment by risk, production-safe |

### 1.8.2 — Step 1: Safety Backup (WSL2 terminal)

Regardless of project state:

```bash
git checkout main
git pull origin main
git tag "pre-combined-upgrade-$(date +%Y%m%d)"
git push origin --tags
```

This single tag is your rollback anchor for BOTH upgrades. If anything goes wrong at any step, `git reset --hard pre-combined-upgrade-[date]` restores the starting state.

### 1.8.3 — Step 2: Deep Pre-Upgrade Analysis (Claude Code)

Run **1.4.0 — Deep Pre-Upgrade Analysis** against your current project. Get the 8-dimension report identifying:
- Current framework version detected (V24-V30)
- 🔴 Blockers, 🟡 Deferrable, 🟢 Informational findings
- CATASTROPHIC flag if project is unsalvageable

**Gate:** If CATASTROPHIC flag is set, STOP. Consider fresh V31 project per 1.4.0's recommendation. Combined upgrade is not viable.

If Phase A (blockers) is empty, proceed to 1.8.4.
If Phase A has blockers, fix them first per 1.4.0's recommendations, then re-run 1.4.0 until Phase A is clear.

### 1.8.4 — Step 3: Framework Reconciliation (1.4 flow)

Run the full **1.4 — V31 Upgrade Reconciliation** sequence:
1. **1.4.1** Safety backup (already done in 1.8.2 — skip)
2. **1.4.2** Run the reconciliation prompt in Claude Code
3. **1.4.3** Execute targeted fixes per reconciliation output (one per fresh session)
4. **1.4.4** Cleanup old Master Prompts (remove `Master_Prompt_v[24-30].md` files)
5. **1.4.5** Commit the framework upgrade
6. **1.4.6** Verify via `Start Phase 5`

At end of 1.8.4: your project codebase is now on V31. Framework files (CLAUDE.md, .claude/rules/, deploy.sh) are current. Code structure reconciled.

### 1.8.5 — Step 4: Adopt New Planning Assistant (4.6 trigger)

**Now and ONLY now** — switch to your Planning Assistant session (Claude Code or Claude.ai):

1. Attach the new `Product_md_Planning_Assistant_v[XX].md` to your message
2. Paste the 4.6 trigger:
   ```
   Updated Planning Assistant template incoming — adopt the attached version
   and continue where we left off.
   ```
3. Planning Assistant acknowledges template swap

### 1.8.6 — Step 5: Run Gap Audit (4.9.2 trigger)

In the same Planning Assistant chat, run the 4.9.2 audit prompt (works for all project states):

```
Now audit my current PRODUCT.md against the new template you just adopted.
Identify any sections, fields, or content that the new template requires
but my PRODUCT.md is missing. For each gap:
- Tell me what's missing
- Ask the minimum questions needed to fill it (max 3 per turn)
- Update PRODUCT.md with the answer

If the new version adds a classification step (like Step 8b Mobile strategy),
run that step now against my existing Modules+Features and present the
table for review.

After all gaps filled, output the updated complete PRODUCT.md.
Do NOT regenerate sections that are still valid — only add/update what's missing.
```

Download the updated PRODUCT.md when Planning Assistant finishes.

### 1.8.7 — Step 6: Apply Updated PRODUCT.md to Project

Switch back to WSL2 terminal:

```bash
cp ~/Downloads/PRODUCT.md docs/PRODUCT.md
git add docs/PRODUCT.md
git commit -m "docs: update PRODUCT.md — adopt Planning Assistant v[XX] additions (post-V31 upgrade)"
```

### 1.8.8 — Step 7: Run the Right Adoption Flow (4.9 / 4.10 / 4.11)

Based on your project state identified in 1.8.1:

**If PRE-BUILD** → Run **4.9** (from step 4.9.3 onward — 4.9.1 and 4.9.2 are already done in 1.8.5 and 1.8.6):
- Proceed to Bootstrap (1.1 or 1.3) with the complete updated PRODUCT.md on V31-compatible framework

**If MID-BUILD** → Run **4.10** (from step 4.10.C onward — 4.10.A and 4.10.B are already done):
- Run delta analysis in Claude Code
- Execute Feature Updates per 🔴 items
- Verify alignment with `pnpm tools:check-product-sync` + lint + typecheck + test

**If IN PRODUCTION** → Run **4.11** (from step 4.11.C onward — 4.11.A and 4.11.B already done):
- Run delta analysis in Claude Code
- Categorize 🔴 findings by deployment risk (LOW/MEDIUM/HIGH)
- Execute tier by tier with staging verification
- Run post-adoption health check per 4.11.F

### 1.8.9 — Step 8: Post-Combined-Upgrade Verification

Run this verification prompt in Claude Code:

```
Post-combined-upgrade health check

My project has just completed TWO upgrades:
1. Framework V[old] → V31 (via 1.4 reconciliation)
2. Planning Assistant v[old] → v[new] (via 4.9/4.10/4.11 adoption)

Verify both upgrades landed cleanly:

Framework alignment:
1. Re-run Dimension 0 (Pre-flight Sanity) from prompt 1.4.0 — V31 files deployed?
2. Re-run Dimension 4 (Rule Compliance Scan) from prompt 1.4.0 — L6 pattern,
   tenant scoping, TypeScript strict, Zod validation, UI library compliance
3. Re-run Dimension 5 (Config & Infrastructure) — MCP servers, CREDENTIALS
   format, deploy strategy, Node v22, pnpm@10

PRODUCT.md alignment:
4. Verify docs/PRODUCT.md matches the new Planning Assistant template format
5. Check DECISIONS_LOG has entries for both upgrades with dates + rationale
6. Confirm CHANGELOG_AI reflects all Feature Updates executed during adoption

Report PASS/FAIL per dimension. Do NOT modify anything — report only.
```

If all PASS → combined upgrade successful. Delete the safety tag from 1.8.2 if you want:
```bash
git tag -d pre-combined-upgrade-[date]
```

If any FAIL → address with additional Feature Updates and re-run this health check.

---

### Summary Table — What Flows Into What

| 1.8 step | Calls into | Purpose |
|---|---|---|
| 1.8.2 | Manual git tag | Safety anchor |
| 1.8.3 | **1.4.0** | Pre-flight analysis |
| 1.8.4 | **1.4.1-1.4.6** | Framework reconciliation |
| 1.8.5 | **4.6** | Planning Assistant template swap |
| 1.8.6 | **4.9.2** | PRODUCT.md gap audit |
| 1.8.7 | Manual file copy + commit | Apply updated spec |
| 1.8.8 | **4.9 / 4.10 / 4.11** | State-specific adoption |
| 1.8.9 | Uses 1.4.0 dimensions | Verification |

> **Key principle:** Framework FIRST, Planning Assistant SECOND. Never the other way. This ensures the code structure matches what V31's reconciliation and Feature Update logic expect, so both halves of the combined upgrade can cleanly land.

---

# SCENARIO GROUP 2 — Daily Workflow (post-setup, everyday prompts)

Use these regularly once your project is operational on V31.

## 2.1 — Resume Session (opening after a break)

**When:** Starting a new work session. Context is lost.
**Where:** Claude Code in WSL2 terminal

```
Resume Session
```

**What happens:** Agent reads `project.memory.md` + `docs/IMPLEMENTATION_MAP.md` + `docs/DECISIONS_LOG.md` automatically. Outputs `✅ Session restored` summary with current phase, locked decisions, active rules. Asks which phase you're continuing.

---

## 2.2 — Feature Update (the main loop)

**When:** You want to add, change, or remove any feature.

**Step 1** — Edit `docs/PRODUCT.md` in plain English. Describe the change — don't write code.

**Step 2** — In Claude Code:
```
Feature Update
```

**What happens:** Agent reads 9 governance docs, runs `codebase_search` (SocratiCode) to find affected files, runs `get_impact_radius_tool` (code-review-graph) for blast radius, creates feature branch `feat/[slug]`, implements only files in scope, runs Visual QA, two-stage review (spec compliance → code quality).

**After completion:** Squash-merge to main. Agent appends to `CHANGELOG_AI.md` and runs `codebase_update` to refresh SocratiCode index.

**Variants:**
```
Feature Rollback: [feature-name]
```

---

## 2.3 — Start Phase 8 (check progress vs spec)

**When:** You want to see what's built vs what's remaining.

```
Start Phase 8
```

**What happens:** Agent compares `docs/PRODUCT.md` against `docs/IMPLEMENTATION_MAP.md`. Lists complete, in-progress, not-yet-started. Recommends next Feature Update.

---

## 2.4 — Index this codebase (first-time SocratiCode)

**When:** After Phase 4 Part 8 completes for the first time, or if the index ever gets out of sync.
**Prerequisite:** Docker Desktop running.

```
Index this codebase
```

**What happens:** SocratiCode builds Qdrant + Ollama semantic search index in Docker. First-time setup ~5 minutes. After that, every Feature Update auto-refreshes the index.

---

## 2.5 — Governance Sync (end of day — reconcile drift)

**When:** End of work session, or when code has drifted from PRODUCT.md (manual edits, Copilot inline changes, out-of-band fixes).

```
Governance Sync
```

**For conflicts (code AND PRODUCT.md both changed):**
```
Governance Sync — conflict resolution
```

**What happens:** Agent reads `.specstory/history/` for unattributed diffs since last CHANGELOG entry. Attributes each diff as COPILOT / HUMAN / UNKNOWN. Shows you a reconciliation table. You confirm. Agent updates all 9 governance docs.

**Frequency:** At most once per day. Prevention is better — use `Feature Update` for any change >5 lines.

---

## 2.6 — Log Lesson (capture discovered gotchas / fixes / decisions)

**When:** You learn something mid-session and want it in `lessons.md` immediately.

**Option A** — VS Code Command Palette → `Tasks: Run Task` → `Log Lesson`
**Option B** — WSL2 terminal:
```bash
bash scripts/log-lesson.sh
```

**What happens:** Interactive 5-question prompt (type / title / files / keywords / explanation). Appends correctly-formatted Rule 18 entry to `.cline/memory/lessons.md`. Next session, agent reads 🔴 gotchas first, 🟤 decisions second.

---

## 2.7 — Push Image (manual Docker promote)

**When:** You want to promote a local dev build to Docker Hub (alternative to GitHub Actions auto-push on merge to main).

```
Push Image [dev|staging|prod]
```

**Or run directly:**
```bash
bash deploy/compose/push.sh dev
bash deploy/compose/push.sh staging
bash deploy/compose/push.sh prod
```

**What happens:** Builds image locally, tags (`:dev`, `:staging-latest`, `:latest`), pushes to Docker Hub. Komodo auto-update picks up `:staging-latest` automatically on staging servers.

---

## 2.8 — Context7 live docs (any library task)

**When:** Any task involving external libraries (Next.js, Prisma, Auth.js v5, tRPC, shadcn/ui, BullMQ, Expo, WatermelonDB, Valkey).

**Usage:** Just append to your prompt:
```
[your normal prompt] ... use context7
```

**Examples:**
- `Add rate limiting to the auth endpoints using Valkey. use context7`
- `Implement soft deletes in Prisma with schema isolation. use context7`
- `Set up Auth.js v5 Credentials provider with bcrypt. use context7`

**What happens:** Context7 MCP fetches current version-specific docs from library repos before generating code — prevents deprecated API hallucination.

---

## 2.9 — Validate Spec Consistency (NEW — pre-Feature-Update sanity check)

**When:** Before starting any multi-file Feature Update that touches shared state (auth, tenancy, RBAC, audit log, core data model). Also useful after any manual edit to PRODUCT.md.

```
Validate Spec Consistency

Before I run the next Feature Update, verify docs/PRODUCT.md is internally consistent
and aligned with what's already built:

1. Cross-check each Module vs Data Entities — every entity named in a Module must
   exist in the Data Entities section.
2. Cross-check Roles vs Permissions — every role referenced in Permissions must be
   declared in Roles.
3. Cross-check Core User Flows vs Modules — every flow must map to a declared module.
4. Cross-check Integrations vs env vars in inputs.yml — every integration must have
   corresponding env var slots.
5. Cross-check Tenancy Model vs DB schema pattern declared in DECISIONS_LOG.md.
6. Compare PRODUCT.md vs IMPLEMENTATION_MAP.md — flag any PRODUCT.md items that
   IMPLEMENTATION_MAP says are complete but whose code no longer exists on main.

Output a CONSISTENCY REPORT with PASS/FAIL per check. Do not modify any file.
Report only. If FAIL: suggest exact PRODUCT.md edit needed.
```

**What happens:** Agent verifies spec coherence before committing to a feature build. Catches the kind of ambiguity that causes Phase 4 to halt mid-scaffold. Think of this as "Phase 2.7 stress-test, on-demand."

---

## 2.10 — Pause/Resume Session (safely interrupt any Phase)

**When:** You need to stop mid-execution (meeting, break, battery running low, model burning context, or just done for the day). Never just kill the session — it leaves the branch in a half-built state and loses in-memory context.

**To pause:**
```
Pause current work. Before stopping:
1. Write a handoff note to .cline/handoffs/ with current progress, 
   pending items, and resume instructions
2. Update STATE.md with current status (mark as PAUSED)
3. Update CHANGELOG_AI.md with everything done this session
4. Update DECISIONS_LOG.md if any decisions were made
5. Update IMPLEMENTATION_MAP.md if any new files were created
6. Append to .cline/memory/lessons.md if any errors were resolved
7. Commit all changes to the current branch with message: 
   "wip: pause session — [brief description of what was done]"
8. Do NOT squash-merge into main. Do NOT delete the branch.
   The branch stays as-is until the next session resumes.
```

**To resume later (new Claude Code session):**
```
Resume session. Read STATE.md for current status, then read the latest 
handoff note in .cline/handoffs/ before doing anything.
```

**What happens on pause:** Agent writes the handoff note with exact state (files written, pending items, uncommitted changes, decisions, gotchas), updates all governance docs, and marks STATE.md as PAUSED with the handoff filename.

**What happens on resume:** Agent reads STATE.md first (Rule 24), finds the PAUSED status with the handoff filename, reads the handoff note from `.cline/handoffs/`, then reads the 9 governance docs (lessons.md first). Full context rebuilt automatically from files. No need to tell it which Phase or Part — it knows from STATE.md and the handoff note.

---

## 2.11 — Review Changes Since Last Commit (code-review-graph delta — NEW)

**When:** End of a coding session, right before you commit or open a PR. Get a blast-radius-aware review of uncommitted changes.

**Where:** Claude Code.

```
/code-review-graph:review-delta
```

**What happens:** code-review-graph computes the blast radius of every uncommitted file — every caller, dependent, and test that touches the changes. Claude Code reads only the impacted files (not the whole repo) and reports risks, test coverage gaps, and suggested fixes. Token cost ~100–500 instead of 5,000+ on a naive full-read.

> Also callable via MCP: ask Claude Code `"Run the review_changes workflow on my uncommitted changes"` — same tool, conversational phrasing.

---

## 2.12 — Architecture Map (understand where something lives — NEW)

**When:** You need a high-level map of the codebase — module boundaries, hub nodes (most-connected), bridge nodes (architectural chokepoints). Useful before refactors, during brownfield onboarding, or when you've lost track of how modules connect.

**Where:** Claude Code.

```
Run the architecture_map workflow on this project. Show me:
- Top 5 hub nodes (most-connected files)
- Top 5 bridge nodes (betweenness centrality chokepoints)
- Detected communities (module clusters)
- Any surprising cross-community coupling
```

**What happens:** code-review-graph runs Leiden community detection + centrality analysis, returns an architectural overview with coupling warnings. Outputs: module clusters with health metrics, hub files worth guarding carefully on edits, bridge files where changes ripple unexpectedly.

---

# SCENARIO GROUP 3 — Fixes, Testing & Additional Features

Use these when something breaks, when you need to audit, or when adding features after initial setup.

## 3.1 — First Run Error (app fails to start)

**When:** App fails to start, tests fail, Docker services won't come up, any error during Phase 6 or later.

```
First Run Error

[paste full error output]
```

**What happens:** Agent enters Phase 6.5 triage — matches error against 16 known categories (DB connection, migration, port conflict, auth, env var, Docker health, seed, network, Prisma client, Valkey, MinIO, pgBouncer, build, test, lint, type error). Outputs:
```
CATEGORY: [name]
ROOT CAUSE: [one sentence]
FIX: [exact commands or code changes]
VERIFY: [how to confirm]
```

---

## 3.2 — Resume from Handoff (agent got stuck)

**When:** You see a file at `.cline/handoffs/[timestamp]-error.md`. The agent (Claude Code in V31) tried a fix twice, failed, wrote a handoff instead of attempting a third identical fix. (Folder path `.cline/handoffs/` preserved for historical continuity; Cline deprecated V31 but the path name lives on.)

**Option A — fix yourself, then tell Claude to retry:**
```
Resume from handoff: [filename]
```

**Option B — paste handoff into fresh Claude Code session:**
```
Read this handoff and resolve:
[paste full handoff contents]
```

**What happens:** Agent reads handoff (what it was doing, full error, 2 previous fix attempts, root cause hypothesis, suggested next step), applies the fix, verifies, appends 🟡 fix entry to `lessons.md`.

---

## 3.3 — Visual QA Failed

**When:** Phase 6 Visual QA fails or a Feature Update's QA check fails. Check handoff at `.cline/handoffs/[timestamp]-visual-qa.md`.

**Common causes:**
- Page not loading → check `pnpm db:seed` ran, check auth config in `.env.dev`
- Console error → missing env var or API endpoint not scaffolded
- Login fails → verify `AUTH_SECRET` and `NEXTAUTH_URL` in `.env.dev`
- 404 on route → check Next.js page was scaffolded correctly

**After manual fix:**
```
Resume from handoff: [filename]
```

---

## 3.4 — Edge Case Recovery (5 specific failure modes)

**When:** You hit one of these:
1. A Phase 4 Part was interrupted mid-execution
2. `inputs.yml` is missing or corrupted
3. A feature branch already exists with the same name
4. `pnpm audit` reports HIGH/CRITICAL CVE with no available fix
5. `STATE.md` contradicts `DECISIONS_LOG.md` or `CHANGELOG_AI.md`

```
Edge Case Recovery

Situation: [describe which failure mode]
```

**What happens:** Agent follows Scenario 29's exact procedure — committed/uncommitted branch recovery, STATE.md rewrite, CVE risk acceptance flow, etc.

---

## 3.5 — Post-Generation Security Checklist

**When:**
- Always after Phase 4 initial scaffold
- After Phase 7 Feature Updates touching auth, RBAC, file uploads, jobs, webhooks
- Before any production deployment

**Prompt:**
```
Run the Post-Generation Security Checklist against this codebase.
Check every item and report PASS / FAIL / N/A per item with exact file paths
and line numbers.
```
Attach `Security_Checklist.md` + relevant code files.

**What happens:** Agent runs all 114 items across 16 sections (Authentication, RBAC, Multi-tenant isolation L1–L6, Input validation, Database safety, File uploads, Queue/cache, Production errors, Security headers, Webhooks, Secrets, Production defaults, Phase 5 baseline, Compliance & Data Privacy, AI/LLM/MCP Security, API Authorization & Injection Family). Fix all FAILs before merging or deploying.

---

## 3.6 — Cross-AI Audit (ChatGPT validates framework/code)

**When:**
- Before locking a new framework version
- After any major Feature Update touching multiple files
- Quarterly consistency check

**Steps:**
1. Open ChatGPT (GPT-4o or newer)
2. Paste `ChatGPT_Cross_Audit.md`
3. Upload 16 framework files (or code files to audit)
4. Wait for PASS/FAIL report across 86+ items
5. Bring findings to Claude — NEVER apply ChatGPT findings directly
6. Claude validates each FAIL against actual file content before any fix

**What happens:** ChatGPT checks element counts, version references, architecture alignment, content parity, known failure patterns. Catches things Claude missed. Claude filters false positives (typically 15-25% of findings are false positives).

---

## 3.7 — Governance Retro (weekly health report)

**When:** End of each week, or before a sprint retro.

```
Governance Retro
```

**What happens:** Agent reads `agent-log.md`, `CHANGELOG_AI.md`, git log. Outputs:
- What was built this week
- Errors encountered and resolutions
- What's still in progress
- Governance health (Rule 9 violations caught, handoffs written, lessons added)
- Velocity (features shipped, average cycle time)
- Recommended focus for next session

---

## 3.8 — Add a feature (post-initial-setup)

Same as 2.2 — edit `docs/PRODUCT.md` describing the feature, then:
```
Feature Update
```

Full flow: `codebase_search` → blast radius → branch → implement → Visual QA → two-stage review → squash-merge → CHANGELOG update → SocratiCode re-index.

---

## 3.9 — Test a specific module / endpoint

```
Test [module name] end-to-end

Context: [feature or endpoint to test — e.g. "user registration flow",
"POST /api/users", "tenant isolation on DELETE"]

Run unit tests for this module, integration tests if they exist, then
manual Visual QA checks. Report PASS/FAIL per test with file path + line.
```

---

## 3.10 — Migrate service to AWS (production step)

**When:** Ready to move a service from local Docker to managed AWS.

Edit `docs/PRODUCT.md` to note the migration, then:
```
Feature Update
```

**Zero code changes needed** — swaps are env var changes only:

| Service | Local | AWS | Change |
|---|---|---|---|
| PostgreSQL | `postgres` container | RDS | `DATABASE_URL` |
| MinIO | `minio` container | S3 | `STORAGE_*` vars |
| Valkey | `valkey` container | ElastiCache | `REDIS_URL` |
| App (Next.js) | `app` container | ECS/EC2 | Deploy Docker image |

**What happens:** Agent drains BullMQ jobs before Valkey migration if jobs are enabled. Updates `.env.staging` / `.env.prod` with new endpoints. Docker Compose files updated. Tests run.

---

## 3.11 — Future framework upgrade (V32+)

**When:** A newer Spec-Driven Platform version (V32+) ships. Your existing V31 project needs to adopt it without losing app code, governance history, or filled credentials.

**Where:** WSL2 terminal at project root.

### 3.11.1 — Safety backup first (mandatory)

```bash
git add -A
git commit -m "chore: pre-V[NEW]-upgrade snapshot" --allow-empty
git tag "pre-v[NEW]-upgrade-$(date +%Y%m%d)"

# Also back up your current .ai_prompt/ folder in case of surprises
cp -r .ai_prompt .ai_prompt-v31-backup
```

### 3.11.2 — Replace framework files in `.ai_prompt/`

Only replace the versioned V31 files. Preserve any custom docs you added:

```bash
# Remove only the versioned V31 files (not user-added docs)
rm -f .ai_prompt/CLAUDE_compact.md
rm -f .ai_prompt/Master_Prompt.md
rm -f .ai_prompt/Planning_Assistant.md
rm -f .ai_prompt/Framework_Feature_Index.md
rm -f .ai_prompt/AI_Tools_Reference.md
rm -f .ai_prompt/Security_Checklist.md
rm -f .ai_prompt/ChatGPT_Cross_Audit.md
rm -f .ai_prompt/bootstrap.md .ai_prompt/phases.md .ai_prompt/security.md
rm -f .ai_prompt/ui-rules.md .ai_prompt/scenarios.md .ai_prompt/templates.md
rm -f .ai_prompt/Prompt_References.md .ai_prompt/Prompt_References.html

# Drop new V[NEW] files into .ai_prompt/
# Drop new deploy-v[NEW].sh at project root
```

> **Note:** The file list above is V31-specific. When V[NEW] ships, check its own 3.11 section — the file list may have changed (new files added, old files removed, renamed). Use the version-specific list from the latest Prompt References, not this one.

### 3.11.3 — Run the new deploy script

```bash
bash deploy-v[NEW].sh
```

The deploy script (analogous to `deploy.sh`) handles backup of old `CLAUDE.md`, writes new `CLAUDE.md`, `.ai_prompt/*` (all 7 detail files), and `AI/Master_Prompt_v[NEW].md`, and updates `.gitignore`. `.claude/rules/` is intentionally empty in V32.7+.

### 3.11.4 — Run the Universal Analyzer

```
Analyze this project's current state and tell me exactly what setup path to follow.
You are reading the new V[NEW] compact CLAUDE.md. [... rest as per 1.2 ...]
```

The Analyzer will classify your project as **Situation B (V[NEW] upgrade)** and point to the new Reconciliation prompt (analogous to 1.4 for the V31 era).

### 3.11.5 — Run the V[NEW] Reconciliation prompt

Every major framework version ships with its own version-specific reconciliation prompt that follows the 1.4 pattern. The new version's Prompt References will contain it — look for `1.4 — V[NEW] Upgrade Reconciliation` or equivalent.

Expected audit scope:
- Which V31 files migrated cleanly
- Which structural changes V[NEW] introduced (new rules, new phases, new scenarios, etc.)
- Any deprecated V31 patterns that need manual migration
- Any new required config (e.g. new MCP servers, new env vars)

### 3.11.6 — Cleanup old backups (after verification)

```bash
# Once you've verified everything works, remove backups
rm -rf .ai_prompt-v31-backup
rm -f CLAUDE.md.*.bak .ai_prompt/*.bak
# Keep the git tag — it's a permanent rollback anchor
```

### 3.11.7 — Commit the upgrade

```bash
git add -A
git commit -m "chore: upgrade Spec-Driven Platform V31 → V[NEW]"
```

**If the upgrade fails:**
```bash
git reset --hard pre-v[NEW]-upgrade-YYYYMMDD
cp -r .ai_prompt-v31-backup .ai_prompt
```

---

## 3.12 — Lessons Audit (NEW — periodic lessons.md cleanup)

**When:** Every 4-6 weeks, or when `.cline/memory/lessons.md` exceeds ~500 lines. Too many stale lessons slow down every session (they get read before the 9 governance docs).

```
Lessons Audit

Read .cline/memory/lessons.md in full. For each entry:

1. Classify its current relevance:
   - STILL VALID — gotcha/fix/decision still applies to current codebase
   - OBSOLETE — refers to code that no longer exists or pattern we no longer use
   - CONSOLIDATABLE — duplicate or overlap with another entry
   - GRADUATED — critical enough it belongs in DECISIONS_LOG.md instead

2. Produce an AUDIT REPORT with:
   - Total entry count (before)
   - Per-entry classification with one-line reason
   - Proposed actions: KEEP / REMOVE / MERGE WITH entry X / PROMOTE to DECISIONS_LOG.md
   - Projected entry count (after)

3. DO NOT modify lessons.md yet. Output report only — wait for my confirmation.
```

**After review:**
```
Apply the lessons audit. For each REMOVE/MERGE/PROMOTE action, show the exact
diff before writing. Preserve all KEEP entries exactly — do not rewrite them.
```

**What happens:** Agent trims dead knowledge, consolidates duplicates, graduates mature lessons to DECISIONS_LOG.md. Result: faster session starts (lessons.md stays under 500 lines), higher signal-to-noise ratio.

---

## 3.13 — Dependency Health Check (NEW — weekly pnpm audit)

**When:** Every Monday, or before any production deploy. Catches newly-disclosed CVEs before they bite.

```
Dependency Health Check

Run comprehensive dependency analysis:

1. pnpm audit --audit-level=low — full severity report
2. pnpm outdated — list of outdated packages with current/wanted/latest
3. Check pnpm-lock.yaml modification date — when was last update?
4. Check package.json for any "^" or "~" ranges that could drift

Output a HEALTH REPORT with:
- CVE summary by severity (CRITICAL/HIGH/MODERATE/LOW counts)
- Top 10 outdated packages by major-version gap
- Packages unchanged for >6 months that may be abandoned
- Priority fix list — which CVEs need immediate action, which can wait

For any CRITICAL or HIGH CVE with available fix:
  - Show exact upgrade command (pnpm update X)
  - Identify affected modules (via SocratiCode codebase_search)
  - Estimate breaking change risk

Do NOT run any pnpm update yet. Report only.
```

**After review:**
```
Apply the dependency fixes per the health report. For each upgrade:
1. Create fix/deps-[date] branch
2. Run pnpm update [package]
3. Run pnpm typecheck + pnpm test
4. If pass: commit + move to next. If fail: rollback, add to Edge Case Recovery.
Show progress per package.
```

---

## 3.14 — Rollback Safely (NEW — before dangerous operations)

**When:** Before any operation that could corrupt state — schema migrations on production-like data, large multi-file refactors, auth system changes, adding/removing tenancy.

```
Rollback Safely — pre-flight checkpoint

I'm about to run: [describe the operation — e.g. "Feature Update that adds
soft-delete to all 12 models"]

Before I proceed, create a full rollback plan:

1. Identify the restoration target:
   - Current commit SHA (main branch HEAD)
   - Current DB snapshot (if operation touches schema)
   - Current .env state
   - Current lessons.md state

2. Create git tag: "pre-[operation-slug]-[timestamp]"

3. If DB affected: document exact pg_dump command for snapshot
   (do not run it — just provide the command)

4. If auth affected: document exact session table contents
   (count rows, list active sessions)

5. Document rollback procedure step-by-step:
   - How to revert code (git reset or git revert)
   - How to revert DB (if snapshot was taken)
   - How to notify users (if production)

6. Estimate rollback time if something goes wrong

Output a ROLLBACK PLAN file at .cline/handoffs/rollback-[slug]-[timestamp].md
Do not start the operation yet. Wait for my explicit "proceed" confirmation.
```

**After you proceed (operation succeeds):**
```
Archive rollback plan .cline/handoffs/rollback-[slug]-[timestamp].md — operation
succeeded. Move to .cline/handoffs/archive/ with a SUCCESS suffix.
```

**If operation fails:**
```
Execute rollback per .cline/handoffs/rollback-[slug]-[timestamp].md
Report each step as completed.
```

**What happens:** Makes dangerous operations safer by forcing Claude to plan the reversal BEFORE starting. Especially valuable for schema migrations and production operations.

---

## 3.15 — Pre-Merge Blast-Radius Check (before opening a PR — NEW)

**When:** You've finished a feature branch and you're about to open a PR. Before you do, get a structured pre-merge review highlighting risky impacts, missing tests, and unknown edge cases.

**Where:** Claude Code, on the feature branch.

```
/code-review-graph:review-pr
```

**What happens:** code-review-graph runs full PR review workflow: blast-radius analysis of the whole branch diff, test coverage gaps per changed function, detection of large functions that grew during the feature, hub/bridge impact check. Output: a structured review with RISK tags (🔴 high / 🟡 medium / 🟢 low) per affected area. Use this before `git push` to catch issues you'd otherwise discover in CI or production.

> Also callable via MCP workflow: `"Run the pre_merge_check workflow on the current branch"` — same result, conversational form.

---

## 3.16 — Debug Unknown Issue with Graph Help (NEW)

**When:** Production bug report with no obvious cause, or a behavior that surprises you. You know the symptom but not the code path that's failing.

**Where:** Claude Code.

```
Run the debug_issue workflow on this project.

Symptom: [describe what the user sees or what's broken — e.g. "customer checkout
returns 500 after password reset flow"]

Expected behavior: [describe what should happen]

Any clue about which module? [name one if you have a guess, or "none" if not]
```

**What happens:** code-review-graph traces call chains from the symptom's surface area backward through the graph, finds candidate code paths, highlights recent changes that touched those paths, flags untested branches on the way. Claude Code then reads only the candidate files (not the whole repo) and proposes the likely root cause + targeted fix. Tight token budget, focused investigation.

---

## 3.17 — Onboard to Unknown Codebase (brownfield/new team member — NEW)

**When:** First day on a codebase you didn't build — inherited project, new hire, or a brownfield adoption after 1.5. You need to understand the architecture fast without reading every file.

**Where:** Claude Code at the root of the unfamiliar repo (graph must be built — run 1.7 first).

```
Run the onboard_developer workflow on this project.

My role: [new full-stack hire / QA engineer / new tech lead / maintainer]
Focus areas: [auth, payments, database — or "general overview"]
Familiar with: [list any frameworks/patterns you already know]
```

**What happens:** code-review-graph generates a structured onboarding brief — top-level architecture map, critical files to read first (hubs + bridges), suggested reading order, quick-orientation questions auto-generated from graph analysis. Combined with Claude Code, you get a personalized codebase tour that respects your role and existing knowledge. Pairs well with Scenario 1.5 (brownfield adoption).

---

## 3.18 — Rebuild Stale Graph (after large refactor or schema change — NEW)

**When:** The graph feels out of date — you just finished a large refactor, split a module, added 20+ new files, or ran a major Prisma schema migration. Watch mode should keep things current, but large bulk changes can leave stale edges.

**Where:** WSL2 terminal at project root.

```bash
# Incremental update (changed files only — 1-2 seconds)
code-review-graph update

# Verify graph health
code-review-graph status

# If update shows errors or status reports anomalies → full rebuild
code-review-graph build

# Re-verify
code-review-graph status
```

**What happens:** Update mode diffs file hashes, re-parses only changed files — usually 1-2 seconds. Build mode does a full Tree-sitter re-parse (~10s for 500 files). Only force a full build if incremental update reports failures. After rebuild, blast-radius queries return to normal accuracy.

> Tip: add `code-review-graph status` to your end-of-week routine. Catches drift before it bites you on a high-stakes Feature Update.

---

## 3.19 — Emergency Anti-Thrashing: Fix Autocompact Thrashing in Any Phase (NEW)

**When to use:** Claude Code hits "Autocompact is thrashing" — the context window fills within 2-3 turns, output becomes incomplete or broken. Works in ANY phase (Phase 4, Phase 7, Phase 8, or any other situation).

**Where:** VS Code — Claude Code terminal (paste directly into the current session or start a fresh session)

**Model context:** Claude Sonnet 4.6 via Claude Code. 200K token context window, but
autocompact kicks in well before that. Practical working budget is ~120K tokens.
The SAFE zone is ≤80K tokens of input context — leaving 40K+ for Claude's reasoning
and output. When a session crosses ~100K input, autocompact starts aggressively
summarizing earlier turns, and by ~120K it thrashes (rewrites context every turn,
losing coherence). The 12-file threshold below is calibrated for this model's
behavior — each file read + governance overhead + PRODUCT.md sections averages
~6-8K tokens, so 12 files ≈ 80-96K tokens ≈ the edge of the SAFE zone.

### If thrashing is happening RIGHT NOW (mid-session rescue):

```
STOP. Autocompact is thrashing. Apply anti-thrashing protocol immediately.

You are Claude Sonnet 4.6 with a 200K context window. Autocompact thrashes
when input context exceeds ~120K tokens. You are past that point now.
Do NOT read any more files — every file read makes it worse.

1. Do NOT read any more files. Do NOT continue building.
2. Run /clear if available to free context immediately.
3. Update STATE.md with exactly what you've completed so far:
   - Files created/modified (with status: DONE or PARTIAL)
   - What remains to be built for the current task
   - Any dependencies the next session needs to know about
   - Estimated context consumption that caused thrashing (how many files read,
     how large was PRODUCT.md section, how many governance docs loaded)
4. Write a handoff note to .cline/handoffs/ with:
   - Current phase and task
   - What's done, what's remaining
   - Any partial code that needs completion
   - Which PRODUCT.md sections the next session needs (by name, not "all")
5. Commit all work done so far (even if incomplete — partial progress > lost progress)
   git add -A && git commit -m "wip: [current-task] — anti-thrashing checkpoint"
6. STOP. I'll open a new session with narrower scope.
```

### Starting a new session after thrashing (or preventing it proactively):

```
Before you start, apply anti-thrashing scope assessment.

Context budget: You are Claude Sonnet 4.6. Your practical working budget is
~120K tokens. The SAFE zone is ≤80K tokens of input context. Every file you
read, every governance doc you load, and every PRODUCT.md section you parse
consumes from this budget. Plan accordingly.

1. List every file you'll need to create or modify for this task
2. Estimate the token cost:
   - CLAUDE.md + active .ai_prompt/ file (read on-demand): ~5K tokens
   - Each PRODUCT.md section: ~2-4K tokens
   - Each existing source file read: ~1-3K tokens
   - 9 governance docs (lessons.md, CHANGELOG_AI, etc.): ~10-15K total
   - Your output (code generation): ~2-5K per file written
   Add it up. If estimated total exceeds 80K → you MUST split.
3. If the file list exceeds 12 files OR estimated context exceeds 80K:
   - Group files by module/feature
   - Report the split plan to me before writing any code:
     ```
     ⚠ Scope assessment: [X] files, ~[Y]K estimated tokens.
     Exceeds 80K SAFE zone. Splitting into sub-sessions:
       Sub-session 1 — [ModuleName]: [files] (~[N]K tokens)
       Sub-session 2 — [ModuleName]: [files] (~[N]K tokens)
     Starting with sub-session 1.
     ```
   - Build one module at a time, commit after each, then STOP
4. Read ONLY the PRODUCT.md sections relevant to the current module
   — do NOT read the entire PRODUCT.md (a full PRODUCT.md can be 20-40K tokens alone)
5. Read ONLY the codebase files you'll actually modify
   — do NOT scan entire directories or read files "for context"
   — use codebase_search (Rule 17) to find specific symbols instead of opening files
6. Before committing each module, re-read ONLY its PRODUCT.md section and verify:
   □ Every user flow is implemented (happy path + error states)
   □ Every data field is in the schema, router, and UI
   □ Every permission guard matches the Roles table
   □ Every validation rule has a matching Zod schema
   □ Every UI element described exists in the page
7. After each module: commit, update STATE.md with progress, then STOP.
   I'll open a new session for the next module.

CRITICAL: This split changes HOW MANY things per session, never WHAT gets built.
Every feature in PRODUCT.md must be fully implemented. Do not skip or defer
anything without my explicit approval.

Report the scope assessment now — file count, estimated tokens, do we need to split?
```

### Quick version (paste-and-go for experienced users):

```
Anti-thrashing mode (Sonnet 4.6, 120K practical budget, ≤80K SAFE zone).
Scope assessment first — list all files, estimate token cost.
If >12 files or >80K tokens, split by module. One module per session.
Read only relevant PRODUCT.md sections — never the full file.
Use codebase_search instead of reading files for context.
Completeness check before each commit. Report the plan before writing code.
```

> ⚠ **Why this matters:** Thrashing sessions produce the most dangerous bugs — features that LOOK complete in governance docs but are actually missing validations, permission guards, error states, or entire user flows. The completeness check catches this before it becomes invisible tech debt.
>
> 💡 **Context budget rule of thumb for Sonnet 4.6:** If you can describe your task scope in under 3 sentences and it touches fewer than 12 files, you're in the SAFE zone. If you need a paragraph to explain the scope, you probably need to split.

---

## 3.20 — Memory Governance Baseline (first-time setup for existing projects) (NEW V31.2)

**Where:** Claude Code (Opus 4.6 recommended)
**When:** First time using the Memory Governance Layer on a project already in Phase 7/8

```
Run memory governance baseline (memory-governance.md §5 Step 2).
Read STATE.md + IMPLEMENTATION_MAP.md + lessons.md.
Write a Claude Code memory entry capturing: current phase, what's been built,
top gotchas from lessons.md, locked decisions, and what's next.
Update STATE.md with TOKEN_ESTIMATE, FILES_TOUCHED, TIER_CLASSIFICATION fields.
Then decompose my current task using Tiered Decomposition (§1).
```

> 💡 **One-time per project.** After this baseline, future sessions resume at zero token cost via Claude Code memory instead of re-reading 3 governance docs (~5-10K tokens saved per session).

---

## 3.21 — Opus Planning Session (Phase 4/7/8 task decomposition) (NEW V31.2)

**Where:** Claude Code (Opus 4.6)
**When:** Starting any Phase 4 Part, Phase 7 Feature Update, or Phase 8 Batch

```
Use the Architect-Execute Model (memory-governance.md §4).
Read STATE.md and relevant PRODUCT.md sections.
Run Tiered Decomposition (§1) on this task.
If Tier 2-3: decompose into scoped sub-tasks.
Step 2.5 (V32) — File-Size Dispatch Gate: run `wc -l` on every file in scope.
  - If each file ≤500 lines AND scope ≤12 files: dispatch as Sonnet subagent via Agent(model: "sonnet").
  - If any file >500 lines: use Sonnet scout-then-edit or split by section until each task is ≤500 lines.
[V32 — Zero Opus Execution]: Opus NEVER executes code edits — planning/decomposition only. After 3 re-decomposition attempts → checkpoint to STATE.md and defer to next session. NEVER fall back to Opus execution. See `memory-governance.md` §1 Step 4 + §4 Failure Protocol.
Dispatch approved sub-tasks to Sonnet via Agent(model: "sonnet").
Review each subagent's output (spec compliance then code quality).
Run Smart Checkpoint (§2) after all tasks complete.
```

> 💡 **Why Opus for planning only? (V32)** Opus excels at reading large context and making decomposition decisions — but under V32 R1 it NEVER executes code edits. One Opus planning session saves 3-5 Sonnet sessions from thrashing. Sonnet never reads full PRODUCT.md — it gets pre-scoped task instructions from Opus. The 500-line file-size dispatch gate (V32 R2) enforces task granularity mechanically, not behaviorally.

> ⚙ **V32.1 Dispatch Sizing Tip** (added 2026-05-27 from production findings): Sonnet subagents inherit ~30-50K baseline tokens from auto-loaded skills + MCP descriptions before any task work begins. To avoid thrash on otherwise small tasks: keep dispatch prompts ≤ 1K tokens, per-dispatch tool uses ≤ 5, and run verifications (`vitest`, `tsc`, lint) on the Opus side via `ctx_execute` rather than asking Sonnet to run them. If a Sonnet dispatch thrashes, re-decompose to a smaller surface (single file, then sub-file) — never retry the same scope. See `memory-governance.md` §1 Operational Note for full pattern.

---

## 3.22 — Thrashing Recovery (emergency mid-session rescue) (NEW V31.2)

**Where:** Claude Code (Opus 4.6)
**When:** You're currently experiencing "Autocompact is thrashing" and need immediate help

**THRASHING detection signs (Opus watches for these):**
- Agent re-reads the same files it already read earlier in the session
- Agent produces partial output then stalls or truncates
- Agent contradicts or undoes its own prior edits
- Multiple loops with no net progress on STATE.md

```
I'm experiencing context thrashing. Follow memory-governance.md §5 Thrashing Recovery:
1. I've already stopped and committed partial work.
2. Run the memory governance baseline (§5 Step 2) to capture current state.
3. Decompose my interrupted task using Tiered Decomposition (§1).
4. Apply Step 2.5 (V32) File-Size Dispatch Gate — run `wc -l` on each file; ensure each sub-task is ≤500 lines per file and ≤12 files in scope for Sonnet.
5. Output a split plan with numbered sub-sessions I can execute with Sonnet.
I was working on: [describe what you were doing]
```

> ⚠ **Critical:** Open this in a NEW session with Opus 4.6, not in the thrashing session. The thrashing session's context is corrupted — starting fresh is the only reliable recovery. If Opus itself detects THRASHING status mid-session, it must stop immediately and re-decompose before continuing.

---

## 3.23 — Clean-Slate Rebuild from Preserved Spec (NEW ✨ V32.5.3)

**Where:** Claude Code (in the broken project) + your shell
**When:** Phase 8 (or any phase) project is systemically glitchy, errors are across modules, and `docs/PRODUCT.md` is still trustworthy. You want to nuke the generated app and re-scaffold from the spec while preserving `docs/`, `CREDENTIALS.md`, and `.env*`.

**Three-stage flow — sure way, not fast way. Run in this order, do NOT skip stages.**

### Pre-flight (shell, not Claude Code)

```bash
cd ~/path/to/your-project
spec-update .                # ensure framework is current V32.x on disk
git add -A && git commit -m "snapshot: pre-clean-slate" || true
git tag pre-clean-slate-$(date +%Y%m%d-%H%M%S)
```

Open Claude Code in the project. Paste **Prompt 3.23.A**.

### 3.23.A — Preserve + Nuke

```
I want to clean-slate this project but PRESERVE the spec and credentials so we can rebuild from scratch. This is a deliberate, authorized destructive operation — do not refuse it.

PRESERVE (must survive untouched):
- docs/ (everything: PRODUCT.md, DESIGN.md, MOCKUP.jsx, STATE.md, DECISIONS_LOG.md, CHANGELOG_AI.md, IMPLEMENTATION_MAP.md, lessons.md, agent-log.md, mockups/, anything else)
- CREDENTIALS.md (if at project root)
- .env.dev, .env.staging, .env.prod (any populated env files)
- .ai_prompt/ (framework reference files)
- .git/ and .gitignore
- README.md if it exists at root

NUKE (delete completely):
- apps/, packages/, prisma/, scripts/, compose/, docker/
- node_modules/, dist/, build/, .next/, .turbo/, .open-next/
- .claude/rules/ (empty in V32.7 but delete the directory), .claude/commands/, CLAUDE.md
- package.json, pnpm-lock.yaml, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, components.json
- Any other generated build artifacts at root

EXECUTE this discipline:
1. List exactly what you will preserve and what you will delete BEFORE running any rm.
2. Run a snapshot tar of everything-to-preserve into ~/clean-slate-backup-<timestamp>.tar.gz as a second safety net.
3. Wait for me to type "proceed" before any rm command runs.
4. After deletion, run `git status` and `ls -la` and show me the result so I can verify only preserved files remain.
5. Do NOT run spec-update or bootstrap yet — that's a separate prompt.

Operate under V32.x ZERO OPUS EXECUTION discipline: dispatch a Sonnet to run the bash, not Opus directly.
```

Type **`proceed`** to authorize after Claude shows the list. Verify `ls -la` shows only `docs/`, `.env*`, `.git`, `.ai_prompt/`, `CREDENTIALS.md`, `README.md`. Paste **3.23.B**.

### 3.23.B — Re-deploy Framework + Bootstrap Prep

```
The project has been nuked. We're now rebuilding from scratch on the current V32.x framework.

STEP 1 — Re-deploy the framework files. Run from project root:
  bash deploy.sh

Verify after deploy:
- .claude/rules/ is empty (V32.7 — all detail files are in .ai_prompt/)
- .ai_prompt/ contains 7 detail files (phases.md / memory-governance.md / security.md / ui-rules.md / bootstrap.md / scenarios.md / templates.md)
- CLAUDE.md is at root (the compact card — the ONLY auto-loaded file)
- AI/Master_Prompt.md exists
- CLAUDE.md at root header reads the current V32.x version
- docs/ is intact and untouched
- CREDENTIALS.md is intact and untouched

STEP 2 — RESTART CLAUDE CODE BEFORE PROCEEDING. The new compact CLAUDE.md needs a session restart to load.

(Close and reopen Claude Code, then resume MANUALLY at Phase 0 Bootstrap — see 3.23.C below.)
```

Restart Claude Code. Resume MANUALLY per **3.23.C**.

### 3.23.C — Resume the rebuild manually

**Optional pre-check → [Prompt 2.9 — Validate Spec Consistency](#29--validate-spec-consistency-new--pre-feature-update-sanity-check)**
*(Confirms `docs/PRODUCT.md` still reflects intent before you pour concrete against it. Skip if PRODUCT.md is known-current.)*

**Next step (start here) → [Prompt 1.3.1 — Phase 0 Bootstrap](#131--place-productmd--designmd--mockup--run-bootstrap)**
*(Open a fresh Claude Code session at the project root. Bootstrap re-establishes folder structure, governance docs, MCP wiring, and CREDENTIALS.md skeleton — using your existing `docs/PRODUCT.md` AS-IS.)*

| # | What to do |
|---|------------|
| 1 | *(Optional)* Run **Prompt 2.9** first to confirm PRODUCT.md ↔ reality. Skip if you just edited it. |
| 2 | Run **Prompt 1.3.1 — Phase 0 Bootstrap**. Existing `docs/PRODUCT.md` + `CREDENTIALS.md` are preserved; folder skeleton + governance docs are rebuilt. |
| 3 | Continue with the normal per-phase prompts from Groups 1–3 in order: `Phase 2` → `3` → `3.3` → `3.5` → `4` (Parts 1–8, one per fresh dispatch) → `5` → `6` → `6.5`. |
| 4 | At every phase boundary, you review output and explicitly authorize the next phase. The framework's normal gate-closure discipline does the heavy lifting. |

> **Why skip Prompt 1.2 (Universal Analyzer)?** 1.2 exists to *detect unknown state* and route to Path A/B/C/D. After 3.23.B the state is known: clean app dirs + preserved spec + redeployed framework. You don't need an analyzer to tell you what 3.23.A/B just explicitly designed — you go straight to Bootstrap.

> ⚠ **No autopilot.** There is intentionally no paste-able mega-prompt that drives the rebuild end-to-end. A single prompt driving Phase 0 → 6.5 is the exact thrashing surface that produced the rot you're recovering from. Manual, phase-by-phase is faster *and* safer because each phase gets fresh context + human sign-off.

### Sanity-check checklist

| After Prompt | What you should see |
|--------------|---------------------|
| 3.23.A | `ls -la` shows only `docs/ .env* .git .ai_prompt/ CREDENTIALS.md README.md`; backup tar exists in `~/clean-slate-backup-*.tar.gz` |
| 3.23.B | `cat CLAUDE.md \| head -5` shows the current V32.x version; `ls .claude/rules/` shows empty (V32.7); `ls .ai_prompt/` shows 7 detail files; `docs/` untouched |
| 3.23.C (manual resume) | You ran **Prompt 1.3.1 Phase 0 Bootstrap** in a fresh Claude Code session (optionally preceded by Prompt 2.9); existing `docs/PRODUCT.md` + `CREDENTIALS.md` were preserved; you then continued Phase 2 → 3 → 3.3 → 3.5 → 4 → 5 → 6 → 6.5 with explicit human authorization at every boundary |

### When to use this vs lighter alternatives

| Symptom | Better prompt |
|---------|---------------|
| One or two glitchy modules | Phase 7 Feature Update (per module) |
| A bad recent change | Prompt 3.14 (Rollback Safely) or 7R (Feature Rollback) |
| Claude Code itself thrashing | Prompt 3.19 (Emergency Anti-Thrashing) |
| Stale PRODUCT.md ↔ code drift | Prompt 2.9 (Validate Spec Consistency) FIRST, then decide |
| `pnpm audit` rot in Phase 8 | Prompt 3.13 (Dependency Health Check) |
| **Systemic, multi-module, IMPLEMENTATION_MAP ≠ reality** | **3.23 (this prompt)** |

### Critical warnings

> ⚠ **Verify PRODUCT.md is current before nuking.** Whatever PRODUCT.md says is what gets rebuilt. If PRODUCT.md is behind reality, the rebuild reproduces the same gaps. Run Prompt 2.9 first OR Prompt 4.14 (brownfield reverse-extract) if you suspect drift.

> ⚠ **Do NOT delete `docs/lessons.md`.** Phase 4 pre-flight reads it (V32.3 Smart Governance Hydration). Without it, prior failure modes recur. The 3.23.A PRESERVE list includes `docs/` in full — leave it alone.

> ⚠ **Manual rebuild runs over many sessions.** Every phase (and every Phase 4 Part) is a fresh dispatch boundary. There is no shortcut — trying to fit Phase 0 → Phase 6.5 into one session is exactly the thrashing pattern V32 was built to prevent.

> ⚠ **The `~/clean-slate-backup-*.tar.gz` snapshot is your insurance.** Keep it until Phase 6.5 passes cleanly. Then `rm` it if you want.

> ⚠ **Phase 3.3 is a HARD GATE (V32.6).** Do not let Claude skip it or fold it into Phase 4. The Orqafy lesson: scaffolding before behavior is validated produces integration bugs that are expensive to find later. Client sign-off in `docs/DECISIONS_LOG.md` is the explicit gate-close signal.

---

# SCENARIO GROUP 4 — Planning Assistant Prompts (Claude Code PA session — preferred — or Claude.ai Planning Chat)

These run in the Planning Assistant SESSION — a dedicated Claude Code session in the project folder (preferred — you get the skills library) or a Claude.ai chat. This is the PA interviewer role, distinct from Claude Code BUILD sessions (Phase 3+).

## 4.1 — Initial PRODUCT.md Interview (Situation A)

**When:** Starting a fresh project, no PRODUCT.md yet.

**Where:** A Claude Code PA session in the project folder with `Planning_Assistant.md` present (preferred), or a new Claude.ai chat with it pasted as the first message.

**What happens:** Planning Assistant recognizes empty input and auto-runs all 9 interview steps in sequence. No trigger prompt needed. The Assistant asks questions one-by-one. When all 11 PRODUCT.md sections complete, it auto-runs Phase 2.7 stress-test, asks about design aesthetic (optional), then runs Phase 2.8 interactive React mockup. After confirmation, generates HTML archive + DESIGN.md (if aesthetic chosen).

**If you want to skip the mockup and design aesthetic selection:**
```
skip mockup
```

---

## 4.2 — Refine Existing PRODUCT.md (Situation B)

**When:** You already have a PRODUCT.md and want improvements before starting Phase 3.

**Paste** the Planning Assistant prompt + your current PRODUCT.md in one message.

**What happens:** Planning Assistant recognizes Situation B, offers 3 options:
- Review (stress-test only, no rewrites)
- Add Feature (guided addition of new module/entity/role)
- Confirm ready (move to Phase 3)

Max 3 clarifying questions per turn (3-question limit applies in B only, not A).

---

## 4.3 — Add a Feature via Planning Assistant (NEW)

**When:** You want to add a feature but want the Planning Assistant's spec-writing rigor — more than just typing in Claude Code directly.

**Where:** Return to your Planning Assistant chat (or start new one with the prompt + your current PRODUCT.md).

**Paste:**
```
Situation C — returning to add a feature.

Current PRODUCT.md is attached below.

New feature I want to add: [plain English description]

Help me:
1. Identify which existing sections this feature affects (Modules, Data Entities,
   Roles/Permissions, Integrations, Mobile, etc.)
2. Ask up to 3 clarifying questions (max per your Situation C/B rules)
3. After my answers: output the full updated PRODUCT.md with the new feature
   integrated into all relevant sections
4. Run Phase 2.7 stress-test on the updated spec
5. Offer Phase 2.8 interactive mockup of the new screens if the feature adds screens
   (or say "skip mockup" to bypass)

[paste current PRODUCT.md]
```

**Then after getting the updated PRODUCT.md:**
- Copy it to your project's `docs/PRODUCT.md` (replacing existing)
- In Claude Code: `Feature Update`
- The framework takes over from there — branch, build, review, merge.

---

## 4.4 — Spec Evolution Review (NEW — before major version bump)

**When:** Your project has shipped many Feature Updates and PRODUCT.md has accumulated organic growth. Before a major version bump (e.g. moving from MVP to V1.0), audit for coherence.

**Where:** Planning Assistant chat.

**Paste:**
```
Spec Evolution Review

Attached is our current PRODUCT.md after [N] Feature Updates over [timeframe].
Also attached: the original PRODUCT.md from project inception.

Help me audit spec evolution:

1. CONSISTENCY CHECK — run full Phase 2.7 stress-test on current PRODUCT.md.
   Report any gaps, ambiguities, or internal contradictions.

2. DRIFT ANALYSIS — compare current vs original:
   - What was added (new modules, entities, flows)
   - What was changed (redefined scope, modified behavior)
   - What was deprecated but never explicitly removed (ghost features)

3. SIMPLIFICATION OPPORTUNITIES — identify:
   - Sections that grew to 3x size and could be subdivided into submodules
   - Permissions that became too granular (consolidate)
   - Data entities with many fields that could be split

4. PRE-V1.0 READINESS — what's missing for this to be a production V1.0:
   - Audit log requirements complete?
   - Rate limiting declared for all public endpoints?
   - GDPR/compliance section exhaustive?
   - Out of Scope exclusions explicit?

Output the audit as a REPORT — do not rewrite PRODUCT.md yet.
```

**What happens:** Planning Assistant does strategic review (not line-by-line editing). Gives you a clear picture of spec health before making large changes.

---

## 4.5 — Generate Onboarding Docs from PRODUCT.md (NEW)

**When:** You're hiring or onboarding someone new who needs to understand the product. PRODUCT.md is technical; you need a human-friendly brief.

**Where:** Planning Assistant chat.

**Paste:**
```
Onboarding Docs Generation

Attached is our PRODUCT.md. Generate three human-readable docs from it:

1. ONE_PAGE_BRIEF.md (for non-technical stakeholders):
   - What problem does this app solve? (from Problem Statement)
   - Who uses it? (from Roles + Core User Flows)
   - What modules make up the product? (from Modules section)
   - Current status in plain English (avoid Rule/Phase jargon)

2. TECHNICAL_ONBOARDING.md (for new developer):
   - Tech stack overview (from PRODUCT.md + Spec-Driven defaults)
   - Key architectural decisions (from DECISIONS_LOG.md if available)
   - Local setup order: Bootstrap → Phase 5 → Phase 6
   - Where to find things (governance docs, .cline/, inputs.yml, etc.)

3. DEMO_SCRIPT.md (for sales/demo walkthrough):
   - Primary happy path (one full user flow from start to finish)
   - 3 "wow" features that differentiate this product
   - Sample data to pre-seed for demos

All three docs should be markdown, ~1-2 pages each, plain English, no framework
jargon. Do not include references to Phases, Rules, Scenarios, or Bootstrap Steps.

Output all three to chat. I'll decide which to save to the project.
```

**What happens:** Planning Assistant translates spec-language into business/onboarding language. These become living docs you can maintain alongside PRODUCT.md.

---

## 4.6 — Upgrade Planning Assistant Template Mid-Chat (NEW)

**When:** You're deep into a Planning Assistant chat running an older template version and a newer `Product_md_Planning_Assistant_vXX.md` has been released. You want the running chat to adopt the new template without losing PRODUCT.md progress or starting over.

**Where:** Same running Planning Assistant session (Claude Code or Claude.ai).

**Setup:** Attach the latest `Product_md_Planning_Assistant_vXX.md` to your message.

**Paste (one-liner trigger):**
```
Updated Planning Assistant template incoming — adopt the attached version
and continue where we left off.
```

**What happens:** Planning Assistant treats the attached file as a replacement for its own operating instructions, adopts the new behavior, and continues the conversation using the current PRODUCT.md state. No migration report, no re-interview, no lost context.

**When to use this vs start fresh:**
- Use this when the version bump is incremental (e.g. v30 → v31 additive) and you have significant conversational context you don't want to lose
- Start a fresh chat instead if the version bump is large (skipping multiple versions) or if the Assistant has already started drifting off-track

---

## 4.7 — Save Mockup + Reference in PRODUCT.md (Visual Continuity Workflow — NEW)

**When:** After Phase 2.8 mockup review, you want the visual design decisions to carry forward into Phase 4 scaffold + Phase 7 refinements. Without this workflow, the Phase 2.8 mockup is ephemeral — Claude Code rebuilds from scratch using PRODUCT.md + DESIGN.md (if present) + design system, achieving ~70-85% visual match. This workflow closes that gap.

**Note:** Phase 2.8 now generates a React (.jsx) mockup first for iteration, then an HTML archive after you confirm. The HTML archive is the version you save for Phase 4/7 reference.

**Where:** Planning Assistant session (Claude Code or Claude.ai) (save step) + your project repo (reference step) + Claude Code (refinement step).

### Step A — Save the mockup HTML archive

After Phase 2.8 confirms alignment (you reply "confirmed"), the Planning Assistant generates an HTML archive version.

**Claude Code PA path:** The Planning Assistant writes `docs/MOCKUP.jsx` to the project folder. Preview it live via `npm run dev` (Vite). To save the HTML archive locally, ask the PA to render and save it: `"Save the mockup as docs/mockups/[AppName]-phase-2.8-mockup.html"`.

**Claude.ai PA path:** BEFORE closing the chat:

1. Click the HTML archive artifact's built-in download button to save it locally
2. Rename it meaningfully: `[AppName]-phase-2.8-mockup.html`
   - Examples: `powerbyte-erp-phase-2.8-mockup.html`, `marine-guardian-phase-2.8-mockup.html`

### Step B — Reference it in your project (WSL2 terminal)

```bash
# Create mockups folder in your project
mkdir -p docs/mockups

# Move the downloaded mockup into it
mv ~/Downloads/[AppName]-phase-2.8-mockup.html docs/mockups/
```

Then edit `docs/PRODUCT.md` Section K (Design Identity) and add this reference line:

```
**Visual target:** see `docs/mockups/[AppName]-phase-2.8-mockup.html` — Phase 4
should match this layout direction where practical. Visual refinements happen
in Phase 7 Feature Updates.
```

This is the one exception to "agents own everything" — PRODUCT.md is human-owned (Rule 1), so you add this reference line yourself in one minute.

### Step C — Claude Code runs Phase 4 scaffold (normal workflow)

No changes. Run `Start Phase 4` as usual. Claude Code reads PRODUCT.md and docs/DESIGN.md (if present), sees the mockup reference, and optionally loads the HTML archive during scaffold for visual guidance. If DESIGN.md exists, tokens are applied automatically — giving you a stronger visual match on first pass (~85-95% with DESIGN.md vs ~70-85% without).

### Step D — Refine visual gaps via Phase 7 Feature Updates

For each visual area that doesn't match your mockup, run `Feature Update` with this pattern:

```
Feature Update

Refine [specific area] to match the Phase 2.8 mockup at
docs/mockups/[AppName]-phase-2.8-mockup.html.

Changes needed:
- [specific change 1]
- [specific change 2]
- [specific change 3]

Use shadcn/ui components only. Update packages/ui if needed.
```

**Concrete example (Powerbyte ERP customer list):**

```
Feature Update

Refine the customer list view to match the Phase 2.8 mockup at
docs/mockups/powerbyte-erp-phase-2.8-mockup.html.

Changes needed:
- Replace current table layout with a card grid (3 columns desktop, 1 column mobile)
- Add inline status badges to each card (Active/Inactive/Pending) using shadcn Badge
- Move search bar above the cards, not in the header
- Show primary contact phone in PH format (+63 XXX XXX XXXX)

Use shadcn/ui components only. Update packages/ui if needed.
```

### Why this workflow works

| Benefit | How |
|---|---|
| **Mockup survives past Phase 2.8** | HTML archive committed to repo (or kept locally — your call) |
| **DESIGN.md tokens applied automatically** | If you picked a design aesthetic, Claude Code reads docs/DESIGN.md during Phase 4 UI parts |
| **Claude Code has a concrete visual target** | Can read the HTML archive during Phase 4 and Phase 7 |
| **You can open the mockup anytime** | HTML archive renders in any browser — Tailwind CDN + Inter CDN + HSL tokens, no build step |
| **Framework stays simple** | Zero new rules, phases, or bootstrap steps needed |
| **Honors Planning/Build split** | Specs + visual target + design tokens up front; iterative refinement via Feature Updates |

### Tradeoffs to know

- The mockup HTML is a **directional target**, not a pixel-perfect spec. Exact spacing, micro-layouts, and component choices may differ and that's fine — the spec intent is what matters
- If the mockup reflects stale design thinking after many Feature Updates, regenerate or retire it. It's a living reference, not a contract
- Consider adding `docs/mockups/` to `.gitignore` if you don't want design artifacts in version control, OR commit them as historical record. Both are valid — just be intentional

### When to skip this workflow

- Apps with < 2 screens (Phase 2.8 auto-skips for these anyway)
- Apps where visual design isn't user-facing (internal admin tools, API-only services)
- When you're confident PRODUCT.md + shadcn/ui defaults alone will produce the right look

---

## 4.8 — Adopt a DESIGN.md Aesthetic (shadcn/ui theme direction) (NEW)

**When:** You want to tune the visual aesthetic beyond shadcn/ui defaults — choosing a named direction (e.g. "Linear-style", "Stripe-style") that gets expressed entirely as shadcn/ui CSS custom property overrides. Works at initial planning OR later when you decide to refresh the aesthetic.

**Where:** Planning Assistant session — Claude Code (preferred) or Claude.ai.

**Note:** For new projects, theme direction selection is now built into **Phase 2.8 Step 0**. The Planning Assistant asks you before generating the mockup, and writes shadcn CSS variable overrides to DESIGN.md automatically in Step 7b after you confirm. Use prompt 4.8 only when you want to **add or change** the theme direction for an existing project — or when Phase 2.8 was skipped.

**What it does:** Derives **4 specific sections** for the chosen theme direction (Visual Theme + Color Palette as shadcn CSS variables + Typography + Layout Principles), creates `docs/DESIGN.md` in your project as the authoritative visual reference, adds a one-line pointer in PRODUCT.md Section 10, and records the decision in DECISIONS_LOG.md. Implementation stays 100% shadcn/ui — this is CSS variable overrides only; no external design catalog is used.

### 4.8.1 — Choose a theme direction

shadcn/ui is the only UI system. The "design name" below is a shorthand for a visual direction — the Planning Assistant derives the CSS variable values itself; no external catalog or URL is required.

**Curated shortlist for enterprise SaaS (Bonito's context):**

| Direction | Vibe | Best for |
|---|---|---|
| **Linear** | Ultra-minimal, purple accent, precise | Project management, ops tools, ERP dashboards |
| **Stripe** | Purple gradients, weight-300 elegance | Finance, payments, billing interfaces |
| **Vercel** | Black/white precision, Geist font | Developer tools, documentation-heavy apps |
| **Supabase** | Dark emerald, code-first | Admin panels, data tools, backend interfaces |
| **Notion** | Warm minimalism, serif headings, soft surfaces | Content-heavy apps, internal knowledge bases |
| **Sentry** | Dark dashboard, data-dense, pink-purple | Monitoring, analytics, log-heavy interfaces |
| **Claude** | Warm terracotta, editorial clean | Trust-signal apps (health, finance, professional services) |

**Skip for business apps:** Ferrari, Lamborghini, Bugatti, Nike, WIRED, Pinterest, PlayStation, SpaceX, The Verge — aesthetically strong but mismatched with enterprise SaaS domain.

### 4.8.2 — Run the prompt in Planning Assistant

```
Adopt a DESIGN.md Aesthetic

I want to set a shadcn/ui theme direction for this project.

CHOSEN DIRECTION: [e.g. "Linear" or "Stripe" or "Claude"]

Execute this sequence:

1. Derive shadcn/ui CSS custom property values for the chosen direction.
   Do NOT fetch any external URL or catalog. Generate the values yourself
   based on the well-known visual identity of the named direction:
   a. Visual Theme & Atmosphere (2-3 sentence description)
   b. Color Palette as shadcn CSS variables (HSL format — background, foreground,
      primary, secondary, muted, accent, destructive, border, card, ring, radius)
   c. Typography Rules (font family, weights, base size, line-height, heading scale)
   d. Layout Principles (spacing unit, border-radius, sidebar width, content max-w,
      card padding)

2. Update docs/PRODUCT.md Section 10 (Non-functional Requirements) to add
   ONE short line:
   "10.X — Design system: shadcn/ui — see docs/DESIGN.md ([CHOSEN DIRECTION]
   theme direction). Implementation uses shadcn/ui CSS variable overrides."
   Do NOT embed the 4 full sections into PRODUCT.md — keep PRODUCT.md lean.

3. Record this decision in docs/DECISIONS_LOG.md:
   - Decision date: [today]
   - Decision: "Adopt [DIRECTION NAME] shadcn/ui theme direction (color + typography +
     layout + theme CSS variable overrides)"
   - Rationale: [brief — why I chose it]
   - Reversible: YES (can be swapped by re-running prompt 4.8 with a
     different direction)

4. Create docs/DESIGN.md as the authoritative visual reference.
   Contents:
   - Header: "Design Identity for [PROJECT NAME] — [CHOSEN DIRECTION] shadcn/ui
     theme direction. Implementation uses shadcn/ui CSS variable overrides."
   - Date adopted
   - Derived sections a, b, c, d in DESIGN.md format
   - Footer: "shadcn/ui Translation Guide — see scenarios.md Scenario 33
     for how Claude Code maps these tokens into globals.css + layout.tsx
     + Tailwind config."

5. Show diffs for BOTH files (PRODUCT.md section + new docs/DESIGN.md
   + DECISIONS_LOG.md entry) before any write. Wait for my confirmation.

DO NOT regenerate other PRODUCT.md sections. DO NOT modify inputs.yml,
.env files, or code. This is a spec/decision update only.
```

### 4.8.3 — After Planning Assistant writes the files

1. Copy the updated `docs/PRODUCT.md` into your project
2. Copy the new `docs/DESIGN.md` into your project
3. Copy the DECISIONS_LOG.md entry into your project's `docs/DECISIONS_LOG.md`
4. Next Feature Update that touches UI will automatically pick up the new aesthetic via Claude Code reading `docs/DESIGN.md` per **Scenario 33**

### 4.8.4 — Re-skin later (swap to a different direction)

Re-run 4.8 with a different `CHOSEN DIRECTION`. Planning Assistant will regenerate `docs/DESIGN.md` with the new CSS variable values, update the PRODUCT.md reference, and append a new entry to DECISIONS_LOG.md (the old decision stays for history).

**After regeneration, run this Feature Update in Claude Code:**

```
Feature Update

docs/DESIGN.md has been updated with a new shadcn/ui theme direction per
DECISIONS_LOG entry [DATE]. Re-apply the CSS variable overrides across the codebase:
- Update apps/[web]/src/app/globals.css with the new CSS variables (HSL format)
- Update apps/[web]/src/app/layout.tsx with the new font imports
- Update tailwind.config.ts if spacing/radius changed
- Run visual QA: verify all pages render with new tokens
- Do NOT replace any shadcn/ui component — only update the CSS variable values

Governance updates per standard Phase 7.
```

### Why this integrates cleanly with V31

| Concern | How it's handled |
|---|---|
| **Two sources of truth?** | No — `docs/DESIGN.md` holds content, PRODUCT.md has a one-liner pointer |
| **Conflicts with Rule 21 design-system/MASTER.md?** | No — Scenario 33 defines precedence: PRODUCT > DESIGN.md > design-system/MASTER.md > shadcn defaults |
| **Conflicts with UI Component Rules?** | No — components STAY shadcn/ui. DESIGN.md only changes CSS variables, fonts, spacing — never component code |
| **External catalog dependency?** | None — the Planning Assistant derives all values itself from the named direction. No external URL or license required. |
| **WCAG contrast failures?** | Scenario 33 conflict resolution mandates AA minimum — agents adjust values if needed, log the adjustment |

### Related prompts

- **Scenario 33** (scenarios.md) — how Claude Code actually uses `docs/DESIGN.md` during Phase 4/7
- **4.7** — Save Mockup workflow (can coexist with 4.8: mockup = specific page layouts, DESIGN.md = global aesthetic tokens)
- **Rule 21** (Master Prompt) — design-system/MASTER.md is still generated by Phase 2.6; DESIGN.md sits alongside, not replacing

---

## 4.9 — New Planning Assistant: PRODUCT.md Done, Project Not Built Yet (NEW)

**Type:** Composition (short — references 4.6)

**When:** You finished the Planning Assistant interview, PRODUCT.md is written, but you haven't run Phase 3 Bootstrap yet. A new Planning Assistant version arrives (e.g. adds Step 8b Mobile strategy classification). You want to update PRODUCT.md to include any new sections/fields from the new version BEFORE Bootstrap locks architecture.

**Where:** Planning Assistant session (Claude Code or Claude.ai) (same session you wrote PRODUCT.md in) → then your project root.

### 4.9.1 — Swap the Planning Assistant template

Run **4.6 — Upgrade Planning Assistant Template Mid-Chat** in your running Planning Assistant chat. Attach the new `Product_md_Planning_Assistant_vXX.md` and paste:

```
Updated Planning Assistant template incoming — adopt the attached version and continue where we left off.
```

### 4.9.2 — Audit current PRODUCT.md against new template

After Planning Assistant acknowledges the template swap, paste this in the same chat:

```
Now audit my current PRODUCT.md against the new template you just adopted.
Identify any sections, fields, or content that the new template requires
but my PRODUCT.md is missing. For each gap:
- Tell me what's missing
- Ask the minimum questions needed to fill it (max 3 per turn)
- Update PRODUCT.md with the answer

If the new version adds a classification step (like Step 8b Mobile strategy),
run that step now against my existing Modules+Features and present the
table for review.

After all gaps filled, output the updated complete PRODUCT.md.
Do NOT regenerate sections that are still valid — only add/update what's missing.
```

### 4.9.3 — Download and proceed to Bootstrap

1. Download the updated PRODUCT.md from Planning Assistant
2. Save to your project as `docs/PRODUCT.md` (overwriting the previous version)
3. Run **1.1 (Deploy V31)** or **1.3 (Greenfield Setup)** — Bootstrap now uses the complete updated spec

> **Why do this BEFORE Bootstrap?** Once Phase 3 Bootstrap runs, architecture decisions (schema, routing, tenancy) get locked into code. Updating PRODUCT.md after Bootstrap requires re-running Phase 3 or doing Feature Updates — much more friction than fixing the spec now.

---

## 4.10 — New Planning Assistant: Project Mid-Build (Phase 3+ in progress) (NEW)

**Type:** Standalone (complex — novel multi-tool workflow)

**When:** Bootstrap done, Phase 4 scaffold started or in progress, maybe Feature Updates already happening. New Planning Assistant arrives. You have a partial codebase that needs to align with the new PRODUCT.md version.

**Goal:** Align in-progress codebase with the new spec without breaking existing work or losing progress.

**Where:** Planning Assistant session (Claude Code or Claude.ai) (spec update) → WSL2 terminal (file copy + git) → Claude Code (delta analysis + Feature Updates).

### 4.10.A — Update PRODUCT.md (Claude.ai)

In your Planning Assistant chat:
1. Run **4.6** to swap the template (attach new file + paste the one-liner)
2. Run **4.9.2** audit prompt to fill gaps
3. Download updated PRODUCT.md

### 4.10.B — Copy new PRODUCT.md to project (WSL2 terminal)

```bash
cp ~/Downloads/PRODUCT.md docs/PRODUCT.md
git add docs/PRODUCT.md
git commit -m "chore: update PRODUCT.md — adopt Planning Assistant v[XX] additions"
```

### 4.10.C — Run delta analysis in Claude Code

```
PRODUCT.md Delta Analysis (mid-build)

I just updated docs/PRODUCT.md to adopt new sections from Planning Assistant
v[XX]. The codebase is currently at Phase [your current phase]. Analyze what
needs to change:

1. Read the git diff of docs/PRODUCT.md (compare HEAD vs HEAD~1)
2. Identify which new fields/sections affect code that's ALREADY written:
   - If new Mobile Needs per-page table was added → which existing pages
     need Mobile First vs Mobile Ready breakpoint adjustments?
   - If new Integrations added → which tRPC routers / components need updates?
   - If new Non-functional Requirements added → which security/perf patterns
     need adjustment?
   - If new PRODUCT.md section added → what code (if any) implements it?
3. Identify what's SAFE TO DEFER:
   - Pure documentation changes (DECISIONS_LOG, CHANGELOG_AI entries)
   - Sections that only affect code not yet scaffolded (e.g. a module in
     Phase 4 Part 7 when we're currently on Part 4)

CRITICAL: Do NOT modify any file yet. Produce a prioritized delta report:

🔴 BLOCKING — must fix before next Phase 4 Part or Feature Update
🟡 DEFERRABLE — can address in upcoming Feature Updates, not blocking
🟢 NO-OP — documentation only, no code impact

For each 🔴 and 🟡 item, suggest the specific Feature Update prompt wording
I would paste to address it.

Wait for my approval before any code change.
```

### 4.10.D — Execute Feature Updates per the delta report

For each 🔴 item flagged:
- Create a feature branch (`git checkout -b feat/adopt-[section-name]`)
- Run the Phase 7 Feature Update in Claude Code using the wording the analysis suggested
- Standard Phase 7 governance applies (CHANGELOG_AI, agent-log, lessons if tricky)
- Squash-merge back to main

Skip 🟡 items for now if you're actively mid-Part — address them after current Part completes.

### 4.10.E — Verify alignment (WSL2)

```bash
pnpm tools:check-product-sync
pnpm lint
pnpm typecheck
pnpm test
```

All commands should pass. Running services (dev compose) should still work. If any 🔴 item wasn't fully addressed, the check-product-sync tool will flag it — return to step C with the specific finding.

> **Why this works mid-build:** Feature Updates are the normal mechanism for evolving a Spec-Driven project. Using them to adopt new PRODUCT.md fields treats the new Planning Assistant version as just another spec change — routed through normal Phase 7 governance with branch + changelog + attribution.

---

## 4.11 — New Planning Assistant: Project Done / In Production (NEW)

**Type:** Standalone (complex — production-safe workflow)

**When:** App is deployed to production, has active users, Phase 8 is complete. A new Planning Assistant version arrives. You want to adopt its additions without disrupting production.

**Goal:** Bring production codebase up to the new spec version **safely** — no prod downtime, no data loss, rollback path preserved at every step.

**Where:** WSL2 terminal (backup + deploys) → Planning Assistant session (Claude Code or Claude.ai) (spec update) → Claude Code (delta analysis + tiered Feature Updates).

### 4.11.A — Safety backup first (WSL2)

```bash
git checkout main
git pull origin main
git tag "pre-planning-assistant-v[XX]-adoption-$(date +%Y%m%d)"
git push origin --tags
```

This tag is your rollback anchor. If adoption goes wrong, `git reset --hard pre-planning-assistant-v[XX]-adoption-[date]` restores the working state.

### 4.11.B — Update PRODUCT.md (Claude.ai)

Same as **4.10.A** — run 4.6 template swap, then 4.9.2 audit, then download updated PRODUCT.md.

### 4.11.C — Copy new PRODUCT.md + run delta analysis (same as 4.10.B + 4.10.C)

### 4.11.D — Categorize each 🔴 finding by DEPLOYMENT RISK

**This is the critical difference from 4.10.** In production, you must separate user-visible from internal changes:

| Risk tier | Example | Deployment path |
|---|---|---|
| **LOW** | Add Mobile Needs table to PRODUCT.md only (no code change) | Direct merge to main, no user impact |
| **MEDIUM** | Adjust existing page breakpoints per new Mobile strategy (cosmetic only) | Staging → verify visually → merge to main |
| **HIGH** | Schema changes, auth flow changes, data migration, new security rules | Staging → smoke tests → schedule deploy window → rollback plan ready |

Paste this in Claude Code to categorize:

```
For each 🔴 item in the delta analysis above, categorize by production
deployment risk: LOW / MEDIUM / HIGH per the definitions below:

LOW    = documentation or config only, no user-visible behavior change
MEDIUM = cosmetic or minor UX change, zero schema/auth/data impact
HIGH   = schema migration, auth flow change, data handling change, or
         any change that could affect user data or session validity

Output the categorized list. Recommend a deployment order:
1. All LOW items first (safe batch)
2. Then MEDIUM items (staging verification each)
3. Then HIGH items one-at-a-time with rollback plan documented

Do NOT execute anything. I will approve each tier before proceeding.
```

### 4.11.E — Execute tier by tier

- **LOW tier:** Single `feat/adopt-low-tier` branch, Phase 7 Feature Update, merge to main (auto-deploys to staging), verify no regressions, promote to prod
- **MEDIUM tier:** One branch per change (smaller blast radius), merge to staging one at a time, visual QA each, then promote. Treat like normal Feature Updates.
- **HIGH tier:** One branch per change, full Phase 7 governance + explicit rollback commands documented in the PR description. Deploy to prod one at a time during low-traffic windows.

### 4.11.F — Post-adoption health check (Claude Code)

After all Feature Updates merged and deployed:

```
Post-adoption production health check

docs/PRODUCT.md is now on Planning Assistant v[XX]. The codebase has received
Feature Updates adopting the new spec fields. Verify alignment:

1. Re-run Dimension 4 (Rule Compliance Scan) from prompt 1.4.0
2. Re-run Dimension 6 (Code Quality Indicators) from prompt 1.4.0
3. Check that DECISIONS_LOG has one entry per Feature Update executed
4. Confirm CHANGELOG_AI reflects all adoption changes with agent attribution
5. Verify no TypeScript errors, no failing tests, no open Phase 6.5 items
6. Report PASS/FAIL per dimension

Do NOT modify anything. Report only.
```

If all PASS → production is aligned with the new spec. If any FAIL → address with additional Feature Updates and re-run.

> **The key safety property:** Every step is reversible. `git tag` gives you a rollback anchor. Tiered deployment means failures surface in staging before prod. Post-adoption health check confirms success, not just "we executed the changes."

---

## 4.12 — New Planning Assistant: Backfill Just One New Section (NEW)

**Type:** Composition (short — for targeted single-addition scenarios)

**When:** The new Planning Assistant version adds ONE specific section or step (e.g. only Step 8b Mobile strategy, only a new PRODUCT.md field). You don't want the full 4.9/4.10/4.11 audit workflow — just backfill that one thing with minimal disruption.

> **⚠ If unsure whether you only need one thing, use 4.9 instead for safety.** 4.9 audits the entire PRODUCT.md against the new template and catches everything. 4.12 is narrow and deliberate — you're telling Planning Assistant "I know exactly what's new, just that one thing, skip the rest."

**Where:** Planning Assistant session (Claude Code or Claude.ai) → project root (file copy) → optional Claude Code (if code change needed).

### 4.12.1 — Swap the template

Run **4.6** in Planning Assistant (attach new file + paste one-liner).

### 4.12.2 — Backfill the specific section only

Paste this targeted prompt in the same chat:

```
I only want to backfill ONE specific addition from the new template:
[NAME THE SECTION, e.g. "Step 8b Mobile strategy classification"]

Do NOT audit the whole PRODUCT.md. Do NOT ask about other gaps.
Just:
1. Run the specific new step/section against my current PRODUCT.md
2. Present the output for my review
3. Update ONLY that section/field in PRODUCT.md
4. Output the updated PRODUCT.md with only that section changed

Ignore any other gaps the new template might have introduced — I'll handle
those separately with a full audit later.
```

### 4.12.3 — Apply to project

Download updated PRODUCT.md and commit as a single-purpose change:

```bash
cp ~/Downloads/PRODUCT.md docs/PRODUCT.md
git add docs/PRODUCT.md
git commit -m "docs: backfill [section name] per Planning Assistant v[XX]"
```

### 4.12.4 — If the new section affects code

If the backfilled section requires code changes (e.g. Step 8b Mobile strategy affects responsive breakpoints in existing pages), run Phase 7 Feature Update in Claude Code:

```
Feature Update

Adopt [section name] from updated docs/PRODUCT.md. Apply the implementation
guidance described in that section (e.g. for Mobile strategy: adjust
breakpoint priority per the Mobile Needs per-page table). Standard Phase 7
governance — branch, CHANGELOG_AI, agent-log, tests.

Scope: ONLY the code paths affected by [section name]. Do not touch
unrelated code.
```

If the new section is documentation-only (e.g. just new DECISIONS_LOG entries), no Feature Update needed — the PRODUCT.md commit is the entire change.

---

## 4.13 — Add Automation to Existing Project: n8n / OpenClaw / Hybrid (NEW)

**When to use:** Your project is already mid-build or in production (Phase 3+ started), and you realize a workflow would be better handled by n8n, OpenClaw, or a hybrid of both — but you didn't set up automation during the initial planning interview.

**Where:** Planning Assistant session (Claude Code or Claude.ai) (to update PRODUCT.md) → then Claude Code (for Phase 7 Feature Update wiring).

**Prerequisites:**
- PRODUCT.md exists and is past Phase 3
- The Planning Assistant is loaded in a session (Claude Code or Claude.ai — use 4.6 to swap to the latest template if needed — Rule 11 must be present)

### 4.13.1 — Describe the workflow to the Planning Assistant

In your Planning Assistant chat, describe what you want automated. Be specific about the trigger and the expected outcome:

```
I need to add automation to my project. Here's the workflow:

[Describe the workflow in plain English. Examples:]
- "When an invoice becomes 30 days overdue, send a reminder email to the customer
  and notify the finance team on Slack"
- "Every Monday at 8am, scan all open support tickets, prioritize them by urgency
  using AI judgment, and post a summary to the #support channel"
- "When a new lead is submitted, collect company info from the web, score the lead
  based on our criteria, then route high-score leads to sales and low-score to
  nurture campaign"

Trigger: [what starts the workflow]
Expected outcome: [what should happen at the end]
Frequency: [one-time / on event / scheduled]
```

The Planning Assistant will detect the automation signals (Rule 11) and ask you:
- Whether this fits **n8n** (deterministic), **OpenClaw** (judgment), or **hybrid** (both)
- Whether to handle it in-app or offload to your external automation infrastructure
- Confirm your instance URLs (default: `pbn8n.powerbyte.app` / `primeclaws.com`)

### 4.13.2 — Planning Assistant updates PRODUCT.md

Once you confirm, the Planning Assistant will:
1. Add the workflow to the **Integrations → External Automation** table
2. Add any new env vars to **Infrastructure Notes**
3. Add webhook endpoints to the integration contract
4. Specify fallback behavior if the external service is unreachable
5. Output the complete updated PRODUCT.md with a changes summary at the top

### 4.13.3 — Copy updated PRODUCT.md to project

```bash
cp ~/Downloads/PRODUCT.md docs/PRODUCT.md
git add docs/PRODUCT.md
git commit -m "docs: add [workflow-name] automation via n8n/OpenClaw"
```

### 4.13.4 — Generate handoff doc(s)

**For n8n workflows:** Open a separate Claude Code session and run `/automate` to scaffold the n8n workflow. This produces `n8n-handoff.md` in the project root.

**For OpenClaw agents:** The Planning Assistant helps draft `openclaw-handoff.md` in the same chat. Copy it to the project root:

```bash
# After Planning Assistant outputs the handoff doc content
cat > openclaw-handoff.md << 'EOF'
[paste the handoff doc content here]
EOF
```

**For hybrid workflows:** You'll need both — run `/automate` for the n8n part, and get the Planning Assistant to draft the OpenClaw part.

Both handoff docs are gitignored. They're consumed by Claude Code during the Feature Update.

### 4.13.5 — Wire the app side via Phase 7 Feature Update

In Claude Code, run a standard Feature Update that reads the handoff doc(s):

```
Feature Update

Add automation wiring for [workflow name] per docs/PRODUCT.md Integrations section.

Read the handoff doc(s) in project root:
- n8n-handoff.md (if n8n workflow)
- openclaw-handoff.md (if OpenClaw agent)

Implement:
1. HTTP dispatch client in packages/api/src/lib/automation-client.ts
   (typed client for n8n webhook trigger / OpenClaw task dispatch)
2. Webhook receiver at apps/web/src/app/api/webhooks/[provider]/route.ts
   (signature verification + idempotency key + async result handling)
3. Add env vars to .env.example (placeholders only) and CREDENTIALS.md
4. Add fallback behavior as specified in PRODUCT.md Integrations table

Standard Phase 7 governance — branch, CHANGELOG_AI, agent-log, tests.
Scope: ONLY automation wiring. Do not touch unrelated code.
```

### 4.13.6 — Deploy the n8n workflow / OpenClaw agent

After the app-side wiring is merged:
- **n8n:** Import the workflow JSON to `pbn8n.powerbyte.app` (from your local iteration or the `/automate` output)
- **OpenClaw:** Deploy the agent config to `primeclaws.com` via the VSCode extension or dashboard
- **Test end-to-end** in staging before production

### 4.13.7 — Adding more workflows later

Repeat 4.13.1–4.13.6 for each additional workflow. The Planning Assistant appends new rows to the Integrations table — it never regenerates existing rows. Each workflow gets its own Feature Update branch.

---

## 4.14 — Brownfield PA Adoption: Existing App / Mockup → Reverse-Extract PRODUCT.md (NEW)

**When to use:** You built something *before* adopting the Spec-Driven framework — a working app, a half-finished prototype, or a clickable `.jsx` / `.html` mockup — and now you want to bring it under framework governance. The Planning Assistant has three native modes (A = blank interview, B = paste existing PRODUCT.md, C = resume an old chat) — it has no built-in mode for *"reverse-extract PRODUCT.md from existing artifacts."* This prompt injects that mode into the chat session as **Situation D**.

**Where:** Planning Assistant session (Claude Code or Claude.ai).

**Prerequisites:**
- You have at least one of: source code, repo zip, README, screenshots, mockup file (`.jsx` / `.html`), Figma export, partial spec notes
- Claude.ai access (Pro recommended — artifact bundle can be large) or a Claude Code PA session in the project folder
- A copy of `Planning_Assistant.md` on hand

### 4.14.1 — Gather the artifacts

Pull together *everything that describes what the app does today*:
- `Planning_Assistant.md` (required, uploaded as the first attachment)
- Repo zip **or** the high-signal files: `README.md`, `package.json`, route map, Prisma schema, env example, key components
- Screenshots of the running app (one per main screen)
- Mockup file(s) — `.jsx`, `.html`, exported PNG / PDF
- Any partial spec, BRD, or hand-written notes

If the bundle is too big for one message, upload PA first and the artifacts in a second message — but keep them in the *same chat*.

### 4.14.2 — Open the Planning Assistant in reverse-extraction mode

In a fresh Claude.ai chat (or a Claude Code PA session in the project folder):
1. Name the chat/session `[AppName] — PRODUCT.md Reverse-Extract (Brownfield)`
2. Attach (Claude.ai) or place in the project folder (Claude Code) `Planning_Assistant.md` + every artifact from 4.14.1
3. Paste the kickoff prompt below as the message body

```
I'm loading you (the Planning Assistant) in REVERSE-EXTRACTION mode.

CONTEXT
=======
I have an existing [app / working prototype / clickable mockup] that was built
BEFORE the Spec-Driven framework. There is no docs/PRODUCT.md for it yet.
I've uploaded the project artifacts so you can reverse-engineer a PRODUCT.md
that matches what already exists — instead of running a blank Situation A
interview that ignores everything I've already built.

YOUR JOB (deviates from Situations A / B / C — call this SITUATION D)
=====================================================================
1. Read every artifact I uploaded. Build an internal model of what the
   app does today — entities, screens, roles, integrations, infra,
   visual language. Note the apparent tech stack.

2. Map every observation onto your 11 required PRODUCT.md sections:
   App Identity · Problem Statement · Core User Flows · Modules & Features
   · Roles & Permissions · Data Entities · Integrations
   · Deployment Config · Mobile Needs · Non-functional Requirements
   · Out of Scope.

3. For EACH section, give me a 3-column triage table:
   ✅ CONFIRMED  — clearly present in the artifacts, no question needed
   🟡 INFERRED   — your best guess from indirect evidence; needs my OK
   ❓ MISSING    — required by the template, no evidence in artifacts —
                   must ask me

4. Show me the triage tables FIRST. Do NOT write the final PRODUCT.md yet.

5. Then walk me through 🟡 INFERRED and ❓ MISSING rows ONE AT A TIME,
   in plain English, honoring your Rule 7 pacing. For each row I either
   confirm, correct, or fill in.

6. Only after every row is ✅ CONFIRMED:
   - Run Rule 5 (verify spec quality — MANDATORY checklist)
   - Run Phase 2.8 mockup ONLY if I did NOT upload a working UI artifact
     (if I uploaded a mockup or screenshots, the visual checkpoint is
     already satisfied — log that and skip)
   - Output the final, complete docs/PRODUCT.md

7. Honor your normal rules (2, 3, 4, 9, 10, 11) when writing the final file.
   Specifically: the locked tech stack in Rule 4 is what PRODUCT.md targets,
   even if the existing app uses a different stack — the migration from
   existing stack → locked stack is handled later in Claude Code by prompt
   1.5 (Brownfield Adoption). Note any stack mismatch in DECISIONS_LOG
   guidance at the bottom of PRODUCT.md.

BEGIN
=====
List every artifact you can see in this chat, then produce the Section 1
(App Identity) triage table. Wait for my response before continuing.
```

### 4.14.3 — Drive the triage conversation

The PA produces the triage table per section. Your job per row:
- 🟡 INFERRED → say "confirm" or correct it
- ❓ MISSING → fill it in (same plain-English style as a normal Situation A interview, but scoped to gaps only)

**Brownfield gotchas to watch for:**
- The existing app may have implemented multitenancy / auth / RBAC *differently* than the framework's L1-L6 stack — flag those rows for a DECISIONS_LOG entry rather than burying them in PRODUCT.md
- If the existing app's stack differs from the locked stack (Next.js · tRPC · Prisma · Auth.js · PostgreSQL · Valkey · BullMQ · MinIO), PRODUCT.md is still written *against the locked stack*. The actual migration happens later via **prompt 1.5 (Brownfield Adoption)** inside Claude Code.
- Visual artifacts (screenshots, mockup files) usually satisfy Phase 2.8 — explicitly tell PA to skip mockup generation if you uploaded any

### 4.14.4 — Save outputs and route to the right next prompt

Save the final `PRODUCT.md` (and `DESIGN.md` if PA extracted one) from the chat, then pick the right next prompt based on what you have:

```
You have working app code + new PRODUCT.md   → prompt 1.5 (Brownfield Adoption)
You have only a mockup + new PRODUCT.md      → prompt 1.3 (Greenfield Full Setup)
You have partial code mostly mockup-like     → prompt 1.6 (Manual Triage)
Not sure                                     → prompt 1.2 (Universal Analyzer)
```

If PA generated a Phase 2.8 mockup (because you had no working UI to upload), save it per **prompt 4.7 (Mockup Continuity Workflow)** so Phase 4 Part 5 can read its `data-*` tags.

**One-time gotcha:** the Planning Assistant file (`Planning_Assistant.md`) does not currently document Situation D natively — this prompt *injects* the mode into the chat session. If PA ever ships a version that supports brownfield extraction first-class, this prompt becomes a thin wrapper around the native flow.

---

# Quick Command Reference (WSL2 terminal)

```bash
# Services
bash deploy/compose/start.sh dev up -d
bash deploy/compose/start.sh dev down
bash deploy/compose/start.sh dev logs

# Database
pnpm db:migrate
pnpm db:seed
pnpm db:studio

# Validation
pnpm tools:validate-inputs
pnpm tools:check-env
pnpm tools:check-product-sync
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --audit-level=high

# Credentials sync (after filling ⏳ placeholders)
bash scripts/sync-credentials-to-env.sh

# Git (Rule 23 — branch + squash-merge)
git checkout -b feat/[slug]
# ... build ...
git checkout main && git merge --squash feat/[slug] && git commit

# Log a lesson
bash scripts/log-lesson.sh
```

---

# File Ownership Quick Reference

| Owner | Files |
|---|---|
| **Human** | `docs/PRODUCT.md` — the only human-edited file |
| **Agent** | `inputs.yml`, `CHANGELOG_AI.md`, `DECISIONS_LOG.md`, `IMPLEMENTATION_MAP.md`, `project.memory.md`, `apps/`, `packages/`, `deploy/` |
| **Gitignored** | `CLAUDE.md`, `.claude/`, `AI/`, `.clinerules`, `.cline/`, `.specstory/`, `.ai_prompt/`, `CREDENTIALS.md`, `.env.dev/.staging/.prod`, `.code-review-graph/`, `project.memory.md` |
| **Committed template** | `.env.example` — placeholders only |

---

# Decision Tree — Which Scenario Do I Need?

```
"I'm starting fresh or adopting the framework"              → Group 1 (start at 1.1)
"It's a regular work day — build/fix/review features"       → Group 2
"Something broke OR I need to test OR I need to audit"      → Group 3
"I need to refine PRODUCT.md in Claude.ai Planning chat"    → Group 4
"I need to add n8n/OpenClaw automation to an existing app"  → 4.13
"I have an existing app/mockup but no PRODUCT.md yet"       → 4.14
```

---

# What's New in This Edition (Summary)

**V31 already had:**
- 1.1-1.6: Setup flows (Greenfield / V31 Upgrade / Brownfield / Manual Triage)
- 2.1-2.8: Daily workflow (Resume / Feature Update / Phase 8 / SocratiCode / Governance Sync / Log Lesson / Push Image / Context7)
- 3.1-3.11: Fixes, testing, migration flows
- Planning Assistant v31 with Phase 2.8 mockup review

**Added in this update (aligned to V31 final audit):**
- 1.1.5: Re-deploy V31 framework (restore clean state after hand-edits to CLAUDE.md or .ai_prompt/)
- 1.2.5: Credentials Setup Kit — comprehensive guide to gathering GitHub + Docker Hub + SMTP + 3rd-party API credentials BEFORE Phase 3
- 1.2.6: Top Up CREDENTIALS.md — routine ongoing fill (Phase 5 unblock, KYC approval, credential rotation, deferred fills)
- 1.2.7: Add New Credential Section Mid-Project — via Phase 7 governance (new integrations introduced during Feature Updates)
- 1.4.0: Deep Pre-Upgrade Analysis — universal 8-dimension state + gap analyzer with prioritized fix plan (runs before 1.4.2)
- 4.8: Adopt a DESIGN.md Aesthetic — derive shadcn/ui CSS variable overrides (colors + typography + layout + theme) from a named theme direction; shadcn/ui is the only implementation; no external catalog
- 4.9, 4.10, 4.11, 4.12: New Planning Assistant adoption workflow — decision-tree covering 4 project states (spec done pre-build, mid-build, in production, single-section backfill)
- 1.8: Combined Upgrade — framework version + Planning Assistant version pending at once. Enforces correct order (framework FIRST, Planning Assistant SECOND) across all project states
- **Planning Assistant Rule 11**: n8n + OpenClaw automation opt-in — signal detection (n8n for deterministic, OpenClaw for judgment, hybrid for both), ask-once behavior, Step 5 silent check, Step 7 conditional infra, conditional Integrations template. Zero footprint when unused.
- 4.13: Add Automation to Existing Project — n8n / OpenClaw / Hybrid workflow addition mid-build or in production (Planning Assistant updates PRODUCT.md → handoff docs → Phase 7 Feature Update wires the app side)
- 4.14: Brownfield PA Adoption — existing app / mockup → reverse-extract PRODUCT.md (injects **Situation D** into the PA chat for cases where there's already a working app or clickable prototype but no spec yet; produces a 3-column ✅ CONFIRMED / 🟡 INFERRED / ❓ MISSING triage per section before writing the final file)
- **Scenario 33** (scenarios.md): DESIGN.md Integration with shadcn/ui — precedence, mapping rules, conflict resolution, shadcn-only posture, curated shortlist for enterprise SaaS
- **Scenario 34** (scenarios.md): CREDENTIALS.md Format Upgrade (Agent-Proof) — local shell script pattern for credential file format upgrades that agents cannot read into context (count 32 → 34)
- 1.7: Build the code-review-graph — one-time per-project setup after Phase 6
- 2.11: Review Changes Since Last Commit — daily blast-radius delta review
- 2.12: Architecture Map — hub/bridge/community detection for high-level understanding
- 3.11: Future framework upgrade (V32+) — expanded from 3 lines to full safety-first workflow with rollback
- 3.15: Pre-Merge Blast-Radius Check — structured PR review before push
- 3.16: Debug Unknown Issue with Graph Help — symptom-to-root-cause path tracing
- 3.17: Onboard to Unknown Codebase — brownfield/new-hire personalized codebase tour
- 3.18: Rebuild Stale Graph — after large refactor or schema change
- 2.9: Validate Spec Consistency — pre-Feature-Update sanity check
- 2.10: Pause/Resume Mid-Part — safely interrupt Phase 4
- 3.12: Lessons Audit — periodic lessons.md cleanup every 4-6 weeks
- 3.13: Dependency Health Check — weekly pnpm audit with upgrade plan
- 3.14: Rollback Safely — pre-flight rollback plan for dangerous operations
- 4.1-4.5: Planning Assistant prompts (Initial Interview / Refine / Add Feature / Spec Evolution Review / Onboarding Docs)
- 4.6: Upgrade Planning Assistant Template Mid-Chat — one-liner trigger to swap template versions without losing context
- 4.7: Save Mockup + Reference in PRODUCT.md — visual continuity workflow preserving Phase 2.8 mockup for Phase 4 scaffold + Phase 7 refinement
- 4.13: Add Automation to Existing Project — n8n / OpenClaw / Hybrid workflow addition mid-build or in production. Full 7-step flow: describe workflow → Planning Assistant updates PRODUCT.md → generate handoff docs → Phase 7 Feature Update for app-side wiring → deploy external workflow/agent → test end-to-end

**Framework alignment:**
- All references updated to Claude Code V31 primary (Cline deprecated but preserved in `.cline/` folder structure)
- All 16 framework files listed in Starting State
- All 16 Phase 6.5 triage categories referenced in 3.1
- All 98 security checklist items referenced in 3.5
- Planning Assistant: 12 rules (Rule 11 = n8n + OpenClaw automation opt-in; Rule 12 = Compliance gap-reminder)
- Scenario count: 34 (Scenario 33 DESIGN.md + Scenario 34 CREDENTIALS.md Agent-Proof Upgrade)

---

## Appendix A — Framework Deployment Operations (V32)

> Reference for maintainers of Spec-Driven projects. How to upgrade target projects to the latest framework version. Added V32 (2026-05-27).

### One-Time Setup (per development machine)

**1. Symlink `sync-to-project` globally:**
```bash
ln -s /home/me/UbuntuDevFiles/1_COMPANY_DEV/Powerbyte-AIEF/sync-to-project.sh ~/.local/bin/sync-to-project
```
Verify: `which sync-to-project` → `/home/me/.local/bin/sync-to-project`

**2. Install `spec-update` shell function in `~/.zshrc`:**
```bash
# ----- Spec-Driven AI Framework: one-command update per project -----
spec-update() {
  local target="$1"
  if [ -z "$target" ]; then
    echo "Usage: spec-update /path/to/target-project"
    return 1
  fi
  if [ ! -d "$target" ]; then
    echo "ERROR: target directory does not exist: $target" >&2
    return 1
  fi
  (cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Powerbyte-AIEF && git pull) && \
    sync-to-project "$target" && \
    (cd "$target" && bash deploy.sh) && \
    echo "" && \
    echo "✓ Spec-Driven framework updated in $target" && \
    echo "  Next: restart Claude Code in this project (hooks load at session start)."
}
```
Then activate: `source ~/.zshrc` (or open a fresh terminal).

### Per-Project Update Workflow — Three Flavors

Pick one each time you need to update a target project.

**Flavor A — Minimal** (use when your local Powerbyte-AIEF is already up-to-date):
```bash
cd /path/to/target-project
sync-to-project
bash deploy.sh
```

**Flavor B — Explicit `git pull`** (use after working on another machine):
```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Powerbyte-AIEF && git pull
cd /path/to/target-project
sync-to-project
bash deploy.sh
```

**Flavor C — One-shot via `spec-update`** (recommended default — wraps A + git pull):
```bash
cd /path/to/target-project
spec-update .
```

### Rule of Thumb — When to Use `spec-update`

`spec-update <target>` handles three project states symmetrically — no separate first-install script needed. Find the scenario that matches your target, then follow its **What to do after spec-update** line.

---

#### 🔵 Scenario 1 · Upgrade — existing project on an older V31/V32 version

> Target already has `.ai_prompt/` from a previous deploy (`.claude/rules/` is empty in V32.7+). You're moving it forward to the current framework version.

- `git pull` → fetches the latest framework from `origin/main`
- `sync-to-project` → overwrites `<target>/.ai_prompt/*.md` and `<target>/deploy.sh` (backups happen in deploy step, not here)
- `bash deploy.sh` → re-fans out to `.ai_prompt/`, backing up user-modified detail files with timestamped `.bak`

**What to do after spec-update:** **restart Claude Code in the target** (`cd <target> && claude`) so the new rules load. Then continue from whatever Phase you were on. **Skip prompt 1.4.2** — it's a V30→V31 reconciliation prompt and has nothing to check for V31.x or V32.x targets. See Scenario 3 below for the patch shortcut.

---

#### 🟢 Scenario 2 · Fresh install — brand-new project from a Planning Assistant handoff

> Target has only `docs/PRODUCT.md`, `docs/DESIGN.md`, `docs/MOCKUP.jsx` from the Planning Assistant session (Claude Code or Claude.ai). No `.ai_prompt/` yet. No framework files of any kind.

- `sync-to-project` detects missing `.ai_prompt/` and prompts: *"Directory does not exist. Create it? [y/N]"*
- Answer **y** → folder created, all 16 V32 reference files copied in, `deploy.sh` dropped at project root
- `deploy.sh` bootstraps `.ai_prompt/`, `AI/`, and `CLAUDE.md` cleanly from zero (`.claude/rules/` is intentionally empty)
- The V32.1.4 deploy script detects the PA artifacts and prints the Bootstrap → Phase 2 → Phase 3 path directly (instead of recommending prompt 1.2)

**What to do after spec-update:** if you haven't yet, `git init` + first commit (the script doesn't do this for you). Then open Claude Code and type `Bootstrap` → `Start Phase 2` → `Start Phase 3` per the V32.1.1 Step 7d sequence. **Skip prompts 1.2 and 1.4.2** — neither applies to fresh PA projects.

```bash
cd ~/new-app                    # has only docs/ from Planning Assistant
spec-update .                   # answer 'y' when prompted to create .ai_prompt/
git init && git add -A && git commit -m "chore: initial framework install"
claude                          # → type 'Bootstrap'
```

---

#### 🟡 Scenario 3 · Patch within V31/V32 — adopting a minor framework patch (e.g. V31.x → V31.y, V31.x → V32.x, V32.x → V32.y)

> Target is already on V31 or V32. You're pulling a behavioral/governance patch — new rule text, dispatch tweaks, deploy script logic. **No new target-project artifacts are introduced** at the V31 line or above.

- `spec-update .` as normal — files swap into `.ai_prompt/` (`.claude/rules/` stays empty)
- That's it. No reconciliation needed in the target source tree.

**What to do after spec-update:** **restart Claude Code** (`cd <target> && claude`) — rules load at session start only; without restart you're still running the OLD rules even though new files are on disk. **Skip prompts 1.2, 1.4.0, and 1.4.2** entirely — they're scoped to greenfield / brownfield / V30→V31 transitions, none of which apply.

> When 1.4.2 IS still required: only when crossing the **V30 → V31 boundary**. Everything inside or above V31 is rules-file-only and restart-only.

---

### Verification (run inside target after deploy)

```bash
grep -c "ZERO OPUS EXECUTION (V32)" .ai_prompt/phases.md   # expect: 5
grep -c "V32" CLAUDE.md                                     # expect: 7
head -1 CLAUDE.md                                           # expect: # SPEC-DRIVEN PLATFORM — V32
```

All three pass → V32 is live on disk.

### Always — After Any Flavor

**Restart Claude Code in the target project.** Hooks load at session start only. Without a restart, you're running the OLD hooks even though new files are on disk.

### Anti-Patterns to Avoid

| Anti-pattern | Why it's wrong | Do instead |
|---|---|---|
| Run `deploy.sh` without `sync-to-project` first when a new framework version exists | Deploys the OLD `.ai_prompt/` staging files into final locations | Always pair sync + deploy |
| Run Flavor A then Flavor C back-to-back | Idempotent but creates duplicate `.bak` files in `.ai_prompt/` | Pick one flavor per update |
| Edit framework files inside a target project's `.ai_prompt/` directly | Changes get overwritten on next sync | Edit in `Powerbyte-AIEF/specdrivenprompt/`, commit, then sync |
| `cp -r specdrivenprompt/* target/.ai_prompt/` blindly | Leaks repo-internal files (`CLAUDE_framework_repo.md`, `ClaudeCodeChanges-*.md`) into target | Use `sync-to-project` — whitelisted, 16 files only |
| Forget to restart Claude Code after deploy | Files updated on disk but hooks still use OLD rules | Always restart after deploy |
| Run `spec-update` without an argument | Function exits with usage error (safety guard) | Always pass target dir or `.` |

### Adding New Development Machines

If you add a new machine (second laptop, fresh WSL2 install):

1. Clone Powerbyte-AIEF: `git clone git@github.com:bonitobonita24/Powerbyte-AIEF.git`
2. Adjust the hard-coded path in the `spec-update` function body (currently `/home/me/UbuntuDevFiles/1_COMPANY_DEV/Powerbyte-AIEF`) to match the new machine's checkout location
3. Symlink `sync-to-project` in that machine's `~/.local/bin/`

### Safety Guarantees (already built into the scripts)

- `sync-to-project` validates source files exist before copying; refuses self-sync onto Powerbyte-AIEF root; whitelist-based (no leakage of internal files)
- `deploy.sh` backs up every overwritten file with a `.bak` suffix; aborts if it would touch NEVER-TOUCH files (PRODUCT.md, DECISIONS_LOG.md, your codebase, `.env*`)
- Both scripts use `set -euo pipefail` and refuse to proceed on validation failures
- `.bak` files are timestamped — easy to roll back: `cp foo.md.20260527_120000.bak foo.md`

---

### Post-Update Rehydration — What to Say to Claude After `spec-update`

> Reference for the most common confusion point: you ran `spec-update .`, files are on disk, but the Claude Code session in the target project still talks like the OLD framework. This is the exact handoff. Added V32.3 — 2026-06-02.

`spec-update .` only puts new files on disk. It does NOT tell the running Claude Code session about them. Hooks load at session start; the running session is still bound to the OLD rules. This subsection covers exactly what to do (and what NOT to do) after the deploy completes.

#### ❌ Don't say "Bootstrap"

**`Bootstrap` = Phase 0 = empty folder only.** Telling Claude `Bootstrap` on an in-progress project would attempt to recreate the folder structure, governance docs, git repo, and MCP wiring from scratch — overwriting your work. `Bootstrap` is the path described in 🟢 Scenario 2 (Fresh install from PA handoff), NOT for mid-build or in-production projects.

#### ✅ The correct post-update flow

1. **Read what the deploy script printed.** V32.1.4 added conditional next-steps output — the script detects PA artifacts (`docs/PRODUCT.md` + (`docs/DESIGN.md` OR `docs/MOCKUP.jsx`)) and prints the right next-step for that project's state. Read the lines after `✓ Spec-Driven framework updated in …`.
2. **Restart Claude Code in the target.** `cd <target> && claude` — CLAUDE.md loads at session start only. Without a restart, the new file sits on disk unread.
3. **Run the right rehydrate prompt in the new session.** Pick from the routing table below.

#### Rehydrate routing table

| Project state | What to run | Why |
|---|---|---|
| Existing project, mid-build, V32.x → latest *(your most common case)* | **Prompt 1.4.0** — Framework Upgrade Rehydration | Re-reads CLAUDE.md + governance, picks up new rules without disturbing Phase progress |
| Deploy script printed "fresh PA detected" routing | Follow 🟢 Scenario 2: `Bootstrap` → `Start Phase 2` → `Start Phase 3` | The project hasn't completed Phase 0 yet — Bootstrap IS correct here |
| Project drifted across many versions (Claude responses visibly confused, mismatched terminology) | **Prompt 1.4.0** first; if Claude still seems off, **Prompt 1.4.2** | 1.4.2 is V30→V31 boundary; only reach for it if 1.4.0 isn't enough |
| Cross-machine pull (you updated on machine A, now opening machine B) | `git pull` (in Powerbyte-AIEF) → `spec-update .` → restart → 1.4.0 | Same as patch flow, preceded by repo sync |

#### Copy-paste phrasing — drop this into the fresh Claude Code session

```text
Framework has been updated to the latest version via `spec-update .`.

Rehydrate context using prompt 1.4.0 (framework upgrade rehydration).
Read CLAUDE.md, .ai_prompt/memory-governance.md, and confirm the
V32.3 Governance Extraction Schema is loaded (memory-governance.md §4).

Report back: active framework version + dispatch rule count
(expect: the version in CLAUDE.md's header, with 9 rules R1-R9) before resuming prior work.
```

This phrasing gives Claude four things at once:
- **Trigger** — framework was updated, with the version label
- **Exact prompt to use** — 1.4.0, no ambiguity
- **Verification gates** — read these specific files, confirm specific schema
- **Return contract** — version + rule count must match before resuming

#### Skip list — never run after a V32.x → V32.y patch

- **Prompt 1.2** — fresh-install bootstrap path (brand-new empty folders only)
- **Prompt 1.4.2** — V30→V31 boundary reconciliation only (in-band V32.x patches don't need it)
- **`Bootstrap` command** — empties + reinitializes the project; destroys in-progress work

#### TL;DR

```bash
spec-update .                  # deploys files into the target
# [read deploy script output]  # tells you which scenario applies
# [restart Claude Code]        # mandatory — rules cached at session start
# In the new session, paste the rehydrate prompt above (or just say "Run prompt 1.4.0, rehydrate to the version shown in CLAUDE.md's header")
```

No `Bootstrap`. No prompt 1.2. No prompt 1.4.2. Just restart + rehydrate.

---

### Chronological Adoption Playbook — Step-by-Step Commands

> Linear command sequence for adopting a framework patch on an existing project. Use this when you want to run the full V32.x → latest update without re-reading the appendix. Added V32.3 — 2026-06-02.

This is the **patch flow** (🟡 Scenario 3) — your most common case. Steps run sequentially.

---

#### Step 1 · Sync framework source repo to latest

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Powerbyte-AIEF
git pull
```

**Expected:** `Already up to date.` OR a fast-forward summary. Latest commit on `main` should match `git log origin/main -1 --oneline` (run it to see the current HEAD).

**Why first:** `spec-update` deploys from your local Powerbyte-AIEF. A stale repo deploys stale files.

---

#### Step 2 · Move into the target project

```bash
cd /path/to/your-app
```

Replace with your actual project path (e.g. `cd ~/Yelli`).

---

#### Step 3 · Run the deploy

```bash
spec-update .
```

**Behind the scenes:**
1. `git pull` in Powerbyte-AIEF (idempotent re-check)
2. `sync-to-project .` — copies 16 framework files to `<target>/.ai_prompt/` + drops `deploy.sh` at project root (whitelist-based)
3. `bash deploy.sh` — fans the 7 detail files into `.ai_prompt/`, writes `AI/Master_Prompt.md`, writes `CLAUDE.md` at root; `.claude/rules/` is intentionally empty (V32.7); backs up modified files with timestamped `.bak`
4. Prints conditional next-steps based on PA artifact detection

---

#### Step 4 · READ the script's printed output

Last 5–10 lines matter. Look for one of these:

| Output line | Meaning |
|---|---|
| `✓ Spec-Driven framework updated in .` + `Next: restart Claude Code in this project` | ✅ Patch deploy successful → Step 5 |
| `Fresh PA detected` + `Bootstrap → Phase 2 → Phase 3` | Project hasn't completed Phase 0 — different path (see 🟢 Scenario 2) |
| `ERROR:` or `ABORT:` prefix | Stop. Read the message. Don't continue until resolved |

---

#### Step 5 · (Optional) Verify the new framework is on disk

```bash
grep -c "ZERO OPUS EXECUTION (V32" .ai_prompt/phases.md              # expect: 5
grep -c "V32" CLAUDE.md                                               # expect: ≥1 (header + body references)
head -1 CLAUDE.md                                                     # expect: # SPEC-DRIVEN PLATFORM — V32
grep -c "Governance Extraction Schema" .ai_prompt/memory-governance.md  # expect: ≥1 (V32.3 marker)
```

All four pass → the latest framework version is live on disk. If any fail → re-run `spec-update .` and re-check Step 4.

---

#### Step 6 · Restart Claude Code

**Most-missed step.** Files on disk ≠ files loaded.

If you have a running session in the target:
1. Exit (`/exit` or Ctrl+D)
2. Re-launch: `claude` (in the target directory)

Rules card (`CLAUDE.md`) is read once at session start. No restart = OLD rules still active.

---

#### Step 7 · Paste the rehydrate prompt as your FIRST message

```text
Framework has been updated to the latest version via `spec-update .`.

Rehydrate context using prompt 1.4.0 (framework upgrade rehydration).
Read CLAUDE.md, .ai_prompt/memory-governance.md, and confirm the
V32.3 Governance Extraction Schema is loaded (memory-governance.md §4).

Report back: active framework version + dispatch rule count
(expect: the version in CLAUDE.md's header, with 9 rules R1-R9) before resuming prior work.
```

---

#### Step 8 · Wait for Claude's verification reply

Claude should respond with:

> *Active framework version (as of this writing): V32.5 — run `git log origin/main -1` for the exact commit. Re-derive the live value from CLAUDE.md's header + `git log origin/main -1`.*
> *Dispatch rule count: 9 (R1-R5 Zero-Opus-Execution + R6-R9 Dispatch Discipline)*
> *Governance Extraction Schema: present in memory-governance.md §4 — confirmed*
> *Ready to resume.*

If those three lines don't match → **stop and re-run Step 7.** Don't proceed to real work until Claude confirms the version + rule count.

---

#### Step 9 · Resume your actual work

You can now say things like:
- `Continue Phase 7 feature: <your feature>`
- `Feature Update: <new spec from PRODUCT.md>`
- `Run prompt 2.x` (whatever was queued)

Claude is now on the latest framework rules — Sonnet 4.6 is dispatched for any file >200 lines per R6 + Governance Extraction Schema.

---

#### Quick reference — the entire flow in one block

```bash
# Step 1 — sync source
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Powerbyte-AIEF && git pull

# Step 2 + 3 — deploy
cd /path/to/your-app
spec-update .

# Step 4 — read deploy script output (look for the ✓ line)
# Step 5 — optional verify
grep -c "ZERO OPUS EXECUTION (V32" .ai_prompt/phases.md   # expect: 5

# Step 6 — restart Claude Code
claude

# Step 7 — paste the rehydrate prompt from A.8 above
# Step 8 — wait for version + rule count confirmation
# Step 9 — resume work
```

---

#### Multiple projects in one session

Loop Steps 2–8 per project. The source repo pull (Step 1) only needs to run once for the whole session.

```bash
# Pull once
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Powerbyte-AIEF && git pull

# Then per project:
cd ~/project-1 && spec-update . && claude   # restart + rehydrate
cd ~/project-2 && spec-update . && claude   # restart + rehydrate
cd ~/project-3 && spec-update . && claude   # restart + rehydrate
```

Each project needs its own restart + rehydrate prompt because each runs a separate Claude Code session.

---

#### Common mistakes to avoid

| ❌ Don't | ✅ Do |
|---|---|
| Say `Bootstrap` to Claude after `spec-update` on a mid-build project | Use Prompt 1.4.0 rehydrate instead |
| Run `bash deploy.sh` without `sync-to-project` first | Always pair sync → deploy (or use `spec-update` which does both) |
| Skip the restart, keep chatting in the old session | Always restart — rules are session-scoped |
| Run prompt 1.2 or 1.4.2 on a V32.x project | Both are out-of-scope for in-band V32 patches |
| Edit files inside `<target>/.ai_prompt/` directly | Edit in `Powerbyte-AIEF/specdrivenprompt/`, commit, re-run `spec-update` |
| Forget to `git pull` Step 1 before deploying | Always pull first — deploys are only as fresh as your local repo |

---

## Appendix B — Designer-Skills Command Reference

> Reference for the `julianoczkowski/designer-skills` supplementary bundle. Added 2026-06-03 as part of Phase A integration; shipped as Phase B in V32.5 (2026-06-04). Status: **framework-prescribed (V32.5)** at Phase 2.8 hand-off, Phase 4 Parts 5-6 (Web UI), and Phase 7 (Feature Update UI-delta) under an **INHERIT-not-REPLACE** contract over PA's `docs/DESIGN.md` + `docs/MOCKUP.jsx` — `/design-tokens` EXPANDS the baseline, `/design-review` audits, `/design-refine` runs only on flagged components. Never regenerates from scratch (Rule 1 preserved).

### What it is

An orchestrated 8-skill design bundle by Julian Oczkowski. The skills encode a deliberate design process so AI agents follow a structured path instead of producing random output. Mobile-first by default, dark mode by default, 8 named aesthetic philosophies. All artifacts are saved to `.design/<feature>/` — additive, never collides with `docs/PRODUCT.md` (Rule 1 still holds).

### How to install

The bundle is **approval-gated**. `/scan-project` surfaces it when the signal fires (frontend stack + Tailwind/CSS-in-JS + no `.design/` folder + no existing tokens + active UI files). If approved, the install command is:

```bash
npx skills add julianoczkowski/designer-skills
```

The Vercel skills CLI prompts interactively for which of the 8 skills to install, which agents to target (Claude Code / Cursor / Codex / etc.), and project vs. global scope. Skills land in `.agents/skills/`; a symlink to `.claude/skills/` is auto-created by `/scan-project` Phase 4 step 3d so Claude Code's harness discovers them.

### The 8 slash commands

| # | Slash command | Purpose | When it fires |
|---|---|---|---|
| 0 | **`/design-flow`** | Orchestrator — runs the full sequence (steps 1-7 below) with confirmation between each step. Start here for the complete process. | At the start of a new feature design, before any UI work. |
| 1 | **`/grill-me`** | Interrogates you about your plan until every design decision is resolved. | First step — before writing any brief. |
| 2 | **`/design-brief`** | Turns the grilling session into a structured design brief. Includes codebase exploration so the AI respects existing patterns, components, and tokens. | After `/grill-me`, before defining IA. |
| 3 | **`/information-architecture`** | Defines the structural skeleton: navigation, content hierarchy, page structure, URL patterns, user flows. | After the design brief is captured. |
| 4 | **`/design-tokens`** | Generates a complete token system (colors, spacing, typography, motion) with light and dark palettes, based on the chosen aesthetic philosophy. Compatible with shadcn/ui + Tailwind CSS variable pattern (Rule 9). | After IA, before frontend implementation. |
| 5 | **`/brief-to-tasks`** | Breaks the design brief into an ordered checklist of independently buildable vertical slices. | Before Phase 7 Feature Update or any UI build session. |
| 6 | **`/frontend-design`** | Builds UI with a named aesthetic philosophy. Mobile-first (375px baseline), dark mode by default. **Distinct from Anthropic's `frontend-design` skill** (this is the designer-skills variant). | During Phase 4 Parts 5-6 (UI build) or Phase 7 (UI-touching feature update). |
| 7 | **`/design-review`** | Structured critique against the brief. Supports code review and screenshot-based review. **Runs on request, not automatically.** Checks dark-mode correctness, mobile-first compliance, token usage. | After UI is built, before commit. |

### Aesthetic philosophies (used by `/frontend-design`)

The 8 named philosophies — pick one explicitly, describe a vibe and let the skill map it, or stay silent and let the skill choose based on context:

1. **Dieter Rams** — Less but better. Functional. No decoration without purpose.
2. **Swiss / International Typographic** — Grid-locked. Strong type hierarchy. Objective.
3. **Japanese Minimalism (Ma)** — Negative space is content. Quiet. Restrained.
4. **Brutalist** — Raw structure visible. Anti-polish. Content-first.
5. **Scandinavian** — Warmth plus restraint. Rounded. Accessible by default.
6. **Art Deco** — Geometric luxury. Bold symmetry. Statement typography.
7. **Neo-Memphis** — Playful chaos. Clashing color. Anti-corporate.
8. **Editorial / Magazine** — Content-led. Display typography. Print-inspired.

### Spec-Driven framework phase mapping (framework-prescribed since V32.5)

| Framework phase | Prescribed designer-skills commands | Why |
|---|---|---|
| **Phase 2.8 → Phase 4 hand-off** | (PA Step 7 emits `docs/DESIGN.md` + `docs/MOCKUP.jsx`) → at Phase 4: `/design-tokens` EXPAND-not-replace | INHERIT-not-REPLACE contract: PA artifacts are the human-verified baseline; `/design-tokens` expands the DESIGN.md table, never regenerates. |
| **Phase 4 Parts 5-6** (UI build) | `/design-review` against MOCKUP.jsx → `/frontend-design` per feature → `/design-refine` on flagged components only | Audit the PA visual baseline against expanded tokens, build with the named aesthetic, refine surgically. |
| **Phase 7** (Feature Update) | `/design-review` of the UI delta → `/design-refine` only if regressions surface | Treat existing DESIGN.md as authoritative; flag drift, fix only what breaks. |

Since V32.5 (2026-06-04), the framework PRESCRIBES these commands via MODEL hooks in `phases.md` (Phase 2.8 hand-off / Phase 4 Parts 5-6 / Phase 7). The contract is **INHERIT-not-REPLACE**: PA's `docs/DESIGN.md` + `docs/MOCKUP.jsx` are the human-verified baseline (Rule 1) — designer-skills sharpen them, never regenerate.

### Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Treating `.design/<feature>/` artifacts as the source of truth | `docs/PRODUCT.md` is still the only file humans edit (Rule 1). `.design/` is working state — derived from PRODUCT.md, never replaces it. |
| Running `/frontend-design` without first running `/design-tokens` | Tokens feed the build. Always tokens → build → review. |
| Confusing Julian's `/frontend-design` with Anthropic's `frontend-design` skill | They coexist in the catalog (`designer-frontend-design` vs `frontend-design`). Both can be installed; the slash command from designer-skills uses its own brief + tokens flow. |
| Skipping `/design-review` because "the code looks fine" | The review checks dark-mode, mobile-first, and token usage — things eye-review misses. |

---

## Appendix C — Session Continuity & Disaster Recovery

> What survives when Claude becomes unresponsive, the internet drops, or you have to force-close a session mid-conversation — and how to make sure curated memory keeps up. Added 2026-06-07.

**Audience:** Anyone running long Claude Code sessions on flaky connections, anyone worried about losing decision history between sessions.

**Goal:** Understand the two memory layers (passive auto-save vs. active curated save), where the disaster-recovery backstop lives, and the habit that closes 95% of the risk window.

### C.1 — What survives automatically (no action needed)

**1. The raw conversation transcript — always saved per turn.**
Claude Code writes every message exchange to a JSONL file under `~/.claude/projects/<project-slug>/<session-id>.jsonl`. This persists *as the conversation happens*, not at session end. Network drop, terminal crash, `kill -9` — the transcript is already on disk. This is your disaster-recovery backstop.

**2. `claude-mem` auto-observations — fire on `PostToolUse`, not just on session close.**
Every time Claude runs a tool (Read, Write, Edit, Bash), the hook fires and writes observations. A session that's 30 minutes deep with 20 tool calls already has ~20 checkpoints persisted. Only the very last unflushed observation could be lost on a crash. The numbered observations you see at the top of each new session prove this works.

**3. `context-mode` auto-indexing — same per-tool-call cadence.**
Command outputs are already indexed in FTS5 by the time the next message lands; 26 categories of session events (decisions, errors, blockers, plans, user prompts, rejected approaches, tool failures, compaction guides) are captured throughout.

### C.2 — What's at risk

**Layer 2 curated memory** (`MEMORY.md` + individual `feedback_*.md` / `project_*.md` / `user_*.md` files) is only written when Claude explicitly calls `Write` in response to **"save session"** or when Claude detects a clear durable fact during conversation. **This is the layer that loses if you can't type "save session" before a forced close.** The passive layer still recorded raw observations, but you lose the human-readable narrative distillation.

### C.3 — Workarounds (ranked by reliability)

**1. Mid-session checkpoint saves (cheapest insurance).**
Don't wait until the end. Say **"checkpoint save"** or **"save session"** at meaningful milestones — after a major decision, after a long investigation concludes, ~30–45 min into any long session, right before you start something risky. Loss window shrinks from *entire session* to *last few minutes*. Treat it like a save in a video game.

**2. Recover from the transcript on next session.**
After a crash, in the new session, say:

> "My last session crashed. Read the most recent JSONL in `~/.claude/projects/<this-project-slug>/` and save anything durable to memory."

Claude can literally open the transcript file, extract decisions / discoveries / feedback from the conversation, and write them to memory. The raw bytes are there — they just weren't distilled.

**3. Trust the passive layer for continuity.**
Even with zero curated saves, the next session's startup context auto-loads recent observations (the big "recent context" block at the top of each new session). You won't be cold-started. You'll lose the *narrative summary* but not the *facts*.

**4. Use shorter, more focused sessions.**
Counterintuitive, but shorter sessions naturally have more "natural" save points (end of session = save). Long marathon sessions are the highest-risk for unsaved curation.

### C.4 — Practical habit to build

> **Every ~30–45 minutes on a meaningful session, say `"checkpoint save"`.**
> That single habit closes 95% of the risk. The other 5% (last few minutes lost) is covered by the JSONL transcript recovery in worst-case scenarios.

### C.5 — Verifying it's working

Anytime you want to see your safety net for a project, run:

```bash
ls -lht ~/.claude/projects/<your-project-slug>/*.jsonl | head -5
```

You'll see the recent session transcript files with timestamps. As long as those exist, your raw conversation is recoverable. The project-slug is derived from the absolute path of the project — replace `/` with `-` and prepend a dash.

### C.6 — The two-layer model at a glance

| Layer | Mechanism | Trigger | Survives hard drop? |
|---|---|---|---|
| **0 — Transcript** | Claude Code `.jsonl` per turn | Automatic, every message | ✅ Yes — already on disk |
| **1 — Auto-observations** | `claude-mem` + `context-mode` hooks | Automatic, every tool call | ✅ Mostly — only last unflushed event lost |
| **2 — Curated memory** | `MEMORY.md` + `*.md` files | Explicit: "save session" / "checkpoint save" | ⚠️ Only if triggered before drop |

**Reference:** Memory layer architecture = `claude-mem` (auto observations) + `context-mode` (FTS5 event index) + `MEMORY.md` per project (curated) + `planning-with-files` (in-session plans). Project-slug format: absolute path with `/` replaced by `-`, prepended with `-` (e.g. `/home/me/UbuntuDevFiles/1_COMPANY_DEV/Powerbyte-AIEF` → `-home-me-UbuntuDevFiles-1-COMPANY-DEV-Powerbyte-AIEF`).

---

*End of Prompt References — Spec-Driven Platform V31 (Updated)*
*Maintained by Bonito — Powerbyte IT Solutions, Lipa City, Philippines*

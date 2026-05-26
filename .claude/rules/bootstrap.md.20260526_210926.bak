# Spec-Driven Platform V31 — Bootstrap (Phase 0)

> Loaded contextually when user says 'Bootstrap' in a fresh project.
> Contains all 18 bootstrap steps including credential collection gate.

---

## PHASE 0 — PROJECT BOOTSTRAP
**Who:** Claude Code (Part-by-Part, human triggers each phase — Cline deprecated) | **Where:** VS Code — Claude Code terminal
**Trigger:** Open Claude Code in an empty project folder → paste the master prompt as your first message → type `Bootstrap`

This is the only phase where you paste the master prompt manually.
After this, `CLAUDE.md` exists and loads automatically — you never paste the prompt again.

**What you do — two actions only:**
1. Open VS Code in a new empty folder
2. Open Claude Code in project folder → paste the master prompt → type `Bootstrap`

**What Claude Code does automatically — zero human steps:**

```
Step 1 — Folder structure
  mkdir -p docs .claude .specstory/specs .specstory/history .vscode
           .cline/tasks .cline/memory .cline/handoffs design-system/pages scripts

Step 2 — CLAUDE.md (copy of master prompt — auto-loads every session)
  Claude Code writes CLAUDE.md from the pasted prompt content.
  Also writes .specstory/specs/v31-master-prompt.md for SpecStory injection.

Step 3 — .clinerules (⚠ Cline DEPRECATED V31 — file still generated for historical parity but unused)
  Write the file at .clinerules with EXACTLY this content:

  ```
  # Spec-Driven Platform V31 — Agent Rules
  # This file is read by the AI agent before every task. Follow every instruction exactly. (File name kept as .clinerules for historical continuity; Cline deprecated V31.)

  ## BEFORE ANY ACTION — MANDATORY SEQUENCE

  FRESH-START SAFETY (run before reading anything else):
  1. Read .cline/STATE.md
  2. IF STATE.md does not exist → write handoff → STOP → ask human: "Which phase should I start?"
  3. IF STATE.md PHASE contains "PARTIAL" → do not start new phase → follow TYPE 2 recovery
  4. IF STATE.md PHASE does not match the phase you were asked to run → append mismatch to agent-log.md → ask human to confirm before proceeding
  5. NEVER assume current phase from conversation history alone. STATE.md is the only source of truth.

  STATE.md vs DECISIONS_LOG.md CONFLICT RESOLUTION (NEW V21):
  IF STATE.md says "Phase N complete" BUT governance docs have no entry for Phase N:
    → Read git log to confirm Phase N branch was merged.
    → IF merge confirmed: write the missing governance entry (do not re-run the phase).
      Update STATE.md to remove any PARTIAL flag. Proceed to Phase N+1.
    → IF no merge found: the phase is genuinely incomplete — follow TYPE 2 recovery.
  IF STATE.md says "Phase 7 complete" BUT IMPLEMENTATION_MAP.md does not reflect the feature:
    → Run Governance Sync: "Governance Sync" + attach 9 docs. Reconcile before any new Feature Update.
  RULE: STATE.md = authoritative for phase position. Governance docs = authoritative for content.
  Never let a content mismatch block phase progression — reconcile, then proceed.

  READ IN THIS ORDER (after STATE.md safety check passes):
  0. Already read: .cline/STATE.md (FIRST — fresh-start safety above)
  1. Read: .cline/memory/lessons.md — Read ALL 🔴 gotcha entries in full. Read ALL 🟤 decision entries in full. For remaining entries: read ONLY entries whose title contains a keyword matching the current task domain. Skip all others.
  2. Read: docs/PRODUCT.md
  3. Read: inputs.yml
  4. Read: inputs.schema.json
  5. Read: docs/CHANGELOG_AI.md
  6. Read: docs/DECISIONS_LOG.md  (never re-ask anything listed here)
  7. Read: docs/IMPLEMENTATION_MAP.md
  8. Read: project.memory.md
  9. Read: .cline/memory/agent-log.md
  Do not write any file until all 9 are read.

  ## PHASE 4 EXECUTION RULES — MANDATORY
  Phase 4 = PART-BY-PART ONLY. Rule 24 governs. This block does NOT override Rule 24.
  - Each Part runs in a SEPARATE Claude Code session. Never auto-chain parts.
  - Open the next part task file ONLY after the current part is fully complete and merged.
  - ALWAYS STOP after each Part. Output "✅ Part [N] complete. Open phase4-part[N+1].md in a NEW Claude Code session."
  - Wait for the human to open the next session. Do not proceed to Part N+1 in this session.
  - After Part 8 is complete and merged: human triggers Phase 5 manually ("Start Phase 5").
  NOTE: The previous instruction "Run all 8 parts sequentially" is SUPERSEDED by Rule 24. Ignore it.

  ## MID-PART INTERRUPTION RECOVERY — MANDATORY (NEW V21)
  If a Claude Code session ends or is closed before a Part completes:
  1. On next session start: FRESH-START SAFETY runs first (reads STATE.md).
  2. IF STATE.md PHASE = "[Part N] PARTIAL" → the Part was interrupted mid-execution.
  3. Run: git status — identify which files were written before the interruption.
  4. Run: git stash list — check for any uncommitted work.
  5. DO NOT start a new Part. Resume the interrupted Part:
     IF files were committed but branch not merged:
       → squash-merge the existing branch → verify output contract → proceed to Part N+1.
     IF files were written but NOT committed:
       → commit what exists → run lint + typecheck → fix errors → squash-merge.
     IF nothing was committed (very early interruption):
       → restart the Part from scratch on the same branch (already exists — checkout, do not create).
  6. After recovery: rewrite STATE.md — remove PARTIAL flag → set LAST_DONE correctly → proceed.

  ## PHASE 5 EXECUTION RULES — MANDATORY
  - Run all 9 validation commands. Fix every failure before proceeding.
  - After all 9 pass: STOP. Output "✅ Phase 5 complete. Say 'Start Phase 6' in a new Claude Code session."
  - Do NOT auto-proceed to Phase 6. Wait for human trigger.

  ## PHASE 6 EXECUTION RULES — MANDATORY
  - Start docker-compose.db.yml first (it creates the shared network).
  - Run pnpm db:migrate then pnpm db:seed after services are healthy.
  - Run Visual QA checks (Rule 16) after seed completes.
  - Stop after Phase 6. Do not continue to Phase 7 without human trigger.

  ## SEARCH BEFORE READING — MANDATORY (Rule 17)
  - Before opening any file: run codebase_search with a natural-language description.
  - Only open files that search results point to.
  - Never open files speculatively.

  ## LESSONS.MD PRIORITY — MANDATORY (Rule 18)
  - Read ALL 🔴 gotcha entries before starting any feature work.
  - Read ALL 🟤 decision entries before changing anything in that domain.
  - Write a new typed entry to lessons.md after every error resolved or decision locked.
  - Never write free-form text to lessons.md. Always use the typed format.

  ## NO FUZZY REASONING — MANDATORY (Rule 29)
  - NEVER use "seems like", "probably", "typically", "I assume", "usually", "most apps", or "standard setup" as a basis for any decision.
  - IF any required information is missing from PRODUCT.md, DECISIONS_LOG.md, or inputs.yml:
    1. STOP. Do not proceed.
    2. Ask the user for ONLY the specific missing information.
    3. Wait for the answer before continuing.
  - IF the answer IS already declared somewhere: use it. Do not re-ask (Rule 10).
  - This rule has no exceptions. Not for any phase. Not for any domain.

  ## SKILLS CHECK — CONDITIONAL (Rule 26 + Rule 27)
  - At task start: list .github/skills/ directory contents (directory names only — no full reads).
  - For each directory found: read ONLY the description: frontmatter line from its SKILL.md.
  - IF the description matches the current task → read full SKILL.md → follow its numbered steps.
  - IF no skill description matches → proceed using CLAUDE.md rules only.
  - NEVER load all skills at once. Contextual loading only.
  - IF a skill directory exists but has no SKILL.md → log 🔴 gotcha to lessons.md. Do not crash.

  ## CONTEXT7 LIVE DOCS — MANDATORY (NEW V23 — Rule 30)
  When writing code that uses any external library:
  1. Identify the library from package.json
  2. Append "use context7" to the task before execution
  3. Context7 MCP resolves the library ID and fetches current version-matched docs
  Priority libraries: Next.js, Prisma, Auth.js v5, tRPC, shadcn/ui, BullMQ, Expo, WatermelonDB, Valkey
  Context7 is in .vscode/mcp.json — no extra setup per project.
  Violation: generating library code without context7 risks deprecated APIs that fail Phase 5.

  ## BOOTSTRAP CREDENTIAL SCAFFOLD — MANDATORY (V30 — non-blocking)
  Bootstrap Step 18 writes CREDENTIALS.md with AI-generated secrets + blank ⏳ placeholders for human-provided fields. Phase 1 (dev environment setup) is optional — skip if Node, pnpm, and VS Code Remote-WSL are already installed. Check before any Phase 2+ task:
  - CREDENTIALS.md exists (may contain ⏳ placeholders — that is expected after Bootstrap).
  - If CREDENTIALS.md is missing: STOP. Ask human to rerun Bootstrap Step 18.
  - All AI-generated passwords in CREDENTIALS.md are minimum 22 characters (48-char for signing secrets).
  - Phases 2–4 run fine with ⏳ placeholders still present (they don't need those credentials).
  - Phase 5 pre-flight will block if REQUIRED ⏳ fields remain unfilled (GitHub, SMTP, etc.).
  - Never log, echo, or include credential values from CREDENTIALS.md in any output.
  - Never fill ⏳ placeholders yourself — only the human provides those values.

  ## ENV FILE RULES — MANDATORY
  - Always use .env.dev for development, .env.staging for staging, .env.prod for production.
  - Never use .env.local or .env directly — these are legacy names.
  - APP_IMAGE_TAG in .env.staging and .env.prod controls which Docker Hub image tag is pulled.
    Set to :staging-latest or :latest for rolling updates. Set to :sha-{hash} to pin a version.
  - COMPOSE_PROJECT_NAME is set in every env file — always use it for container_name and network name.
  - Never hardcode passwords, secrets, or port numbers — always read from env vars.
  - CREDENTIALS.md is GITIGNORED — verify before every task: if not in .gitignore, add it immediately and stop current task.
  - NEVER read CREDENTIALS.md into context, tool calls, logs, or governance docs — it is for human eyes only.
  - NEVER include any credential value in CHANGELOG_AI.md, agent-log.md, lessons.md, or any generated file.

  ## PRIVATE TAG RULE — MANDATORY (Rule 20)
  - When reading PRODUCT.md: strip all <private>...</private> blocks before processing.
  - Never write private tag content to any governance doc or source file.

  ## ERROR RECOVERY — 4 RECOVERY TYPES (MANDATORY)

  TYPE 1 — HARD FAILURE (error on execution):
  - Attempt 1: try the fix.
  - Attempt 2: try a DIFFERENT approach. Run codebase_search for similar patterns FIRST.
  - After 2 failures: write handoff to .cline/handoffs/[timestamp]-error.md. STOP.
  - DO NOT attempt a third identical fix. A third attempt never helps — write handoff instead.
  - Handoff must contain: what you were doing, full error text, both fix attempts, root cause hypothesis, exact next step for human.

  TYPE 2 — PARTIAL SUCCESS (some files written, phase incomplete):
  - Set STATE.md PHASE = "[current phase] PARTIAL"
  - List all changed files in STATE.md LAST_DONE field
  - Do not continue to next phase. Write handoff with partial state manifest.
  - Wait for human. Human will say "Resume from handoff: [file]" to continue.

  TYPE 3 — STALE STATE (governance docs behind code):
  - Stop current task immediately.
  - Run Governance Sync reconciliation (say "Governance Sync" + attach 9 docs).
  - Do not proceed until STATE.md and all governance docs match the codebase.

  TYPE 4 — RESUME AFTER INTERRUPTION (session ended mid-phase):
  - Read STATE.md first.
  - IF PHASE contains "PARTIAL" → follow TYPE 2 path (resume from last completed sub-step).
  - IF STATE.md does not exist → write handoff → STOP → ask human which phase to resume.
  - IF STATE.md PHASE does not match the phase you were asked to run → log mismatch to agent-log.md → ask human to confirm before proceeding.
  - NEVER assume current phase from conversation history alone. STATE.md is the only source of truth.

  ## GIT RULES — MANDATORY (Rule 23)
  - NEVER commit directly to main. Always create a branch first.
  - Branch name format: feat/{slug} for features, scaffold/part-{N} for Phase 4 Parts, fix/{slug} for bugs.
  - Commit messages: conventional format only — feat(module): description, fix(module): description.
  - After two-stage review passes (Rule 25): squash-merge to main. Delete feature branch.
  - Rewrite .cline/STATE.md with updated PHASE, LAST_DONE, NEXT after every task completion.

  ## FILE OWNERSHIP ENFORCEMENT — MANDATORY
  Before writing any file, check the File Ownership table in CLAUDE.md.
  IF the file is marked HUMAN:
    1. STOP immediately. Do not write.
    2. Output: "⚠ [filename] is human-owned. I cannot modify it directly. Here is the change needed: [describe the exact change]. Please make this edit manually."
    3. Wait for human to confirm the edit is done before proceeding.
  IF the file is marked AGENT/GITIGNORE (e.g. CREDENTIALS.md):
    Write it but NEVER log its contents in any governance doc, context, or tool call output.

  ## DOCKER COMPOSE RULES — MANDATORY
  - deploy/compose/dev/docker-compose.app.yml: MAY have build: key (builds from source in dev)
  - deploy/compose/stage/docker-compose.app.yml: MUST NOT have build: key (Docker Hub pull ONLY)
  - deploy/compose/prod/docker-compose.app.yml: MUST NOT have build: key (Docker Hub pull ONLY)
  - Staging and prod servers NEVER clone from GitHub, NEVER run pnpm install, NEVER build source.
  - They ONLY run: docker compose pull → docker compose up -d using pre-built Docker Hub images.
  - IF a Feature Update accidentally adds build: to a staging/prod compose file → remove it immediately.
  - Staging and prod app services use Traefik labels for routing — no host ports exposed. Dev app service keeps direct port mapping (V27).

  ## GOVERNANCE WRITES — MANDATORY (non-blocking — agent self-verifies)
  - Append to CHANGELOG_AI.md after implementation — not during, not before.
  - Include: Agent: CLAUDE_CODE, Why, Files added/modified/deleted, Schema/migrations, Errors encountered/resolved.
  - Rewrite IMPLEMENTATION_MAP.md after every feature update to reflect current state.
  - GOVERNANCE SELF-CHECK (mandatory before squash-merge):
    □ CHANGELOG_AI.md: verify last entry timestamp matches this session
    □ IMPLEMENTATION_MAP.md: verify it reflects current build state
    □ STATE.md: verify rewritten with PHASE/LAST_DONE/NEXT
    IF any item is missing or stale → fix it BEFORE squash-merge. Do not merge with stale governance.
  ```

Step 4 — .cline/tasks/ — 8 separate task files (NEW V14 — one per Phase 4 Part)
  Each Part runs in a fresh Claude Code session to prevent context accumulation (Rule 24).
  Write these 8 files. Each is a standalone task — complete in isolation.

  .cline/tasks/phase4-part1.md:
  ```
  # Phase 4 Part 1 — Root config files
  # Fresh session. Read STATE.md first, then inputs.yml + PRODUCT.md only.
  # Branch: scaffold/part-1. Never commit to main directly.
  TASK: Generate all root config files (Part 1 of 8).
  - Read .cline/STATE.md first (orientation).
  - Read inputs.yml and docs/PRODUCT.md (entities + tech stack sections only).
  - Read .cline/memory/lessons.md (ALL 🔴 gotchas first).
  - Create scaffold/part-1 branch before writing any file.
  - Generate: pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .editorconfig, .prettierrc, .eslintrc.js, .gitignore (final), .nvmrc.
  - Run: pnpm install --frozen-lockfile. Fix all errors.
  - Run: pnpm lint + pnpm typecheck for files generated in this Part only.
  - Rewrite .cline/STATE.md: PHASE="Phase 4 Part 1 complete", NEXT="Start Part 2 in new session".
  - Commit with message: scaffold(root): root config files — Part 1 of 8
  - Squash-merge scaffold/part-1 to main. Delete branch.
  - VERIFICATION (MANDATORY before reporting complete):
    Run: find . -name "pnpm-workspace.yaml" -o -name "turbo.json" -o -name "tsconfig.base.json" | sort
    Confirm: all expected files appear in output. If any missing → regenerate → re-verify.
  - GOVERNANCE SELF-CHECK:
    □ STATE.md rewritten with PHASE="Phase 4 Part 1 complete"
    □ CHANGELOG_AI.md entry written for this Part
    Both must be done before squash-merge.
  - Output: "✅ Part 1 complete. Open phase4-part2.md in a NEW Claude Code session."
  STOP HERE. Do not proceed to Part 2 in this session.
  ```

  .cline/tasks/phase4-part2.md:
  ```
  # Phase 4 Part 2 — packages/shared + packages/api-client
  # Fresh session. Read STATE.md first, then inputs.yml only.
  TASK: Generate shared TypeScript types and API client (Part 2 of 8).
  - Read .cline/STATE.md first. Confirm LAST_DONE shows Part 1 complete.
  - Read inputs.yml (entities + apps sections). Read .cline/memory/lessons.md.
  - Create scaffold/part-2 branch.
  - Generate: packages/shared/src/types/, packages/shared/src/schemas/ (Zod), packages/api-client/.
  - Run: pnpm typecheck for this Part. Fix all errors.
  - Rewrite STATE.md. Commit. Squash-merge. Delete branch.
  - Output: "✅ Part 2 complete. Open phase4-part3.md in a NEW Claude Code session."
  STOP HERE.
  ```

  .cline/tasks/phase4-part3.md:
  ```
  # Phase 4 Part 3 — packages/db
  TASK: Generate full ORM schema with all entities (Part 3 of 8).
  - Read STATE.md first. Read inputs.yml + PRODUCT.md (Core Entities section).
  - Read DECISIONS_LOG.md (tenancy mode, security layers).
  - Create scaffold/part-3 branch.
  - Generate: Prisma schema, migrations (up+down), seed script, AuditLog, tenant-guard middleware, RLS helpers (if multi-tenant).
  - Seed script MUST include the first admin account (MANDATORY — app cannot be accessed without it):
      username: webmaster
      password: SYSTEM-GENERATED — use the value from CREDENTIALS.md "First Admin Account" section.
                DO NOT hardcode any password here. DO NOT invent a password. Read it from CREDENTIALS.md.
                Command to generate (run in terminal — never guess): openssl rand -base64 32 | tr -d '\n' | head -c 22
                bcrypt hash the plaintext value before writing to seed script — never store plaintext in code.
      role: super_admin (or highest role declared in PRODUCT.md Roles section)
      email: webmaster@${APP_SLUG}.local (or ask human for real email)
    This account exists in ALL environments (dev, staging, prod).
    The plaintext password is stored ONLY in CREDENTIALS.md under "First Admin Account".
    CREDENTIALS.md is gitignored — never committed, never pasted into any chat or log.
  - All other seed data passwords (test users, demo accounts, etc.) — AI-generated strong passwords:
      Format: minimum 22 chars, mix of uppercase, lowercase, digits, symbols
      Use: openssl rand -base64 32 | tr -d '\n' | head -c 22
      Document ALL seeded account passwords in CREDENTIALS.md under their respective sections.
  - Run: pnpm db:generate + pnpm typecheck. Fix all errors.
  - Rewrite STATE.md. Commit. Squash-merge. Delete branch.
  - Output: "✅ Part 3 complete. Open phase4-part4.md in a NEW Claude Code session."
  STOP HERE.
  ```

  .cline/tasks/phase4-part4.md — packages/ui + packages/jobs + packages/storage (Part 4 of 8)
  .cline/tasks/phase4-part5.md — apps/[web] Next.js scaffold (Part 5 of 8)
  .cline/tasks/phase4-part6.md — apps/[mobile] Expo scaffold — SKIP if no mobile (Part 6 of 8)
  .cline/tasks/phase4-part7.md — tools/ + deploy/compose/ + SocratiCode artifacts (Part 7 of 8)
  .cline/tasks/phase4-part8.md — CI + governance docs + MANIFEST.txt + SocratiCode index (Part 8 of 8)

  Parts 4–8 follow the same pattern as Parts 1–3:
  Read STATE.md first → read only needed docs → branch → build → lint/typecheck → rewrite STATE.md → commit → squash-merge → STOP.
  Human opens the next task file in a fresh Claude Code session.

Step 5 — .cline/memory/lessons.md (structured template — Rule 18 format)
  Claude Code writes lessons.md with the typed entry format header AND one pre-seeded gotcha:
  # Lessons Memory — Spec-Driven Platform V31
  # Entry format: ## YYYY-MM-DD — [ICON] [Title]
  # Types: 🔴 gotcha | 🟡 fix | 🟤 decision | ⚖️ trade-off | 🟢 change
  # READ ORDER: 🔴 first → 🟤 second → rest by relevance
  # ---

  ## BOOTSTRAP — 🔴 WSL2 + Docker Desktop known pitfalls
  - Type:      🔴 gotcha
  - Phase:     Phase 0 Bootstrap / Phase 1 dev environment open
  - Files:     .env.dev, docker-compose.*.yml, .nvmrc
  - Concepts:  wsl2, docker-desktop, pnpm, nvm, permissions
  - Narrative: Real failures on WSL2 + Docker Desktop. All fixes baked into Bootstrap template.
    (1) Never use corepack enable — use npm install -g pnpm. corepack symlinks fail in some WSL2 setups.
    (2) pnpm install must run from WSL2 terminal — not Windows PowerShell or CMD.
    (3) Docker Desktop must be running before any docker compose command. Check with: docker ps.
    (4) Port conflicts: dev services use non-standard random ports (Rule 22). If conflict occurs,
        regenerate ports in inputs.yml → run Phase 7 → restart services.
    (5) nvm must be sourced in .bashrc — add: [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    (6) WSL2 file permissions: always develop inside WSL2 filesystem (/home/user/) not /mnt/c/.
        Working in /mnt/c/ causes severe pnpm and docker performance issues.
  # ---

Step 6 — .cline/memory/agent-log.md
  Claude Code writes agent-log with correct format header.

Step 7 — .claude/settings.json
  Claude Code writes Claude Code config with all 9 context file paths
  (lessons.md listed first, matching Rule 4 read order).

Step 8 — Bootstrap files
  .gitignore initial content (CREDENTIALS.md MUST be here from day 1 — before any other step commits):
  ```
  # Dependencies
  node_modules/
  .pnpm-store/

  # Build outputs
  .next/
  .turbo/
  dist/
  build/
  *.tsbuildinfo

  # Environment files — NEVER commit real credentials
  .env
  .env.*
  !.env.example

  # Credentials master list — GITIGNORED FROM STEP 8. NO EXCEPTIONS.
  CREDENTIALS.md

  # ─── AI Artifacts: Machine-Local Only (never commit) ───
  .specstory/
  project.memory.md
  .code-review-graph/
  .socraticodecontextartifacts.json
  .github/skills/**/node_modules/
  skills-lock.json

  # ─── Third-Party AI Tool Artifacts (not used by framework — safety net) ───
  .agents/
  .cursor/
  .windsurf/
  .aider*
  .copilot/
  .continue/
  .tabby/
  .augment/
  .roo/

  # ─── Automation Handoff Docs (consumed by framework, not committed) ───
  n8n-handoff.md
  openclaw-handoff.md

  # ─── AI Framework Files: DO NOT GITIGNORE (Claude Code needs these) ───
  # CLAUDE.md              — tracked (Claude Code auto-loads on session start)
  # .claude/               — tracked (modular rules + settings)
  # .cline/                — tracked (STATE.md + lessons.md + agent-log.md = session memory)
  # AI/                    — tracked (Master Prompt reference)
  # .ai_prompt/            — tracked (framework deliverable files)
  # .clinerules            — tracked (generated by Bootstrap, historical parity)
  # docs/                  — tracked (PRODUCT.md + DESIGN.md + governance docs)

  # Editor + OS
  .DS_Store
  *.log
  ```
  .nvmrc: write `22`
  package.json: minimal bootstrap (pnpm@10, name from inputs.yml slug)
  ⚠ CREDENTIALS.md is in .gitignore from Step 8. Step 8 is the single authoritative .gitignore source — Step 16 verifies idempotently.

Step 9 — WSL2 dev environment validation (MODE A only)
  No devcontainer. No Dockerfile for dev. WSL2 native is the only supported dev environment.
  Write a note to docs/DECISIONS_LOG.md confirming the dev environment decision:

  ```
  ## Dev Environment Mode
  Decision: MODE A — WSL2 native (the only supported mode as of V25)
  Rationale: Devcontainer adds 4 virtualisation layers on WSL2 + Docker Desktop causing
  permission errors, shell server crashes, and socket failures. WSL2 native eliminates all of this.
  Docker Desktop provides the Docker socket to WSL2 natively. No DinD needed.
  Locked: yes — do not re-ask or scaffold devcontainer files.
  ```

Step 10 — .vscode/mcp.json (MCP entries — V10 + Context7 V23 + shadcn V29)
  {
    "servers": {
      "socraticode": {
        "command": "npx",
        "args": ["-y", "socraticode"]
      },
      "context7": {
        "command": "npx",
        "args": ["-y", "@upstash/context7-mcp@latest"]
      },
      "shadcn": {
        "command": "npx",
        "args": ["-y", "shadcn@latest", "mcp"]
      }
    }
  }
  SocratiCode: runs as system-level service. Docker must be running.
  On first use: SocratiCode auto-pulls Qdrant + Ollama Docker images (~5 min one-time).
  Context7 (NEW V23): injects live version-specific docs from source repos into prompts.
  Prevents hallucinated deprecated APIs when working with Next.js, Prisma, Auth.js, tRPC, Valkey.
  Usage: append "use context7" to any prompt involving external libraries.
  Example: "Add Auth.js v5 email provider. use context7"
  → Context7 fetches current Auth.js v5 docs before Claude Code generates any code.
  No API key needed. Free. Requires Node.js 18+.
  shadcn MCP (NEW V29): enables agents to search, browse, and install shadcn/ui components
  and blocks from any configured registry via natural language.
  Usage: agents call the MCP server during Phase 4 Part 5 (UI scaffold) and Phase 7 (Feature Updates).
  Example: "Add a date picker, dialog, and sidebar to my project"
  → shadcn MCP resolves the components and installs them via CLI.
  No API key needed. Free. MIT. Reference: https://ui.shadcn.com/docs/mcp

Step 11 — .specstory/config.json (NEW V11 — SpecStory passive capture config)
  {
    "captureHistory": true,
    "historyDir": ".specstory/history",
    "specsDir": ".specstory/specs",
    "autoInjectSpec": "v31-master-prompt.md"
  }

Step 12 — Governance doc templates
  docs/PRODUCT.md       — template with all required sections
  docs/CHANGELOG_AI.md  — Rule 15 format template
  docs/DECISIONS_LOG.md — LOCKED entry format template
  docs/IMPLEMENTATION_MAP.md — all section headers
  project.memory.md     — V14 rules + agent stack summary (6 agents + Log Lesson)
  .cline/STATE.md       — written by Step 16 (not a template — actual content written in Step 16)
  docs/DECISIONS_LOG.md entry: Dev environment mode — MODE A (WSL2 native) — locked, no devcontainer (V25)
  docs/DECISIONS_LOG.md entry: Git branching strategy — feat/{slug}, scaffold/part-{N}, squash-merge (Rule 23)
  docs/DECISIONS_LOG.md entry: Model routing — planning/execution/governance model assignments (Rule 24)
  Written by Bootstrap Step 9 — dev environment decision is pre-locked. Agents never re-ask.

Step 13 — Append to .cline/memory/agent-log.md + .cline/memory/lessons.md
  Log: "Bootstrap complete — project initialized"

Step 14 — UI UX Pro Max skill check (NEW V12)
  Check if .claude/skills/ui-ux-pro-max/ exists.
  If NOT found, append reminder to agent-log.md:
  "UI UX Pro Max skill not installed — design system generation (Phase 2.6) will be skipped.
   Install before running Phase 2.5: /plugin install ui-ux-pro-max@ui-ux-pro-max-skill
   Requires Python 3. Skill is optional — framework works fully without it."
  Does NOT block Bootstrap. Does NOT fail. This is a reminder only.

Step 15 — Human quick-log task (Log Lesson command)
  Write scripts/log-lesson.sh — a shell script that prompts the human to log a
  discovery to lessons.md in Rule 18 typed format without waiting for an agent session.
  Content of scripts/log-lesson.sh:
  #!/bin/bash
  echo "=== Log a Lesson to .cline/memory/lessons.md ==="
  echo ""
  echo "Type? [1=🔴 gotcha  2=🟡 fix  3=🟤 decision  4=⚖️ trade-off  5=🟢 change]"
  read TYPE_NUM
  case $TYPE_NUM in
    1) ICON="🔴 gotcha" ;;
    2) ICON="🟡 fix" ;;
    3) ICON="🟤 decision" ;;
    4) ICON="⚖️ trade-off" ;;
    5) ICON="🟢 change" ;;
    *) ICON="🟢 change" ;;
  esac
  echo "Short title (e.g. 'pnpm install failed in WSL2 — needed node 22 via nvm'):"
  read TITLE
  echo "Affected files (comma-separated, or 'none'):"
  read FILES
  echo "Keywords (e.g. 'docker, wsl2, pnpm, nvm, ports'):"
  read CONCEPTS
  echo "What happened and why does it matter? (one paragraph):"
  read NARRATIVE
  DATE=$(date +%Y-%m-%d)
  ENTRY="\n## $DATE — $ICON $TITLE\n- Type:      $ICON\n- Phase:     manual entry\n- Files:     $FILES\n- Concepts:  $CONCEPTS\n- Narrative: $NARRATIVE\n"
  echo -e "$ENTRY" >> .cline/memory/lessons.md
  echo ""
  echo "✅ Lesson logged to .cline/memory/lessons.md"

  Also write .vscode/tasks.json with a task entry that runs this script:
  {
    "version": "2.0.0",
    "tasks": [
      {
        "label": "Log Lesson",
        "type": "shell",
        "command": "bash scripts/log-lesson.sh",
        "presentation": {
          "reveal": "always",
          "panel": "new",
          "focus": true
        },
        "problemMatcher": []
      }
    ]
  }
  chmod +x scripts/log-lesson.sh after writing.

  This gives the human a frictionless way to log personal discoveries mid-session
  in the correct Rule 18 typed format — without waiting for an agent to do it.
  Trigger: VS Code Command Palette → "Tasks: Run Task" → "Log Lesson"
  Takes ~30 seconds. Entry is immediately readable by Claude Code next session.

Step 16 — Git init + STATE.md (NEW V14)
  IF no git repo exists: run `git init && git checkout -b main`
  Write .gitignore (verify all entries from Step 8 are present — Step 8 is the authoritative .gitignore source. STATE.md is NOT gitignored — it is committed)
  Write .cline/STATE.md with EXACTLY this content:
  ```
  # Project State — {{APP_NAME}}
  # Auto-generated by Claude Code after every task. Never edit manually. (File path kept in .cline/ for historical continuity; Cline deprecated V31.)
  # Updated: [timestamp] by BOOTSTRAP

  PHASE:        Phase 0 — Bootstrap complete
  LAST_DONE:    Project structure created. All 18 bootstrap steps complete.
  NEXT:         Phase 1 — Set up dev environment (optional — skip if already done)
  BLOCKERS:     none
  GIT_BRANCH:   main
  PORTS:        not yet assigned (Phase 3 generates ports)
  MODELS:
    planning:   claude-code (Phase 2 — V31 primary)
    execution:  claude-sonnet-4-6 via Claude Code (V31 primary; Cline deprecated)
    governance: gemini-2.5-flash-lite (cheapest, non-critical writes)
  ```
  Do NOT gitignore STATE.md — it is the shared project dashboard.

Step 17 — .github/skills/ directory + spec-driven-core skill (NEW V19)
  1. Run: mkdir -p .github/skills/spec-driven-core
  2. Write: .github/skills/.gitkeep  (empty — ensures directory tracked in git even before user installs skills)
  3. Write: .github/skills/spec-driven-core/SKILL.md with EXACTLY this content:

  ---
  name: spec-driven-core
  description: Core framework rules for building TypeScript enterprise SaaS apps with Spec-Driven Platform V31. Load when starting any Phase 4-8 task, Feature Update, or governance action.
  ---

  # Spec-Driven Platform V31 — Core Rules Compact Reference

  ## MANDATORY READ ORDER (do not skip, do not reorder)
  0. .cline/STATE.md — FIRST. Answers "where am I right now?"
  1. .cline/memory/lessons.md — ALL 🔴 gotchas first, ALL 🟤 decisions second, rest by relevance
  2. docs/PRODUCT.md — what to build
  3. inputs.yml — locked tech stack + config
  4. inputs.schema.json — validation schema
  5. docs/CHANGELOG_AI.md — what has been done and by whom
  6. docs/DECISIONS_LOG.md — never re-ask anything listed here
  7. docs/IMPLEMENTATION_MAP.md — current build state
  8. project.memory.md — active rules and agent stack
  9. .cline/memory/agent-log.md — running log of every agent action
  Do not write a single line of code until all 9 are read.

  ## NON-NEGOTIABLE RULES
  - docs/PRODUCT.md is the ONLY file a human edits. Never touch apps/, packages/, deploy/ directly.
  - TypeScript strict mode everywhere. No any types. No JS files in src/ or apps/.
  - Read STATE.md before the 9 governance docs every session (Rule 24).
  - Never commit directly to main. Always branch first (Rule 23).
  - Write failing test BEFORE implementation. RED → GREEN → refactor (Rule 25).
  - Two-stage review before every merge: spec compliance then code quality (Rule 25).
  - CREDENTIALS.md is gitignored. Never read into context. Never log in any governance doc.
  - Strip <private> tags from PRODUCT.md before processing (Rule 20).
  - Search before reading: codebase_search before opening any file (Rule 17).
  - Read design-system/MASTER.md before any UI generation. Skip gracefully if absent (Rule 21).
  - Governance writes are non-blocking: append after implementation, never before.
  - HTTP security headers + rate limiter + DOMPurify always-on defaults (V18 — Scenario 26).

  ## AGENT ATTRIBUTION (include in every CHANGELOG_AI.md entry)
  CLINE | CLAUDE_CODE | COPILOT | HUMAN | UNKNOWN

  ## GIT BRANCH NAMING
  feat/{slug} · scaffold/part-{N} · fix/{slug} · chore/{slug}
  Squash-merge only. Delete branch after merge.

  ## ERROR RECOVERY
  1. Attempt fix. Retry up to 3 times.
  2. After 3 failures: write .cline/handoffs/[timestamp]-error.md
  3. Handoff: what you were doing, full error, all 3 attempts, root cause, exact next step.
  4. Stop. Wait for human.

  ## SKILLS IN THIS PROJECT
  - At task start: list .github/skills/ (directory names only — no full reads).
  - For each directory found: read description: frontmatter line only.
  - IF description matches current task → read full SKILL.md → follow its steps.
  - IF no match → proceed with CLAUDE.md rules only.
  - Never load all skills at once.

  4. Append to .gitignore: .github/skills/**/node_modules/
  5. Append to .cline/memory/agent-log.md:
     BOOTSTRAP | Step 17 | .github/skills/ created. spec-driven-core/SKILL.md written. V19 skill standard active.
```

Step 18 — Credential Scaffold (V30 — non-blocking — no interview)

  After Step 17, auto-generate all AI-producible secrets and write CREDENTIALS.md with
  blank placeholders for human-provided fields. Human fills those sections later — not now.
  Bootstrap proceeds to completion without blocking.

  Rationale (V30 change from V23):
  V23 required a blocking interview (15+ questions) before Phase 2 could begin.
  This slowed down first-time setup and forced humans to gather credentials before
  they even knew what the app was. V30 reverses the flow: generate what AI can,
  leave blanks for what humans provide, and let humans fill those blanks at their
  own pace — before Phase 5 at the latest (env files need the values to run services).

  What happens in V30:
  1. AI generates all 22-char and 48-char secrets via openssl (no human input needed)
  2. CREDENTIALS.md written with AI-generated values filled in
  3. Human-provided sections written with blank placeholders and clear "FILL IN LATER" labels
  4. Bootstrap completes. Human proceeds to Phase 2 immediately.
  5. Human fills blank sections in CREDENTIALS.md before Phase 5 (validation gate).
  6. Phase 5 checks CREDENTIALS.md for unfilled required fields and blocks if any remain.

  AFTER Step 17 completes — execute all of the following automatically:

  A) Generate ALL service credentials using terminal tool (22-char minimum):
     Run these commands — DO NOT invent values — capture actual terminal output:

     ```bash
     # PostgreSQL — run once per environment (dev, staging, prod)
     # Password: 22-char full ASCII
     openssl rand -base64 32 | tr -d '\n' | head -c 22   # DB_PASSWORD_dev
     openssl rand -base64 32 | tr -d '\n' | head -c 22   # DB_PASSWORD_staging
     openssl rand -base64 32 | tr -d '\n' | head -c 22   # DB_PASSWORD_prod
     # Username suffix: 11-char hex → DB_USER = ${app_slug}_[hex11]
     openssl rand -hex 11   # DB_USER suffix dev
     openssl rand -hex 11   # DB_USER suffix staging
     openssl rand -hex 11   # DB_USER suffix prod

     # PgBouncer auth password — different from DB_PASSWORD
     openssl rand -base64 32 | tr -d '\n' | head -c 22   # PGBOUNCER_dev
     openssl rand -base64 32 | tr -d '\n' | head -c 22   # PGBOUNCER_staging
     openssl rand -base64 32 | tr -d '\n' | head -c 22   # PGBOUNCER_prod

     # Valkey / Redis password
     openssl rand -base64 32 | tr -d '\n' | head -c 22   # REDIS_dev
     openssl rand -base64 32 | tr -d '\n' | head -c 22   # REDIS_staging
     openssl rand -base64 32 | tr -d '\n' | head -c 22   # REDIS_prod

     # MinIO access key suffix + secret key
     openssl rand -hex 11   # STORAGE_ACCESS_KEY suffix dev (prefix: ${app_slug}-)
     openssl rand -hex 11   # STORAGE_ACCESS_KEY suffix staging
     openssl rand -hex 11   # STORAGE_ACCESS_KEY suffix prod
     openssl rand -base64 32 | tr -d '\n' | head -c 48   # STORAGE_SECRET_KEY dev
     openssl rand -base64 32 | tr -d '\n' | head -c 48   # STORAGE_SECRET_KEY staging
     openssl rand -base64 32 | tr -d '\n' | head -c 48   # STORAGE_SECRET_KEY prod

     # pgAdmin password
     openssl rand -base64 32 | tr -d '\n' | head -c 22   # PGADMIN_PASSWORD dev
     openssl rand -base64 32 | tr -d '\n' | head -c 22   # PGADMIN_PASSWORD staging
     openssl rand -base64 32 | tr -d '\n' | head -c 22   # PGADMIN_PASSWORD prod

     # Auth secrets (JWT signing + session)
     openssl rand -base64 64 | tr -d '\n' | head -c 48   # AUTH_SECRET dev
     openssl rand -base64 64 | tr -d '\n' | head -c 48   # AUTH_SECRET staging
     openssl rand -base64 64 | tr -d '\n' | head -c 48   # AUTH_SECRET prod

     # First admin account password (webmaster)
     openssl rand -base64 32 | tr -d '\n' | head -c 22   # webmaster password
     ```

  B) Write the complete CREDENTIALS.md — ALL sections filled with ACTUAL values:
     Location: project root (already gitignored by Step 1 + Step 16).
     Template:

     ```markdown
     # CREDENTIALS MASTER LIST
     # Generated by Bootstrap Step 18 — Spec-Driven Platform V31
     # ⚠️  GITIGNORED — NEVER commit this file
     # ⚠️  NEVER paste into any AI chat, LLM, or log file
     # ⚠️  Treat like a password manager export — store securely
     # Last generated: [ISO timestamp]
     # App: [APP_NAME] | Slug: [APP_SLUG] | Repo: [GITHUB_REPO or TBD]

     ---

     ## 🚨 FILL THESE IN BEFORE PHASE 5

     The sections marked with `⏳ FILL LATER` below contain blank placeholders.
     Bootstrap did NOT collect these — AI cannot generate them because they come
     from external services you own. Fill them in before Phase 5 validation runs,
     or Phase 5 will fail at the credential check.

     Required-before-Phase-5 sections:
     - 🐙 GitHub (username + PAT)
     - 🐳 Docker Hub (username + token)       [if docker.publish: true]
     - 📧 SMTP (host + credentials)           [always required]
     - 🦎 Komodo (UI URL)                     [if deploying via Komodo]
     - 💳 Xendit (API keys)                   [if payment.gateway: xendit]
     - 🛡️ Cloudflare Turnstile (prod keys)    [always required for production]
     - 🔑 Third-Party API Keys                [project-specific]

     Optional until needed:
     - Komodo webhook URLs (only if using legacy webhook-triggered deploys)

     ---

     ## 🔑 First Admin Account (App Login)

     | Field    | Value                     |
     |----------|---------------------------|
     | Username | webmaster                 |
     | Password | [22-char generated above] |
     | Role     | super_admin               |
     | URL      | http://localhost:[APP_PORT]/login |

     ⚠ Change this password on first production login.
     Seeded by: pnpm db:seed — exists in all environments.
     bcrypt hash written to seed script — plaintext stored here only.

     ---

     ## 🐙 GitHub  ⏳ FILL LATER

     | Field                | Value                                     |
     |----------------------|-------------------------------------------|
     | Username             | ⏳ (your GitHub username)                 |
     | Repo name            | ⏳ (e.g. powerbyte-erp)                   |
     | Repo URL             | ⏳ https://github.com/[user]/[repo]        |
     | Visibility           | ⏳ [public / private]                     |
     | Personal Access Token| ⏳ (ghp_... — generate at github.com/settings/tokens with repo + workflow scope) |
     | Token scopes         | repo, workflow                            |
     | gh CLI installed     | ⏳ [yes / no]                              |

     How to generate PAT:
       1. Go to github.com/settings/tokens
       2. Click "Generate new token (classic)"
       3. Check scopes: repo, workflow
       4. Copy the token (you won't see it again)
     Git remote setup (after filling in): git remote add origin https://github.com/[user]/[repo].git

     ## ⚙️ GitHub Actions Secrets  ⏳ FILL AFTER CREATING REPO
     Add these in: GitHub repo → Settings → Secrets and variables → Actions

     | Secret Name                  | Value                          | Required for       |
     |------------------------------|--------------------------------|--------------------|
     | DOCKERHUB_USERNAME           | ⏳ (from Docker Hub section)   | Docker image push  |
     | DOCKERHUB_TOKEN              | ⏳ (from Docker Hub section)   | Docker image push  |
     | KOMODO_STAGING_WEBHOOK_URL   | ⏳ (optional — V27 auto-update recommended) | OPTIONAL |
     | KOMODO_PROD_WEBHOOK_URL      | ⏳ (optional — V27 manual deploy recommended) | OPTIONAL |
     | KOMODO_WEBHOOK_SECRET        | ⏳ (optional — only if using webhooks) | OPTIONAL |

     ⚠ None of these are generated by this tool — all come from external services.
     Add them to GitHub before first push to main or docker-publish.yml will fail.

     ---

     ## 🐳 Docker Hub  ⏳ FILL LATER (if docker.publish: true)

     | Field        | Value                                               |
     |--------------|-----------------------------------------------------|
     | Username     | ⏳ (your Docker Hub username)                       |
     | Access Token | ⏳ (dckr_pat_... — hub.docker.com → Account → Security) |
     | Image name   | ⏳ [DOCKERHUB_USERNAME]/[IMAGE_NAME from inputs.yml] |
     | Token name   | [app-name]-github-ci                                 |

     How to generate token:
       1. Go to hub.docker.com → Account Settings → Security
       2. Click "New Access Token"
       3. Name it: [app-name]-github-ci
       4. Permissions: Read, Write, Delete
       5. Copy the token (starts with dckr_pat_)
     ⚠ Token is NOT your Docker Hub password — it is a scoped access token.
     Rotate at: hub.docker.com → Account Settings → Security → Access Tokens

     ---

     ## 🗄️ PostgreSQL

     | Environment | DB Name            | Username              | Password                   | Host      | Port |
     |-------------|--------------------|-----------------------|----------------------------|-----------|------|
     | dev         | [app_slug]_dev     | [app_slug]_[hex11]    | [22-char generated]        | localhost | [dev port] |
     | staging     | [app_slug]_staging | [app_slug]_[hex11]    | [22-char generated]        | localhost | 5433 |
     | prod        | [app_slug]_prod    | [app_slug]_[hex11]    | [22-char generated]        | localhost | 5432 |

     All passwords: 22-char full ASCII, generated by openssl, unique per environment.
     All usernames: ${app_slug}_ + 11-char hex suffix — valid SQL identifiers.

     ## 🔀 PgBouncer

     | Environment | Auth Password       | Port |
     |-------------|---------------------|------|
     | dev         | [22-char generated] | [dev port] |
     | staging     | [22-char generated] | 6433 |
     | prod        | [22-char generated] | 6432 |

     ## ⚡ Valkey (Cache + Job Queue)

     | Environment | Password            | Port |
     |-------------|---------------------|------|
     | dev         | [22-char generated] | [dev port] |
     | staging     | [22-char generated] | 6380 |
     | prod        | [22-char generated] | 6379 |

     ## 🗂️ MinIO (S3-Compatible File Storage)

     | Environment | Access Key                  | Secret Key          | Port |
     |-------------|-----------------------------|--------------------|------|
     | dev         | [app_slug]-[hex11]          | [48-char generated] | [dev port] |
     | staging     | [app_slug]-[hex11]          | [48-char generated] | 9010 |
     | prod        | [app_slug]-[hex11]          | [48-char generated] | 9000 |

     Buckets: [app_slug]-dev · [app_slug]-staging · [app_slug]-prod

     ## 🖥️ pgAdmin

     | Environment | Login Email                    | Password            | Port |
     |-------------|--------------------------------|---------------------|------|
     | dev         | dev-admin@[app_slug].local     | [22-char generated] | [dev port] |
     | staging     | staging-admin@[app_slug].local | [22-char generated] | 5051 |
     | prod        | admin@[your-domain]            | [22-char generated] | 5050 |

     ⚠ Never expose pgAdmin port to public internet. Use SSH tunnel or firewall rule.

     ## 🔐 Auth Secrets (JWT Signing)

     | Environment | AUTH_SECRET         |
     |-------------|---------------------|
     | dev         | [48-char generated] |
     | staging     | [48-char generated] |
     | prod        | [48-char generated] |

     Generation: openssl rand -base64 64 | tr -d '\n' | head -c 48 (per env, unique)

     ---

     ## 📧 SMTP (Email — account registration, forgot password, OTP)  ⏳ FILL LATER

     | Field        | Value                                                    |
     |--------------|----------------------------------------------------------|
     | SMTP Host    | ⏳ (e.g. smtp.gmail.com / smtp.mailtrap.io / smtp.sendgrid.net) |
     | SMTP Port    | ⏳ (587 for TLS / 465 for SSL)                           |
     | Username     | ⏳ (your SMTP login email or API username)               |
     | Password     | ⏳ (your SMTP password / app password / API key)         |
     | From address | ⏳ (e.g. noreply@yourapp.com)                            |
     | From name    | ⏳ (e.g. "Nucleus ERP")                                  |

     For dev: MailHog runs locally in Docker (no real SMTP needed) — SMTP fields above
     are only required for staging/prod. Dev automatically uses MailHog on port [dev port].
     Common providers:
       Gmail:     smtp.gmail.com : 587 (uses App Password, not account password)
       SendGrid:  smtp.sendgrid.net : 587 (username is literally "apikey", password is your API key)
       Mailtrap:  smtp.mailtrap.io : 2525 (dev/staging only — not for real delivery)
       AWS SES:   email-smtp.{region}.amazonaws.com : 587

     ---

     ## 🦎 Komodo (Deployment Manager)  ⏳ FILL LATER (if using Komodo)

     | Field                      | Value                                            | Required? |
     |----------------------------|--------------------------------------------------|-----------|
     | Komodo UI URL              | ⏳ (e.g. http://your-server-ip:9120)             | Yes (if using Komodo) |
     | Webhook Secret             | ⏳ (optional — skip if using V27 auto-update)    | OPTIONAL (V27) |
     | Staging Stack Webhook URL  | ⏳ (optional — skip if using V27 auto-update)    | OPTIONAL (V27) |
     | Prod Stack Webhook URL     | ⏳ (optional — skip if using V27 manual deploy)  | OPTIONAL (V27) |

     V27 deployment model (recommended):
     - Staging: Komodo auto_update: true — polls Docker Hub for new :staging-latest images. No webhook needed.
     - Production: Manual deploy from Komodo UI — human clicks Deploy after verifying staging. No webhook needed.
     - Webhook fields are only needed if you prefer the legacy webhook-triggered deployment path.
     See Scenario 32 for full Komodo setup and Stack configuration guide.

     ---

     ## 💳 Xendit (Payment Gateway)  ⏳ FILL LATER (if payment.gateway: xendit)
     [CONDITIONAL — include only if payment.gateway: xendit in inputs.yml]

     | Field                         | Value                                 | Environment |
     |-------------------------------|---------------------------------------|-------------|
     | Secret API Key (TEST)         | ⏳ (xnd_test_... from dashboard)      | dev         |
     | Secret API Key (LIVE)         | ⏳ (xnd_production_... from dashboard)| staging/prod|
     | Public API Key (TEST)         | ⏳ (xnd_public_test_...)              | dev         |
     | Public API Key (LIVE)         | ⏳ (xnd_public_production_...)        | staging/prod|
     | Webhook Verification Token    | ⏳ (x-callback-token value)           | all         |

     ⚠ Secret keys grant full API access — NEVER expose in client-side code or git.
     ⚠ Public keys are safe for client-side (tokenization only) — but still gitignored via .env files.
     ⚠ Webhook token is the x-callback-token header value — verify on EVERY incoming webhook.
     ⚠ SAME webhook token for both test and live environments (Xendit uses one token per account).
     Dashboard: https://dashboard.xendit.co → Settings → API Keys
     Webhook token: https://dashboard.xendit.co → Settings → Developers → Callbacks
     Docs: https://docs.xendit.co/apidocs

     ---

     ## 🛡️ Cloudflare Turnstile (Bot Protection)  ⏳ FILL LATER (prod keys only)

     | Field                    | Value                                    | Environment    |
     |--------------------------|------------------------------------------|----------------|
     | Cloudflare Account       | ⏳ (your Cloudflare account email)       | —              |
     | Site Key (TEST)          | 1x00000000000000000000AA                 | dev + staging  |
     | Secret Key (TEST)        | 1x0000000000000000000000000000000AA      | dev + staging  |
     | Site Key (LIVE)          | ⏳ (from dash.cloudflare.com → Turnstile)| prod ONLY      |
     | Secret Key (LIVE)        | ⏳ (same widget page — copy Secret Key)  | prod ONLY      |
     | Widget Mode              | Managed (recommended)                    | all            |
     | Widget Name              | ${app_slug}                              | —              |

     Dev + staging use Cloudflare's official test keys — pre-filled above, no setup needed.
     Prod keys: create a Turnstile widget at dash.cloudflare.com → Turnstile → Add Widget.
     Allowed hostnames on widget: ${prod_domain} ONLY (saves hostname budget: 1 of 10 slots used per app).
     ⚠ Site Key is PUBLIC — appears in HTML. Secret Key is SERVER-ONLY — never in client bundles.
     Dashboard: https://dash.cloudflare.com → Turnstile
     Docs: https://developers.cloudflare.com/turnstile/

     ---

     ## 🔑 Third-Party API Keys  ⏳ FILL AS NEEDED

     | Service | Key Name | Value | Environment | Notes |
     |---------|----------|-------|-------------|-------|
     | ⏳      | ⏳       | ⏳    | ⏳          | Add rows as you integrate services |

     Common examples (add rows below as you integrate):
     | Twilio       | TWILIO_ACCOUNT_SID  | ⏳ | all         | SMS/voice |
     | Twilio       | TWILIO_AUTH_TOKEN   | ⏳ | all         | — |
     | Google Maps  | GOOGLE_MAPS_API_KEY | ⏳ | all         | Maps + geocoding |
     | OpenAI       | OPENAI_API_KEY      | ⏳ | all         | AI/chat features |
     | Stripe       | STRIPE_SECRET_KEY   | ⏳ | all         | (if not using Xendit) |
     | AWS S3       | AWS_ACCESS_KEY_ID   | ⏳ | staging/prod| (if migrated from MinIO) |
     | AWS S3       | AWS_SECRET_ACCESS_KEY | ⏳ | staging/prod| — |

     Delete example rows that don't apply. Add rows for any service your app uses.
     Every key added here must also be added to .env.dev/.env.staging/.env.prod and .env.example (with a placeholder).

     ---

     ## 📋 Where Each File Lives

     | File             | Location       | Committed? |
     |------------------|----------------|------------|
     | .env.dev         | project root   | ❌ gitignored |
     | .env.staging     | project root   | ❌ gitignored |
     | .env.prod        | project root   | ❌ gitignored |
     | .env.example     | project root   | ✅ YES — placeholders only |
     | CREDENTIALS.md   | project root   | ❌ gitignored |

     Anyone who clones this repo sees only .env.example with empty placeholders.

     ---

     ## 📝 How to Fill the ⏳ Placeholders

     1. Open CREDENTIALS.md in your editor
     2. For each `⏳ FILL LATER` section, replace the `⏳ ...` values with the real credential
     3. Keep the file gitignored — never commit it
     4. After filling: run `bash scripts/sync-credentials-to-env.sh` (generated by Phase 3)
        to propagate values to .env.dev / .env.staging / .env.prod
     5. Phase 5 validation will fail if required fields are still `⏳ ...` — fix before proceeding
     ```

  C) Append to .cline/memory/agent-log.md:
     BOOTSTRAP | Step 18 | Credential Scaffold complete (V30 — non-blocking).
     AI-generated (22-char min, 48-char for signing secrets):
       - DB passwords (×3 envs), PgBouncer passwords (×3), Valkey passwords (×3),
       - MinIO keys (×3), pgAdmin passwords (×3), Auth secrets (×3), webmaster password.
     Human-provided (blank placeholders written — ⏳ FILL LATER):
       - GitHub username + PAT, Docker Hub username + token, SMTP credentials,
       - Komodo UI URL, Xendit API keys (if conditional), Turnstile prod keys,
       - Third-party API keys (project-specific).
     CREDENTIALS.md written. Human will fill ⏳ placeholders before Phase 5.
     Phase 5 validation will check for unfilled required fields and block if any remain.

  D) Output the "Bootstrap complete" message below. Bootstrap is non-blocking —
     human can proceed to Phase 2 immediately even with unfilled placeholders.

After Claude Code finishes all 18 steps, OUTPUT THE FOLLOWING TEXT TO THE HUMAN. Do not execute these instructions yourself — they are for the human to read:
```
✅ Bootstrap complete — CREDENTIALS.md written with AI-generated secrets + blank placeholders.

⏳ CREDENTIALS TO FILL BEFORE PHASE 5:
   Open CREDENTIALS.md and fill in the sections marked "⏳ FILL LATER":
   - 🐙 GitHub (username + Personal Access Token)
   - 🐳 Docker Hub (username + access token) [if using Docker pipeline]
   - 📧 SMTP (host, port, credentials)        [staging/prod email delivery]
   - 🦎 Komodo (UI URL)                       [if deploying via Komodo]
   - 💳 Xendit (API keys)                     [if payment.gateway: xendit]
   - 🛡️ Cloudflare Turnstile (prod keys)      [dev/staging use test keys — already filled]
   - 🔑 Third-Party API Keys                  [Twilio, Google Maps, OpenAI, etc.]

   You can fill these at your own pace. Dev environment works without them
   (MailHog replaces SMTP in dev, Turnstile test keys are pre-filled, etc.).
   Phase 5 validation will block if required fields remain unfilled.

Next steps — proceed immediately, fill credentials in parallel:
1. Copy your completed docs/PRODUCT.md into the docs/ folder now.
   (If you have not written it yet, use the Planning Assistant in claude.ai first.
    The Planning Assistant includes Phase 2.8 Clickable Mockup Review (NEW V31) —
    a visual spec alignment check before Phase 3. Run it there, then bring PRODUCT.md here.)
2. Set up your dev environment if not already done (Phase 1 — optional if already set up):
   WSL2 terminal → nvm install 22 && npm install -g pnpm → open project with VS Code Remote-WSL
   Skip this step if Node 22, pnpm, and VS Code Remote-WSL are already installed.
3. Say "Start Phase 2" in Claude Code to begin the discovery interview.
   Or say "Start Phase 4" in Claude Code if you already have a confirmed PRODUCT.md and inputs.yml.
4. For SocratiCode: Docker must be running (Docker Desktop via WSL2 — start Docker Desktop on Windows)
   After Phase 4 completes, ask Claude Code to index this codebase
5. Install the SpecStory VS Code extension if not already installed —
   it auto-captures sessions immediately, no further config needed
6. Install UI UX Pro Max skill for design system generation (optional but recommended):
   /plugin install ui-ux-pro-max@ui-ux-pro-max-skill
   (requires Python 3 — Phase 2.6 runs automatically if skill is present)
7. Install Anthropic frontend-design plugin (NEW V23 — recommended for all UI work):
   /plugin install frontend-design@claude-code
   Auto-activates on all UI tasks. Provides bold aesthetic direction, typography rules,
   animation guidelines, and production-quality visual standards.
   Install once per machine. Works alongside UI UX Pro Max (they complement each other).

8. Install accessibility (a11y) skill for apps with WCAG AA requirement (NEW V23):
   Conditional — only if PRODUCT.md Non-functional Requirements declares: accessibility: wcag_aa
   /plugin install a11y-skill (or) npx skills add airowe/claude-a11y-skill
   Runs WCAG 2.1 A/AA audit: contrast ratios (4.5:1 normal, 3:1 large), focus rings,
   alt text, ARIA labels, keyboard navigation, form labels. Pre-delivery checklist enforced.
   Required for MGE (Philippine Data Privacy Act WCAG AA mandate). Recommended for ERP.

9. Optional domain skill packs (install any time — see Scenario 27):
   spec-driven-aws · spec-driven-payments · spec-driven-govt · spec-driven-erp

10. BEFORE PHASE 5: fill all ⏳ placeholders in CREDENTIALS.md.
    Run: bash scripts/sync-credentials-to-env.sh  (generated by Phase 3)
    This propagates CREDENTIALS.md values → .env.dev / .env.staging / .env.prod
    Phase 5 validation will list any remaining unfilled required fields.
```

---

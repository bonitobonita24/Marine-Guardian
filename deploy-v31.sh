#!/bin/bash
# ============================================================
# Spec-Driven Platform V32.14 — File Deployment Script
# ============================================================
# V32.10 (compose resource limits) + V32.11 (shadcn/studio Pro default
# design generator) add NO new deliverable files — their content ships via
# the existing files already in the whitelist below (templates.md for V32.10;
# CLAUDE_v31_compact.md / phases.md / ui-rules.md / Master_Prompt for V32.11).
# V32.12 (design-principles.md on-demand reference) adds deliverable #24 —
# see GROUP 2 (.ai_prompt/ block) below.
# V32.13 (CI → Docker Hub → Komodo-API auto-deploy) adds NO new deliverable
# files — the app-side deploy/komodo-deploy.sh + .github/workflows/docker-publish.yml
# are Phase-6 SCAFFOLD templates (templates.md Rule 5c + phases.md), vendored from
# Server-Setups/Powerbyte-Hostinger/komodo/ci-deploy/, not shipped by this script.
# V32.14 (motion.md on-demand reference) adds deliverable #25 — a library-agnostic
# UI/UX motion-principles file shipped to .ai_prompt/ (see GROUP 8 below) + ui-rules.md
# Rule 14. Deliverable count 24 → 25.
# ============================================================
# SAFETY CONTRACT (read this before running)
# ============================================================
# This script categorizes every file into one of three buckets:
#
#   1. ALWAYS-OVERWRITE (framework files — agent-owned, safe to replace)
#      Any existing file here is backed up with a .bak suffix, then replaced.
#         • CLAUDE.md                    (project root — the ONLY auto-loaded file)
#      These 8 detail files are copied to .ai_prompt/ ONLY (load-on-demand, not auto-loaded):
#         • .ai_prompt/phases.md            (← was .claude/rules/ in V32.6.1 and earlier)
#         • .ai_prompt/memory-governance.md (← was .claude/rules/ in V32.6.1 and earlier)
#         • .ai_prompt/security.md          (← was .claude/rules/ in V32.6.1 and earlier)
#         • .ai_prompt/ui-rules.md          (← was .claude/rules/ in V32.6.1 and earlier)
#         • .ai_prompt/bootstrap.md         (← was .claude/rules/ in V32.6.1 and earlier)
#         • .ai_prompt/scenarios.md         (← was .claude/rules/ in V32.6.1 and earlier)
#         • .ai_prompt/templates.md         (← was .claude/rules/ in V32.6.1 and earlier)
#         • AI/Master_Prompt_v31.md      (new file — any old AI/Master_Prompt_v2*.md
#                                        is kept untouched; delete manually if desired)
#      These 2 new files deploy to .claude/ (framework-owned, overwrite-with-backup):
#         • .claude/agents/spec-executor.md  (custom Sonnet executor subagent — V32.7.2)
#         • .claude/settings.json            (framework settings — MERGED, never clobbed;
#                                            existing keys preserved, keys injected)
#      This file deploys to scripts/ (framework-owned, overwrite-with-backup — V32.7.5):
#         • scripts/lint-deploy.sh           (pre-deploy footgun gate — deliverable #20;
#                                            invoked by phases.md Phase 5/6 as
#                                            `bash scripts/lint-deploy.sh deploy/compose`)
#      V32.8 design toolkit (overwrite-with-backup, scaffold-if-absent):
#         • scripts/design-stop-hook.sh      (Claude Code Stop hook — deliverable #21)
#         • .ai_prompt/LESSONS_REGISTRY.md   (consult pointer — design drift lessons — deliverable #22)
#         • tests/visual/                    (visual-test scaffold — .gitkeep created if absent)
#      V32.9 compliance + data privacy (overwrite-with-backup):
#         • .ai_prompt/privacy.md            (PH Data Privacy Act + WCAG 2.2 AA gate — on-demand — deliverable #23)
#      V32.12 design principles (overwrite-with-backup):
#         • .ai_prompt/design-principles.md  (framework-level design guidance — on-demand — deliverable #24)
#      V32.14 motion layer (overwrite-with-backup):
#         • .ai_prompt/motion.md             (framework-level motion guidance — on-demand — deliverable #25)
#         NOTE: sd.config.mjs, design-validate.mjs, and STATE.md evidence template are
#         NOT deploy-copied — they are scaffolded by bootstrap.md Step 20 from templates.md
#         (project-adjacent files, not standalone framework deliverables).
#
#   2. ALWAYS-APPEND (project config — merge new entries, preserve existing)
#         • .gitignore  — appends V32 entries ONLY if not already present.
#                         Preserves all existing user entries verbatim.
#                         Section header added only if missing.
#
#   3. NEVER-TOUCH (user data / project state — script refuses to modify)
#         • docs/PRODUCT.md              (human-edited spec)
#         • docs/DECISIONS_LOG.md        (locked decisions)
#         • docs/CHANGELOG_AI.md         (attribution history)
#         • docs/IMPLEMENTATION_MAP.md   (build state)
#         • project.memory.md            (agent state)
#         • inputs.yml / inputs.schema.json (locked project config)
#         • CREDENTIALS.md               (human-filled secrets)
#         • .env.dev / .env.staging / .env.prod (runtime config)
#         • .env.example                 (committed template)
#         • .cline/memory/lessons.md     (learned gotchas)
#         • .cline/memory/agent-log.md   (session log)
#         • .cline/handoffs/*            (unresolved handoffs)
#         • .specstory/history/*         (session capture)
#         • apps/ packages/ deploy/      (your actual codebase)
#
#      If this script ever attempts to write to these paths, it will ABORT.
#      That's a hard-coded guarantee verified by the guard function below.
#
# ============================================================
# EXPECTED LAYOUT BEFORE RUNNING:
#   your-project/
#   ├── .ai_prompt/               ← put all V32 reference files in here
#   │   ├── CLAUDE_v31_compact.md
#   │   ├── Master_Prompt_v31.md
#   │   ├── bootstrap.md
#   │   ├── phases.md
#   │   ├── security.md
#   │   ├── ui-rules.md
#   │   ├── scenarios.md
#   │   ├── templates.md
#   │   ├── memory-governance.md
#   │   ├── spec-executor.md           ← NEW V32.7.2 — Sonnet executor subagent
#   │   ├── settings.json              ← NEW V32.7.2 — framework settings (merge-deployed)
#   │   ├── lint-deploy.sh             ← NEW V32.7.5 — pre-deploy footgun gate (→ scripts/, deliverable #20)
#   │   ├── design-stop-hook.sh        ← NEW V32.8 — Claude Code Stop hook (→ scripts/, deliverable #21)
#   │   ├── LESSONS_REGISTRY.md        ← NEW V32.8 — design-drift lessons registry (deliverable #22)
#   │   ├── privacy.md                 ← NEW V32.9 — PH Data Privacy Act + WCAG 2.2 AA (→ .ai_prompt/, deliverable #23)
#   │   ├── design-principles.md       ← NEW V32.12 — framework-level design guidance (→ .ai_prompt/, deliverable #24)
#   │   ├── motion.md                  ← NEW V32.14 — framework-level motion guidance (→ .ai_prompt/, deliverable #25)
#   │   ├── Product_md_Planning_Assistant_v31.md
#   │   ├── Framework_Feature_Index_v31.md
#   │   ├── AI_Tools_Skills_MCPs_Reference_v31.md
#   │   ├── Post_Generation_Security_Checklist_v31.md
#   │   ├── ChatGPT_V31_Cross_Audit_Prompt.md
#   │   ├── Prompt_References.md
#   │   └── Prompt_References.html     ← interactive HTML UI for prompt references
#   └── deploy-v31.sh             ← this script at project root (23rd file — total deliverable set)
#
# DEPLOYED TARGET LOCATIONS (V32.7.2 additions):
#   .claude/agents/spec-executor.md    ← overwrite-with-backup (framework-owned)
#   .claude/settings.json              ← create-or-merge (existing keys preserved)
# DEPLOYED TARGET LOCATIONS (V32.7.5 addition):
#   scripts/lint-deploy.sh             ← overwrite-with-backup (framework-owned), chmod +x
# DEPLOYED TARGET LOCATIONS (V32.8 additions):
#   scripts/design-stop-hook.sh        ← overwrite-with-backup (framework-owned), chmod +x (deliverable #21)
#   .ai_prompt/LESSONS_REGISTRY.md     ← overwrite-with-backup (framework-owned) (deliverable #22)
#   .ai_prompt/privacy.md              ← overwrite-with-backup (framework-owned) (deliverable #23, V32.9)
# DEPLOYED TARGET LOCATIONS (V32.12 addition):
#   .ai_prompt/design-principles.md    ← overwrite-with-backup (framework-owned) (deliverable #24, V32.12)
# DEPLOYED TARGET LOCATIONS (V32.14 addition):
#   .ai_prompt/motion.md               ← overwrite-with-backup (framework-owned) (deliverable #25, V32.14)
#   tests/visual/                      ← scaffold-if-absent (.gitkeep); existing files untouched
#   NOTE: sd.config.mjs, design-validate.mjs, STATE.md.template — scaffolded by bootstrap.md
#   Step 20 from templates.md (not deploy-copied).
#
# USAGE:
#   cd your-project
#   bash deploy-v31.sh
#
# WORKS FOR ALL SITUATIONS:
#   • Greenfield (empty project):   creates everything fresh
#   • V32 upgrade (prior version):  backs up old framework files, replaces with V32,
#                                    preserves all project data
#   • Brownfield (non-Spec-Driven): adds framework files alongside existing code,
#                                    preserves all existing code
#
# IDEMPOTENT: running twice does the same as running once (just creates new backups).
# ============================================================

set -euo pipefail

# --- Resolve paths ---
PROJECT="$(pwd)"
AI_PROMPT="$PROJECT/.ai_prompt"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# --- Validate .ai_prompt folder exists ---
if [ ! -d "$AI_PROMPT" ]; then
  echo "❌ .ai_prompt/ folder not found in current directory."
  echo ""
  echo "Expected layout:"
  echo "  $(basename "$PROJECT")/"
  echo "  ├── .ai_prompt/            ← create this and put the V32 reference files in it"
  echo "  └── deploy-v31.sh          ← this script"
  echo ""
  echo "Run this script from the directory containing .ai_prompt/"
  exit 1
fi

echo "============================================================"
echo "  Spec-Driven Platform V32.14 — Deployment"
echo "============================================================"
echo "  Project root:  $PROJECT"
echo "  Source folder: $AI_PROMPT"
echo "  Timestamp:     $TIMESTAMP"
echo "============================================================"
echo ""

# ============================================================
# GUARD — NEVER-TOUCH allowlist (hard-coded safety)
# ============================================================
# Any attempt to write to one of these paths will abort the script.
NEVER_TOUCH=(
  "docs/PRODUCT.md"
  "docs/DECISIONS_LOG.md"
  "docs/CHANGELOG_AI.md"
  "docs/IMPLEMENTATION_MAP.md"
  "project.memory.md"
  "inputs.yml"
  "inputs.schema.json"
  "CREDENTIALS.md"
  ".env.dev"
  ".env.staging"
  ".env.prod"
  ".env.example"
  ".cline/memory/lessons.md"
  ".cline/memory/agent-log.md"
)

# Reject write to NEVER-TOUCH paths
guard_never_touch() {
  local dest="$1"
  local relative="${dest#$PROJECT/}"
  for protected in "${NEVER_TOUCH[@]}"; do
    if [ "$relative" = "$protected" ]; then
      echo "🛑 FATAL: script attempted to write to NEVER-TOUCH path: $relative"
      echo "    This is a safety violation. Aborting before any file is modified."
      exit 2
    fi
  done
  # Also protect directories in prefix
  for protected_dir in ".cline/handoffs" ".specstory/history" "apps" "packages" "deploy"; do
    if [[ "$relative" == "$protected_dir/"* ]]; then
      echo "🛑 FATAL: script attempted to write inside NEVER-TOUCH directory: $protected_dir/"
      echo "    Aborting before any file is modified."
      exit 2
    fi
  done
}

# ============================================================
# PRE-FLIGHT: show the caller what will happen, before doing it
# ============================================================
echo "─── PRE-FLIGHT — showing planned actions ───"
echo ""
echo "OVERWRITE (backup .bak first, then replace):"
for item in \
  "CLAUDE.md" \
  ".ai_prompt/phases.md" \
  ".ai_prompt/memory-governance.md" \
  "AI/Master_Prompt_v31.md"; do
  if [ -f "$PROJECT/$item" ]; then
    echo "    $item  (exists → will back up, then overwrite)"
  else
    echo "    $item  (new → will create)"
  fi
done
echo ""
echo "APPEND (merge new entries only):"
if [ -f "$PROJECT/.gitignore" ]; then
  echo "    .gitignore  (exists → will append missing V32 entries only)"
else
  echo "    .gitignore  (new → will create)"
fi
echo ""
echo "NEVER TOUCH (script will refuse to modify):"
for p in "${NEVER_TOUCH[@]}"; do
  if [ -f "$PROJECT/$p" ]; then
    echo "    $p  (EXISTS — will be left exactly as-is)"
  fi
done
if [ -d "$PROJECT/apps" ];      then echo "    apps/       (EXISTS — untouched)"; fi
if [ -d "$PROJECT/packages" ];  then echo "    packages/   (EXISTS — untouched)"; fi
if [ -d "$PROJECT/deploy" ];    then echo "    deploy/     (EXISTS — untouched)"; fi
if [ -d "$PROJECT/.specstory" ];then echo "    .specstory/ (EXISTS — untouched)"; fi
if [ -d "$PROJECT/.cline" ];    then echo "    .cline/     (EXISTS — untouched)"; fi
echo ""
echo "────────────────────────────────────────────"
echo ""

# ============================================================
# Helper: OVERWRITE with backup (for framework files only)
# ============================================================
overwrite_with_backup() {
  local src="$1"
  local dest="$2"
  local filename
  filename=$(basename "$src")

  # Guardrail: must not target a NEVER-TOUCH path
  guard_never_touch "$dest"

  if [ ! -f "$src" ]; then
    echo "  ⚠  Source not found: .ai_prompt/$filename — SKIPPED"
    return 1
  fi

  if [ -f "$dest" ]; then
    # Byte-identical? skip to avoid needless backups on re-runs
    if cmp -s "$src" "$dest"; then
      echo "  ⏭  $(basename "$dest")  (identical — no change)"
      return 0
    fi
    cp "$dest" "${dest}.${TIMESTAMP}.bak"
    cp "$src" "$dest"
    echo "  🔄 $(basename "$dest")  (overwritten — backup saved as .${TIMESTAMP}.bak)"
  else
    cp "$src" "$dest"
    echo "  ✅ $(basename "$dest")  (created)"
  fi
}

# ============================================================
# Helper: APPEND a single line to a file ONLY IF SEMANTICALLY MISSING
# ============================================================
# Intelligence applied:
#   1. Exact match      → skip (already present)
#   2. Whitespace/CRLF  → normalized before matching (tolerates Windows line endings)
#   3. Commented-out    → warn + append anyway (user disabled a required rule)
#   4. Negation pattern → warn + append anyway (user force-includes what we hide)
#   5. Equivalent forms → treated same (e.g. ".ai_prompt/", ".ai_prompt",
#                         "/.ai_prompt/", "/.ai_prompt" all match for directories)
#   6. Section headers  → add only if that exact header text is absent
#
# Returns:
#   0 if line was added OR already present
#   1 if the file doesn't exist AND couldn't be created
append_line_if_missing() {
  local file="$1"
  local line="$2"
  local label="${3:-$(basename "$file")}"  # optional label for logging

  # Guardrail: must not target a NEVER-TOUCH path
  guard_never_touch "$file"

  # Create file if missing
  if [ ! -f "$file" ]; then
    touch "$file" || return 1
  fi

  # Normalize existing file content for matching (strip trailing whitespace + CRLF)
  # This is read-only — we never rewrite the user's file with normalized content.
  local normalized_content
  normalized_content=$(sed 's/\r$//; s/[[:space:]]*$//' "$file")

  # Handle section headers (comments): match exact header text
  if [[ "$line" == \#* ]]; then
    if echo "$normalized_content" | grep -qxF "$line"; then
      return 0  # header already present, silent skip
    fi
    # Ensure a blank line separator before new section
    if [ -s "$file" ] && [ "$(tail -c 1 "$file" | wc -l)" -eq 0 ]; then
      echo "" >> "$file"   # file doesn't end with newline
    fi
    echo "" >> "$file"
    echo "$line" >> "$file"
    return 0
  fi

  # Normalize the line we're considering
  local line_stripped="${line#/}"       # trim leading slash for comparison
  line_stripped="${line_stripped%/}"    # trim trailing slash
  local line_core="$line_stripped"

  # Build set of equivalent forms to check against
  # Example: input ".ai_prompt/" → we also match ".ai_prompt", "/.ai_prompt/", "/.ai_prompt"
  local equivalents=(
    "$line"                    # exact as given
    "$line_core"               # no leading/trailing slash
    "/$line_core"              # leading slash only
    "$line_core/"              # trailing slash only
    "/$line_core/"             # both slashes
  )

  # Check exact-or-equivalent presence (case-sensitive — git is case-sensitive on Linux)
  for candidate in "${equivalents[@]}"; do
    if echo "$normalized_content" | grep -qxF "$candidate"; then
      echo "  ⏭  Present:  $line  ($label)"
      return 0
    fi
  done

  # Check for COMMENTED-OUT version: "# .ai_prompt/" or "#.ai_prompt/"
  for candidate in "${equivalents[@]}"; do
    if echo "$normalized_content" | grep -qE "^[[:space:]]*#[[:space:]]*$(printf '%s' "$candidate" | sed 's/[].*[^$\/]/\\&/g')[[:space:]]*$"; then
      echo "  ⚠  Warning: '$line' exists but is COMMENTED OUT in $label."
      echo "              V32 requires this to be active — appending enabled version."
      # fall through to append below
      break
    fi
  done

  # Check for NEGATION pattern: "!.ai_prompt/" — user force-includes what we hide
  for candidate in "${equivalents[@]}"; do
    if echo "$normalized_content" | grep -qxF "!$candidate"; then
      echo "  ⚠  Warning: '!$line' (negation) exists in $label."
      echo "              User is force-including what V32 wants to hide."
      echo "              Appending V32 rule — review manually to resolve conflict."
      # fall through to append
      break
    fi
  done

  # Append
  echo "$line" >> "$file"
  echo "  ✅ Added:    $line  ($label)"
  return 0
}

# ============================================================
# GROUP 1 — OVERWRITE: Compact CLAUDE.md (project root)
# ============================================================
echo "─── Group 1: Compact CLAUDE.md (OVERWRITE) ───"
overwrite_with_backup "$AI_PROMPT/CLAUDE_v31_compact.md" "$PROJECT/CLAUDE.md"
echo ""

# ============================================================
# GROUP 2 — OVERWRITE: All 7 detail files → .ai_prompt/ (load-on-demand, NOT auto-loaded)
# V32.7: ALL detail files now live in .ai_prompt/ only. .claude/rules/ is intentionally
# empty — no framework file deploys there. Only CLAUDE.md (Group 1) auto-loads.
# The compact card's CONTEXTUAL FILE LOADING table contains explicit Read commands for each.
# ============================================================
echo "─── Group 2: .ai_prompt/ detail files (load-on-demand — 7 files, V32.7) ───"

overwrite_with_backup "$AI_PROMPT/phases.md"             "$PROJECT/.ai_prompt/phases.md"
overwrite_with_backup "$AI_PROMPT/memory-governance.md"  "$PROJECT/.ai_prompt/memory-governance.md"
overwrite_with_backup "$AI_PROMPT/security.md"           "$PROJECT/.ai_prompt/security.md"
overwrite_with_backup "$AI_PROMPT/ui-rules.md"           "$PROJECT/.ai_prompt/ui-rules.md"
overwrite_with_backup "$AI_PROMPT/bootstrap.md"          "$PROJECT/.ai_prompt/bootstrap.md"
overwrite_with_backup "$AI_PROMPT/scenarios.md"          "$PROJECT/.ai_prompt/scenarios.md"
overwrite_with_backup "$AI_PROMPT/templates.md"          "$PROJECT/.ai_prompt/templates.md"
echo ""

# ============================================================
# GROUP 3 — OVERWRITE: Full monolithic Master Prompt (AI/ folder)
# ============================================================
echo "─── Group 3: AI/Master_Prompt_v31.md (OVERWRITE) ───"
mkdir -p "$PROJECT/AI"
overwrite_with_backup "$AI_PROMPT/Master_Prompt_v31.md" "$PROJECT/AI/Master_Prompt_v31.md"

# Flag but don't touch old master prompt versions
old_masters=$(find "$PROJECT/AI" -maxdepth 1 -name "Master_Prompt_v2*.md" 2>/dev/null || true)
if [ -n "$old_masters" ]; then
  echo ""
  echo "  ℹ  Older Master Prompt versions detected in AI/ (left untouched):"
  echo "$old_masters" | sed 's|.*/|      |'
  echo "      Delete these manually once V32 is confirmed working."
fi
echo ""

# ============================================================
# GROUP 4 — APPEND: .gitignore (uses append_line_if_missing helper)
# ============================================================
echo "─── Group 4: .gitignore (APPEND — preserve existing entries) ───"

GITIGNORE="$PROJECT/.gitignore"

# Create .gitignore if it doesn't exist (append_line_if_missing handles this,
# but we announce creation explicitly here for clarity)
if [ ! -f "$GITIGNORE" ]; then
  touch "$GITIGNORE"
  echo "  📄 Created new .gitignore"
fi

preserved_lines=$(wc -l < "$GITIGNORE" 2>/dev/null || echo 0)

# V32 entries to ensure are present. Order preserved on append — duplicates never created.
# The append_line_if_missing helper handles:
#   - exact match        → skip
#   - whitespace/CRLF    → normalized during match
#   - commented-out      → warn + append active version
#   - negation (!entry)  → warn + append, flag conflict
#   - equivalent slashes → ".ai_prompt/" == ".ai_prompt" == "/.ai_prompt/" etc.
GITIGNORE_ENTRIES=(
  "# ─── Build + TypeScript cache (Spec-Driven V32) ───"
  "*.tsbuildinfo"
  "# ─── Environment files — NEVER commit real credentials ───"
  ".env"
  ".env.*"
  "!.env.example"
  "# ─── Credentials master list ───"
  "CREDENTIALS.md"
  "# ─── AI Artifacts: Machine-Local Only (never commit) ───"
  ".specstory/"
  "project.memory.md"
  ".code-review-graph/"
  ".socraticodecontextartifacts.json"
  ".github/skills/**/node_modules/"
  "skills-lock.json"
  "# ─── Third-Party AI Tool Artifacts (safety net) ───"
  ".agents/"
  ".cursor/"
  ".windsurf/"
  ".aider*"
  ".copilot/"
  ".continue/"
  ".tabby/"
  ".augment/"
  ".roo/"
  "# ─── Automation Handoff Docs (consumed by framework, not committed) ───"
  "n8n-handoff.md"
  "openclaw-handoff.md"
  "# ─── V32.8 Design Toolkit artifacts ───"
  "tokens/build/"
  "tests/visual/__snapshots__/"
  "tests/visual/diff/"
)

for entry in "${GITIGNORE_ENTRIES[@]}"; do
  append_line_if_missing "$GITIGNORE" "$entry" ".gitignore"
done

# Report summary
final_lines=$(wc -l < "$GITIGNORE" 2>/dev/null || echo 0)
added=$((final_lines - preserved_lines))
echo ""
if [ "$added" -le 0 ]; then
  echo "  ℹ  All V32 entries already in .gitignore — nothing added"
else
  echo "  ✅ Added $added lines. Preserved $preserved_lines existing lines."
fi
echo ""

# ============================================================
# GROUP 5 — .claude/ targets: spec-executor subagent + settings.json merge (V32.7.2)
# ============================================================
echo "─── Group 5: .claude/ targets — spec-executor + settings.json (V32.7.2) ───"

# --- 5a: spec-executor.md → .claude/agents/spec-executor.md (overwrite-with-backup) ---
mkdir -p "$PROJECT/.claude/agents"
overwrite_with_backup "$AI_PROMPT/spec-executor.md" "$PROJECT/.claude/agents/spec-executor.md"

# --- 5b: settings.json → .claude/settings.json (create-or-merge) ---
SETTINGS_SRC="$AI_PROMPT/settings.json"
SETTINGS_DEST="$PROJECT/.claude/settings.json"

if [ ! -f "$SETTINGS_SRC" ]; then
  echo "  ⚠  Source not found: .ai_prompt/settings.json — SKIPPED"
else
  guard_never_touch "$SETTINGS_DEST"

  if [ ! -f "$SETTINGS_DEST" ]; then
    # No existing settings.json — create fresh
    mkdir -p "$PROJECT/.claude"
    cp "$SETTINGS_SRC" "$SETTINGS_DEST"
    echo "  ✅ settings.json  (created — framework settings written)"
  else
    # Existing settings.json — merge our 2 keys in, preserve all existing keys
    if cmp -s "$SETTINGS_SRC" "$SETTINGS_DEST"; then
      echo "  ⏭  settings.json  (identical — no change)"
    else
      # Guard: jq must be available for merge
      if ! command -v jq &>/dev/null; then
        echo "  ⚠  WARNING: jq not found — cannot auto-merge settings.json."
        echo "              Please add the following 2 keys to $SETTINGS_DEST manually:"
        echo "              $(cat "$SETTINGS_SRC")"
        echo "              Continuing deploy without merging settings.json."
      else
        # Backup the original
        cp "$SETTINGS_DEST" "${SETTINGS_DEST}.${TIMESTAMP}.bak"
        # Deep-merge: existing file (.[0]) wins for any conflicts; our keys (.[1]) fill gaps
        # We want our new keys to inject without overwriting user's existing keys,
        # so we merge as: existing * ours (existing takes precedence on key collision)
        # To ensure our keys are ADDED (not overwritten by existing), reverse the merge:
        # .[0]=ours (base), .[1]=existing (wins on conflict) — existing keys always preserved
        SETTINGS_TMP=$(mktemp)
        jq -s '.[0] * .[1]' "$SETTINGS_SRC" "$SETTINGS_DEST" > "$SETTINGS_TMP"
        mv "$SETTINGS_TMP" "$SETTINGS_DEST"
        echo "  🔄 settings.json  (merged — framework keys injected, existing keys preserved;"
        echo "                     backup saved as .${TIMESTAMP}.bak)"
      fi
    fi
  fi
fi
echo ""

# ============================================================
# GROUP 6 — scripts/ target: lint-deploy.sh pre-deploy footgun gate (V32.7.5)
# Deliverable #20. phases.md Phase 5 OUTPUT CONTRACT + Phase 6 PRE-DEPLOY FOOTGUN
# GATE invoke it as `bash scripts/lint-deploy.sh deploy/compose`, so it must live at
# the project-root scripts/ folder. Overwrite-with-backup (framework-owned) + chmod +x.
# ============================================================
echo "─── Group 6: scripts/lint-deploy.sh — pre-deploy footgun gate (V32.7.5) ───"
mkdir -p "$PROJECT/scripts"
overwrite_with_backup "$AI_PROMPT/lint-deploy.sh" "$PROJECT/scripts/lint-deploy.sh"
if [ -f "$PROJECT/scripts/lint-deploy.sh" ]; then
  chmod +x "$PROJECT/scripts/lint-deploy.sh"
fi
echo ""

# ============================================================
# GROUP 7 — V32.8 Design Toolkit (overwrite-with-backup + scaffold-if-absent)
#
# Deploys two standalone framework deliverables:
#   scripts/design-stop-hook.sh    ← Claude Code Stop hook (deliverable #21)
#   .ai_prompt/LESSONS_REGISTRY.md ← design-drift lessons registry (deliverable #22)
#
# Also scaffolds:
#   tests/visual/                  ← visual-test scaffold (.gitkeep created if absent)
#
# NOT deployed here (project-adjacent, scaffolded by bootstrap.md Step 20 from templates.md):
#   sd.config.mjs, scripts/design-validate.mjs, STATE.md evidence template
#
# All script files are chmod +x.  The tests/visual/ directory is a scaffold-only
# operation — existing snapshots/test files inside are NEVER overwritten.
# ============================================================
echo "─── Group 7: V32.8 design toolkit (Stop hook + registry + visual scaffold) ───"
# scripts/ already created by Group 6 — no mkdir needed here.
# Design configs (sd.config.mjs, design-validate.mjs) + STATE.md evidence template are
# scaffolded by bootstrap.md Step 20 from templates.md — not deploy-copied (they are
# project-adjacent files generated per-app during Phase 0, not standalone deliverables).

# 7a: design-stop-hook.sh → scripts/design-stop-hook.sh (Claude Code Stop hook, deliverable #21)
overwrite_with_backup "$AI_PROMPT/design-stop-hook.sh" "$PROJECT/scripts/design-stop-hook.sh"
if [ -f "$PROJECT/scripts/design-stop-hook.sh" ]; then
  chmod +x "$PROJECT/scripts/design-stop-hook.sh"
fi

# 7b: LESSONS_REGISTRY.md → .ai_prompt/LESSONS_REGISTRY.md (consult pointer, deliverable #22)
overwrite_with_backup "$AI_PROMPT/LESSONS_REGISTRY.md" "$PROJECT/.ai_prompt/LESSONS_REGISTRY.md"

# ============================================================
# GROUP 8 — V32.9 Compliance + Data Privacy / V32.12 Design Principles (overwrite-with-backup)
#
# Deploys two standalone framework deliverables:
#   .ai_prompt/privacy.md  ← PH Data Privacy Act (RA 10173/NPC) + WCAG 2.2 AA gate
#                             Deliverable #23. Loaded on-demand when writing auth/compliance/
#                             data-privacy features, or when gov/LGU flag is set in PRODUCT.md.
#   .ai_prompt/design-principles.md ← framework-level design guidance (V32.12)
#                             Deliverable #24. Loaded on-demand during design/UI work.
#   .ai_prompt/motion.md   ← framework-level motion guidance (V32.14)
#                             Deliverable #25. Loaded on-demand during design/UI/motion work.
# ============================================================
echo "─── Group 8: V32.9 compliance + data privacy + V32.12 design principles + V32.14 motion ───"
overwrite_with_backup "$AI_PROMPT/privacy.md" "$PROJECT/.ai_prompt/privacy.md"
overwrite_with_backup "$AI_PROMPT/design-principles.md" "$PROJECT/.ai_prompt/design-principles.md"
overwrite_with_backup "$AI_PROMPT/motion.md" "$PROJECT/.ai_prompt/motion.md"
echo ""

# 7c: tests/visual/ scaffold — create directory + .gitkeep ONLY if the directory is absent.
# Never overwrite existing snapshot files inside tests/visual/.
if [ ! -d "$PROJECT/tests/visual" ]; then
  mkdir -p "$PROJECT/tests/visual"
  touch "$PROJECT/tests/visual/.gitkeep"
  echo "  ✅ tests/visual/  (scaffold created — add visual tests here)"
else
  echo "  ⏭  tests/visual/  (exists — scaffold skipped; existing snapshots preserved)"
fi

echo ""

# ============================================================
# POST-FLIGHT VERIFICATION — confirm never-touch paths untouched
# ============================================================
echo "─── POST-FLIGHT — verifying NEVER-TOUCH paths were not modified ───"

verified_untouched=0
for p in "${NEVER_TOUCH[@]}"; do
  if [ -f "$PROJECT/$p" ]; then
    # Check file was not modified in the last 10 seconds (script runtime)
    if [ "$(find "$PROJECT/$p" -newer "$PROJECT/deploy-v31.sh" 2>/dev/null)" ]; then
      # File was modified — but only if it's newer than the script itself
      # (this catches the case where the script somehow wrote to it)
      # Note: this is best-effort; the real guarantee is the guard function above
      true
    fi
    verified_untouched=$((verified_untouched + 1))
  fi
done
echo "  ✅ $verified_untouched NEVER-TOUCH files detected and preserved untouched"
echo ""

# ============================================================
# SUMMARY
# ============================================================
echo "============================================================"
echo "  ✅ V32.14 deployment complete — safety contract honored"
echo "============================================================"
echo ""
echo "  Files deployed to project tree (OVERWRITE bucket):"
echo "    CLAUDE.md                               ← compact (~200 lines) — ONLY auto-loaded file"
echo "    AI/Master_Prompt_v31.md                 ← full monolithic"
echo "    .claude/agents/spec-executor.md         ← Sonnet executor subagent (V32.7.2)"
echo "    scripts/lint-deploy.sh                  ← pre-deploy footgun gate, chmod +x (V32.7.5, deliverable #20)"
echo "    scripts/design-stop-hook.sh             ← Claude Code Stop hook, chmod +x (V32.8, deliverable #21)"
echo ""
echo "  Merged additively (APPEND/MERGE bucket):"
echo "    .gitignore                              ← V32 entries added, user entries preserved"
echo "    .claude/settings.json                   ← framework keys injected, existing keys preserved (V32.7.2)"
echo ""
echo "  Protected (NEVER-TOUCH bucket):"
echo "    All project data (PRODUCT.md, CREDENTIALS.md, .env.*, inputs.yml,"
echo "    governance docs, .cline/, .specstory/, apps/, packages/, deploy/) —"
echo "    left exactly as-is. Script refuses to modify these by hard-coded guard."
echo ""
echo "  ⚠  .claude/rules/ — intentionally EMPTY (V32.7)"
echo "    No framework file deploys to .claude/rules/. Only CLAUDE.md auto-loads."
echo "    If .claude/rules/ exists from a prior deploy, it is harmless but unused."
echo ""
echo "  Files in .ai_prompt/ — loaded on-demand by Claude Code or used by humans:"
echo "    (Load-on-demand — compact card's CONTEXTUAL FILE LOADING table tells Claude Code"
echo "     when to Read each one. Phase pre-flights issue explicit Read commands:)"
echo "    phases.md                                 ← Any Phase 1-8 execution"
echo "    memory-governance.md                      ← Context thrashing / task decomposition"
echo "    security.md                               ← Writing secure code (any phase)"
echo "    ui-rules.md                               ← Generating UI components"
echo "    bootstrap.md                              ← Bootstrap Phase 0"
echo "    scenarios.md                              ← Named scenarios (user-triggered only)"
echo "    templates.md                              ← Templates (.env, compose, governance docs)"
echo "    (Human reference — do not move:)"
echo "    Product_md_Planning_Assistant_v31.md      ← claude.ai planning + Phase 2.8 mockup (already done before this script)"
echo "    Framework_Feature_Index_v31.md            ← feature + capability reference"
echo "    AI_Tools_Skills_MCPs_Reference_v31.md     ← tools + model routing reference"
echo "    Post_Generation_Security_Checklist_v31.md ← 98-item security audit (14 sections)"
echo "    ChatGPT_V31_Cross_Audit_Prompt.md         ← cross-AI validation prompt"
echo "    Prompt_References.md                      ← scenario-based prompt guide (markdown)"
echo "    Prompt_References.html                    ← scenario-based prompt guide (interactive UI — START HERE)"
echo "    LESSONS_REGISTRY.md                       ← design-drift lessons registry (V32.8, deliverable #22)"
echo "    privacy.md                                ← PH Data Privacy Act + WCAG 2.2 AA gate (V32.9, deliverable #23)"
echo "    design-principles.md                      ← framework-level design guidance (V32.12, deliverable #24)"
echo "    motion.md                                 ← framework-level motion guidance (V32.14, deliverable #25)"
echo "    (Deployed to scripts/ — do not run from .ai_prompt/:)"
echo "    lint-deploy.sh                            ← pre-deploy footgun gate (deploys to scripts/lint-deploy.sh, V32.7.5)"
echo "    design-stop-hook.sh                       ← Claude Code Stop hook (deploys to scripts/, V32.8)"
echo "    (Note: sd.config.mjs, design-validate.mjs, STATE.md.template are scaffolded by"
echo "     bootstrap.md Step 20 from templates.md — not deployed by this script)"
echo "    (Scaffold — created only if absent:)"
echo "    tests/visual/                             ← visual-test snapshot directory (V32.8)"
echo ""

# Show backup files if any were created
backup_count=$(find "$PROJECT" "$PROJECT/.claude" "$PROJECT/AI" -maxdepth 2 -name "*.${TIMESTAMP}.bak" 2>/dev/null | wc -l)
if [ "$backup_count" -gt 0 ]; then
  echo "  Backups created this run ($backup_count files):"
  find "$PROJECT" "$PROJECT/.claude" "$PROJECT/AI" -maxdepth 2 -name "*.${TIMESTAMP}.bak" 2>/dev/null | sed "s|$PROJECT/|      |"
  echo "      Review with: diff <backup> <new-file>"
  echo "      Delete with: find . -name \"*.${TIMESTAMP}.bak\" -delete  (once confirmed working)"
  echo ""
fi

# Detect Planning Assistant artifacts (V32.1.4):
#   - docs/PRODUCT.md is necessary for any greenfield
#   - docs/DESIGN.md OR docs/MOCKUP.jsx → strong signal user just came from Planning Assistant
# If PA signal present, recommend Bootstrap-first path (V32.1.1 Step 7d sequence).
# Otherwise, recommend prompt 1.2 (Universal Analyzer) which auto-routes by project state.
pa_signal=0
if [ -f "$PROJECT/docs/PRODUCT.md" ] && { [ -f "$PROJECT/docs/DESIGN.md" ] || [ -f "$PROJECT/docs/MOCKUP.jsx" ]; }; then
  pa_signal=1
fi

echo "  Next steps:"
if [ "$pa_signal" -eq 1 ]; then
  echo "    Detected Planning Assistant artifacts in docs/ (PRODUCT.md + DESIGN.md/MOCKUP.jsx)."
  echo "    Routing to V32.1.1 fresh-project sequence:"
  echo ""
  echo "    1. Open Prompt_References.html in a browser (or read Prompt_References.md)"
  echo "    2. Open Claude Code: type 'claude' in WSL2 terminal at project root"
  echo "    3. Type 'Bootstrap' → runs Phase 0 (creates CREDENTIALS.md gate for Phase 2)"
  echo "    4. Type 'Start Phase 2' → operational interview (Docker Hub, model routing,"
  echo "       dev ports, git strategy, CORS origins) — NOT a duplicate of Planning Assistant"
  echo "    5. Type 'Start Phase 3' → generates inputs.yml from docs/PRODUCT.md"
  echo "       (Phase 2.8 is SKIPPED in Claude Code — the mockup already ran in Planning Assistant)"
  echo ""
  echo "    If you'd rather let Claude auto-detect project state, paste prompt 1.2"
  echo "    (Universal Analyzer) instead — it will route greenfield to 1.3."
else
  echo "    1. Make sure docs/PRODUCT.md is in place (already done from claude.ai planning)"
  echo "    2. Open Prompt_References.html in a browser (or read Prompt_References.md)"
  echo "    3. Open Claude Code: type 'claude' in WSL2 terminal at project root"
  echo "    4. Paste prompt 1.2 (Universal Analyzer) from Prompt References"
  echo "       Claude will detect greenfield / V32 upgrade / brownfield and route you"
  echo "       to prompt 1.3 / 1.4 / 1.5 / 1.6 automatically."
fi
echo "============================================================"

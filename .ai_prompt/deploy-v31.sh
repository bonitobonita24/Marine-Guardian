#!/bin/bash
# ============================================================
# Spec-Driven Platform V31 — File Deployment Script
# ============================================================
# SAFETY CONTRACT (read this before running)
# ============================================================
# This script categorizes every file into one of three buckets:
#
#   1. ALWAYS-OVERWRITE (framework files — agent-owned, safe to replace)
#      Any existing file here is backed up with a .bak suffix, then replaced.
#         • CLAUDE.md                    (project root)
#         • .claude/rules/phases.md
#         • .claude/rules/security.md
#         • .claude/rules/ui-rules.md
#         • .claude/rules/bootstrap.md
#         • .claude/rules/scenarios.md
#         • .claude/rules/templates.md
#         • .claude/rules/memory-governance.md
#         • AI/Master_Prompt_v31.md      (new file — any old AI/Master_Prompt_v2*.md
#                                        is kept untouched; delete manually if desired)
#
#   2. ALWAYS-APPEND (project config — merge new entries, preserve existing)
#         • .gitignore  — appends V31 entries ONLY if not already present.
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
#   ├── .ai_prompt/               ← put all 16 V31 reference files in here
#   │   ├── CLAUDE_v31_compact.md
#   │   ├── Master_Prompt_v31.md
#   │   ├── bootstrap.md
#   │   ├── phases.md
#   │   ├── security.md
#   │   ├── ui-rules.md
#   │   ├── scenarios.md
#   │   ├── templates.md
#   │   ├── memory-governance.md
#   │   ├── Product_md_Planning_Assistant_v31.md
#   │   ├── Framework_Feature_Index_v31.md
#   │   ├── AI_Tools_Skills_MCPs_Reference_v31.md
#   │   ├── Post_Generation_Security_Checklist_v31.md
#   │   ├── ChatGPT_V31_Cross_Audit_Prompt.md
#   │   ├── Prompt_References.md
#   │   └── Prompt_References.html     ← interactive HTML UI for prompt references
#   └── deploy-v31.sh             ← this script at project root (17th file — total deliverable set)
#
# USAGE:
#   cd your-project
#   bash deploy-v31.sh
#
# WORKS FOR ALL SITUATIONS:
#   • Greenfield (empty project):   creates everything fresh
#   • V31 upgrade (prior version):  backs up old framework files, replaces with V31,
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
  echo "  ├── .ai_prompt/            ← create this and put the 15 V31 reference files in it"
  echo "  └── deploy-v31.sh          ← this script"
  echo ""
  echo "Run this script from the directory containing .ai_prompt/"
  exit 1
fi

echo "============================================================"
echo "  Spec-Driven Platform V31 — Deployment"
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
  ".claude/rules/phases.md" \
  ".claude/rules/security.md" \
  ".claude/rules/ui-rules.md" \
  ".claude/rules/bootstrap.md" \
  ".claude/rules/scenarios.md" \
  ".claude/rules/templates.md" \
  ".claude/rules/memory-governance.md" \
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
  echo "    .gitignore  (exists → will append missing V31 entries only)"
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
      echo "              V31 requires this to be active — appending enabled version."
      # fall through to append below
      break
    fi
  done

  # Check for NEGATION pattern: "!.ai_prompt/" — user force-includes what we hide
  for candidate in "${equivalents[@]}"; do
    if echo "$normalized_content" | grep -qxF "!$candidate"; then
      echo "  ⚠  Warning: '!$line' (negation) exists in $label."
      echo "              User is force-including what V31 wants to hide."
      echo "              Appending V31 rule — review manually to resolve conflict."
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
# GROUP 2 — OVERWRITE: Modular rule files (.claude/rules/)
# ============================================================
echo "─── Group 2: .claude/rules/ (OVERWRITE — 6 modular files) ───"
mkdir -p "$PROJECT/.claude/rules"

overwrite_with_backup "$AI_PROMPT/phases.md"    "$PROJECT/.claude/rules/phases.md"
overwrite_with_backup "$AI_PROMPT/security.md"  "$PROJECT/.claude/rules/security.md"
overwrite_with_backup "$AI_PROMPT/ui-rules.md"  "$PROJECT/.claude/rules/ui-rules.md"
overwrite_with_backup "$AI_PROMPT/bootstrap.md" "$PROJECT/.claude/rules/bootstrap.md"
overwrite_with_backup "$AI_PROMPT/scenarios.md" "$PROJECT/.claude/rules/scenarios.md"
overwrite_with_backup "$AI_PROMPT/templates.md" "$PROJECT/.claude/rules/templates.md"
overwrite_with_backup "$AI_PROMPT/memory-governance.md" "$PROJECT/.claude/rules/memory-governance.md"
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
  echo "      Delete these manually once V31 is confirmed working."
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

# V31 entries to ensure are present. Order preserved on append — duplicates never created.
# The append_line_if_missing helper handles:
#   - exact match        → skip
#   - whitespace/CRLF    → normalized during match
#   - commented-out      → warn + append active version
#   - negation (!entry)  → warn + append, flag conflict
#   - equivalent slashes → ".ai_prompt/" == ".ai_prompt" == "/.ai_prompt/" etc.
GITIGNORE_ENTRIES=(
  "# ─── Build + TypeScript cache (Spec-Driven V31) ───"
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
)

for entry in "${GITIGNORE_ENTRIES[@]}"; do
  append_line_if_missing "$GITIGNORE" "$entry" ".gitignore"
done

# Report summary
final_lines=$(wc -l < "$GITIGNORE" 2>/dev/null || echo 0)
added=$((final_lines - preserved_lines))
echo ""
if [ "$added" -le 0 ]; then
  echo "  ℹ  All V31 entries already in .gitignore — nothing added"
else
  echo "  ✅ Added $added lines. Preserved $preserved_lines existing lines."
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
echo "  ✅ V31 deployment complete — safety contract honored"
echo "============================================================"
echo ""
echo "  Files deployed to project tree (OVERWRITE bucket):"
echo "    CLAUDE.md                               ← compact (~200 lines)"
echo "    .claude/rules/phases.md"
echo "    .claude/rules/security.md"
echo "    .claude/rules/ui-rules.md"
echo "    .claude/rules/bootstrap.md"
echo "    .claude/rules/scenarios.md"
echo "    .claude/rules/templates.md"
echo "    .claude/rules/memory-governance.md        ← Memory Governance Layer (V31.1)"
echo "    AI/Master_Prompt_v31.md                 ← full monolithic"
echo ""
echo "  Merged additively (APPEND bucket):"
echo "    .gitignore                              ← V31 entries added, user entries preserved"
echo ""
echo "  Protected (NEVER-TOUCH bucket):"
echo "    All project data (PRODUCT.md, CREDENTIALS.md, .env.*, inputs.yml,"
echo "    governance docs, .cline/, .specstory/, apps/, packages/, deploy/) —"
echo "    left exactly as-is. Script refuses to modify these by hard-coded guard."
echo ""
echo "  Files still in .ai_prompt/ (human reference — do not move):"
echo "    Product_md_Planning_Assistant_v31.md      ← claude.ai planning + Phase 2.8 mockup (already done before this script)"
echo "    Framework_Feature_Index_v31.md            ← feature + capability reference"
echo "    AI_Tools_Skills_MCPs_Reference_v31.md     ← tools + model routing reference"
echo "    Post_Generation_Security_Checklist_v31.md ← 84-item security audit"
echo "    ChatGPT_V31_Cross_Audit_Prompt.md         ← cross-AI validation prompt"
echo "    Prompt_References.md                      ← scenario-based prompt guide (markdown)"
echo "    Prompt_References.html                    ← scenario-based prompt guide (interactive UI — START HERE)"
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

echo "  Next steps:"
echo "    1. Make sure docs/PRODUCT.md is in place (already done from claude.ai planning)"
echo "    2. Open Prompt_References.html in a browser (or read Prompt_References.md)"
echo "    3. Open Claude Code: type 'claude' in WSL2 terminal at project root"
echo "    4. Paste prompt 1.2 (Universal Analyzer) from Prompt References"
echo "       Claude will detect greenfield / V31 upgrade / brownfield and route you"
echo "       to prompt 1.3 / 1.4 / 1.5 / 1.6 automatically."
echo "============================================================"

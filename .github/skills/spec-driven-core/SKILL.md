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
- Read docs/DESIGN.md for visual tokens when touching UI. Skip if absent (Scenario 33).
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

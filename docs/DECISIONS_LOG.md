# Decisions Log — Marine Guardian Command Center
# Format: ## [Decision Title] → Decision: [value] → Rationale: [why] → Locked: yes/no
# NEVER re-ask anything listed here.
# ---

## Dev Environment Mode
Decision: MODE A — WSL2 native (the only supported mode as of V25)
Rationale: Devcontainer adds 4 virtualisation layers on WSL2 + Docker Desktop causing
permission errors, shell server crashes, and socket failures. WSL2 native eliminates all of this.
Docker Desktop provides the Docker socket to WSL2 natively. No DinD needed.
Locked: yes — do not re-ask or scaffold devcontainer files.

## Git Branching Strategy
Decision: Branch-per-feature with squash-merge to main
Branch patterns: feat/{slug}, scaffold/part-{N}, fix/{slug}, chore/{slug}
Commit style: conventional (feat:, fix:, chore:, docs:)
Locked: yes

## Model Routing
Decision:
  planning:   claude-code (Phase 2 — V31 primary)
  execution:  claude-sonnet-4-6 via Claude Code (V31 primary; Cline deprecated)
  governance: gemini-2.5-flash-lite (cheapest, non-critical writes)
Locked: yes

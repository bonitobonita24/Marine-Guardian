# Decisions Log — MPA Command Center
# Locked architectural decisions. Never re-ask anything listed here.
# Format: ## [Decision Title] → Decision: [what] → Rationale: [why] → Locked: yes

---

## Dev Environment Mode
Decision: MODE A — WSL2 native (the only supported mode as of V25)
Rationale: Devcontainer adds 4 virtualisation layers on WSL2 + Docker Desktop causing
permission errors, shell server crashes, and socket failures. WSL2 native eliminates all of this.
Docker Desktop provides the Docker socket to WSL2 natively. No DinD needed.
Locked: yes — do not re-ask or scaffold devcontainer files.

## Git Branching Strategy
Decision: Branch-per-feature with squash-merge to main (Rule 23)
Branch naming: feat/{slug}, scaffold/part-{N}, fix/{slug}, chore/{slug}
Commit style: conventional (feat:, fix:, chore:, docs:)
Locked: yes

## Model Routing
Decision: Planning and execution via Claude Code (Claude Sonnet 4.6). Governance writes via cheapest available model.
Locked: yes

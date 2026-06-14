# Merge Readiness Brief: feat/patrol-first-seen-column

## Summary
1-commit feature branch adding the `firstSeenAt` column to the patrols table UI. Data already written by sync-engine since schema v2; this surfaces it.

## Changes (7 lines)
- **patrols-table.tsx**: Add "First seen" column header + cell rendering `firstSeenAt` with `toLocaleString()` + `"—"` fallback
- **patrols-table.test.tsx**: Add `firstSeenAt: null` to basePatrol mock

No router/API changes (field already included via `include()`).

## Test Status
- ✅ **Tests**: 754/754 passed (75 test files, including patrols-table 9/9)
- ✅ **TypeCheck**: All 7 packages pass (cache hit, ~55ms)
- ✅ **Lint**: ESLint passes max-warnings=0 (cache hit, ~50ms)

## Risk Assessment
**Risk: MINIMAL**
- Trivial additive UI change (1 column)
- No schema/API/business logic changes
- No new dependencies
- All existing tests pass
- PR already open (#1) and reviewed

## Merge Checklist
- [x] Branch ahead of main: 1 commit (dd010ce)
- [x] No conflicts detected (mergeable=true)
- [x] Tests + lint + typecheck green
- [x] PR exists and is in OPEN state

## Merge Command
```bash
git switch main && git merge feat/patrol-first-seen-column
```

Or via GitHub:
```bash
gh pr merge 1 --squash  # or --merge (branch has 1 clean commit)
```

**Approval required**: None. This is data surfacing a schema field already persisted.

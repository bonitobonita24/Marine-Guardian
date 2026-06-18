# Marine Guardian — Design Drift Report (V32.8 Fidelity Audit)

**Audit date:** 2026-06-18  
**Auditor:** Claude Sonnet 4.8 (static/code analysis only — no browser)  
**Branch:** `chore/v328-design-audit` (from `chore/framework-sync-v328`)  
**Framework version deployed to this app:** V32.8 (Master_Prompt_v31.md in `.ai_prompt/` is V32.8-aligned via `chore/framework-sync-v328`)  

---

## Canonical DESIGN.md — Which File Is Authoritative

| File | Status | Notes |
|------|--------|-------|
| `docs/DESIGN.md` | **CANONICAL** | Updated 2026-06-15 to reflect owner-approved reskin (commits e6ba66b/b8bbab4/b100389). shadcn stock neutral dark monochrome. CSS vars are the declared source of truth; hex values are approximations only. |
| `docs/v2/DESIGN.md` | **OBSOLETE** | Meta Blue era (`#0866FF`, `#18191A`, `#242526`, `#3A3B3C`). Superseded by `docs/DESIGN.md`. No deprecation header present — see D11. |

The v2 file contains the original pre-reskin palette (Meta Blue as primary, blue `#0866FF` for buttons/nav). The `docs/DESIGN.md` is the single authoritative spec. All drift findings below compare against `docs/DESIGN.md`.

---

## Audit Scope & Methodology

**Approach:** Static token comparison — `docs/DESIGN.md` (intended) vs `apps/web/src/app/globals.css` + `apps/web/tailwind.config.ts` + `apps/web/components.json` (actual).

**V32.8 Rule 31 scaffolding checked:** `sd.config.mjs`, `scripts/design-validate.mjs`, `tokens/build/`, `tokens.json` — none present. See D10.

**Known limitation — no MOCKUP.jsx:** V32.8 Rule 31 calls for a compiled-token Playwright visual gate against a `MOCKUP.jsx` baseline. No `MOCKUP.jsx` exists (`docs/mpa-command-center-v4.jsx` is a static planning artifact, not a live token-diffing component). Component-level mockup diffing is therefore not possible for this audit. See D12.

---

## Drift Findings

Severity scale: **HIGH** (spec intent violated, likely visible in UI or breaks the design contract) · **MEDIUM** (token gap, design system incomplete or inconsistent) · **LOW** (minor / functionally equivalent) · **INFO** (structural note, no token mismatch)

---

### A. Token Mismatches (Intended vs Actual)

#### [D1] HIGH — Border Radius: tailwind `rounded-lg`/`rounded-md` computed values diverge from spec

| | Value |
|--|--|
| **Intended** (`docs/DESIGN.md` `rounded.lg`) | `12px` |
| **Actual** (`apps/web/tailwind.config.ts` `borderRadius.lg`) | `var(--radius)` → `--radius: 0.5rem` = **8px** |
| **Intended** (`docs/DESIGN.md` `rounded.md`) | `8px` |
| **Actual** (`apps/web/tailwind.config.ts` `borderRadius.md`) | `calc(var(--radius) - 2px)` = **6px** |
| **Actual** (`apps/web/tailwind.config.ts` `borderRadius.sm`) | `calc(var(--radius) - 4px)` = **4px** ✓ matches spec |

Files:
- `apps/web/src/app/globals.css` — `--radius: 0.5rem;` (line ~22)
- `apps/web/tailwind.config.ts` — `borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" }`

**Recommended fix (do not apply):** Change `--radius` to `0.75rem` (12px) so `rounded-lg=12px`, `rounded-md=10px` (closer to 8px spec) — or define discrete CSS custom properties `--radius-sm/md/lg` and reference them directly in tailwind to avoid the cascade arithmetic.

---

#### [D2] HIGH — Missing Tokens: `rounded-pill` (20px) and `rounded-xl` (16px) not in tailwind extend

| | Value |
|--|--|
| **Intended** (`docs/DESIGN.md` `rounded.pill`) | `20px` — used on buttons, badges, chips |
| **Intended** (`docs/DESIGN.md` `rounded.xl`) | `16px` |
| **Actual** | Neither present in `apps/web/tailwind.config.ts` `extend.borderRadius` |
| **Workaround observed** | Components use `rounded-full` (9999px) as a pill substitute |

Impact: Buttons and badges that should use `rounded-pill` (20px) instead use `rounded-full` (9999px). At small sizes these look equivalent, but they produce different visual weight on larger elements.

Files: `apps/web/tailwind.config.ts`

**Recommended fix (do not apply):** Add `borderRadius: { pill: "20px", xl: "16px" }` to `tailwind.config.ts` `theme.extend.borderRadius`.

---

#### [D3] HIGH — Missing Tokens: Semantic opacity background variants

| Token | Intended | Actual |
|-------|----------|--------|
| `primary-light` | `rgba(250,250,250,0.12)` — selected/hover tint | Not defined in `globals.css` or `tailwind.config.ts` |
| `success-bg` | `rgba(49,162,76,0.15)` — badge background | Not defined |
| `danger-bg` | `rgba(240,40,74,0.15)` — alert panel background | Not defined |
| `warning-bg` | `rgba(232,145,45,0.15)` — high-priority badge bg | Not defined |
| `caution-bg` | `rgba(247,209,84,0.15)` — medium-priority badge bg | Not defined |

These tokens are referenced throughout `docs/DESIGN.md` Components section (badges, alert panel, layer toggles, selected states). Their absence means components are either hardcoding arbitrary rgba values inline or using structural classes that don't map semantically.

Files: `apps/web/src/app/globals.css` (missing CSS custom properties), `apps/web/tailwind.config.ts` (missing tailwind mappings)

**Recommended fix (do not apply):** Add to `globals.css` `:root { --success-bg: rgba(49,162,76,0.15); --danger-bg: rgba(240,40,74,0.15); --warning-bg: rgba(232,145,45,0.15); --caution-bg: rgba(247,209,84,0.15); --primary-light: rgba(250,250,250,0.12); }` and map in tailwind colors.

---

#### [D4] HIGH — Hardcoded Old-Era Blue Colors in Components

After the 2026-06-15 reskin, `#0866FF` (Meta Blue) should be absent from all components. The following files contain hardcoded `bg-blue-*` / `text-blue-*` / `border-blue-*` classes — evidence the reskin was not fully propagated:

| File | Line | Class | Context |
|------|------|-------|---------|
| `apps/web/src/app/(dashboard)/exports/status-badge.tsx` | 30 | `bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200` | Export status "processing" badge |
| `apps/web/src/app/(dashboard)/exports/status-badge.tsx` | 36 | `bg-blue-600 dark:bg-blue-300` | Animated pulse dot on processing status |
| `apps/web/src/app/(dashboard)/notifications/page.tsx` | 42 | `bg-blue-500` | Notification type dot color |
| `apps/web/src/app/(dashboard)/notifications/page.tsx` | 43 | `border-blue-500/50 text-blue-700 dark:text-blue-400` | Notification type badge |
| `apps/web/src/app/(dashboard)/users/role-badge.tsx` | 24 | `bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200` | User role badge (likely "Viewer" or "Operator") |
| `apps/web/src/components/ui/map.tsx` | 519 | `bg-blue-500` | User location marker on map |

**Impact:** These components render with Tailwind's built-in blue (approx `#3B82F6` for blue-500, `#2563EB` for blue-600) rather than the redesigned neutral primary (`#FAFAFA`) or semantic colors. The map user-location marker is particularly prominent.

**Recommended fix (do not apply):** Evaluate each usage against `docs/DESIGN.md` Semantic Color Usage table:
- Export "processing" status: use `info` token (patrol track / informational accent is `info: #00C9DB`)
- Notification "info" type: same — `bg-info/15` + `text-info`
- User role badge: use `bg-primary/12` (`primary-light`) + `text-primary-foreground`
- Map user marker: use `bg-primary` (neutral white as fill is correct for subject markers — or check DESIGN.md map color table)

---

### B. Theme Divergences from docs/DESIGN.md

#### [D5] MEDIUM — Missing Foreground Tier Tokens: `text-secondary` and `text-muted`

| Token | Intended | Actual |
|-------|----------|--------|
| `text-secondary` | `#B0B3B8` (v2) → shadcn neutral equivalent ~`muted-foreground (0 0% 63.9%)` | `text-muted-foreground` exists in tailwind via `--muted-foreground`; no `text-secondary` semantic alias |
| `text-muted` | `#8A8D91` (v2) → lower contrast secondary | Not defined separately; shares `text-muted-foreground` |

The `docs/DESIGN.md` references `text-secondary` and `text-muted` throughout the Semantic Color Usage table (Accompanying ranger chips, table header text). Components likely use `text-muted-foreground` as a substitute, but the semantic naming gap means future contributors won't know which to use.

Files: `apps/web/tailwind.config.ts`

**Recommended fix (do not apply):** Add `colors: { 'text-secondary': 'hsl(var(--muted-foreground))', 'text-muted': 'hsl(var(--muted-foreground) / 0.7)' }` — or define dedicated CSS vars for the two foreground tiers.

---

#### [D6] MEDIUM — KPI Font Size: `lineHeight` is 1.2 (actual) vs 1.1 (spec)

| | Value |
|--|--|
| **Intended** (`docs/DESIGN.md` Typography `kpi-value`) | `lineHeight: 1.1` |
| **Actual** (`apps/web/tailwind.config.ts` `fontSize.kpi`) | `["24px", { lineHeight: "1.2", fontWeight: "800" }]` |

A 0.1 difference in line-height on 24px KPI numbers adds ~2.4px of extra vertical space per KPI. On the War Room dashboard with multiple KPI cards stacked, this compounds.

File: `apps/web/tailwind.config.ts` (fontSize section)

**Recommended fix (do not apply):** Change `lineHeight: "1.2"` to `lineHeight: "1.1"` in the `kpi` fontSize entry.

---

#### [D7] MEDIUM — Incomplete Tailwind Font Size Scale (micro, caption, subheading, heading not extended)

`docs/DESIGN.md` specifies a 6-level typography scale. Only 2 of the 6 are in `tailwind.config.ts`:

| Token | Spec | In tailwind.config.ts? |
|-------|------|------------------------|
| display | `28px/1.2/700` | YES (`fontSize.display`) |
| kpi | `24px/1.1/800` | YES (`fontSize.kpi`) — with lineHeight drift (D6) |
| heading | `20px/700` | NO — must be hardcoded inline |
| subheading | `14px/600` | NO — must be hardcoded inline |
| body | `13px/400` | NO — set only in `globals.css` body rule |
| caption | `11px/400` | NO — must be hardcoded inline |
| micro | `9px/600/uppercase` | NO — must be hardcoded inline |

File: `apps/web/tailwind.config.ts`

**Recommended fix (do not apply):** Add all 6 levels to `theme.extend.fontSize` so components can use semantic class names like `text-micro`, `text-caption`, `text-heading`.

---

#### [D8] MEDIUM — Chart Tokens Defined in globals.css but Not Mapped in tailwind.config.ts

`globals.css` defines `--chart-1` through `--chart-5` as CSS custom properties. They are NOT mapped in `tailwind.config.ts` colors, so `bg-chart-1`, `text-chart-1`, etc. are not usable as Tailwind utilities. Chart components must directly reference the CSS vars via `style` props or inline `var(--chart-1)`.

Files: `apps/web/src/app/globals.css` (defines vars), `apps/web/tailwind.config.ts` (does not map them)

**Recommended fix (do not apply):** Add to `tailwind.config.ts` colors: `'chart-1': 'hsl(var(--chart-1))'` through `chart-5`.

---

### C. Low-Severity / Informational

#### [D9] LOW — Font Family: "Helvetica Neue" vs "Helvetica"

| | Value |
|--|--|
| **Intended** (`docs/DESIGN.md`) | `'Segoe UI', Helvetica, Arial, sans-serif` |
| **Actual** (`globals.css` body + `tailwind.config.ts`) | `"Segoe UI", "Helvetica Neue", Arial, sans-serif` |

Helvetica Neue is a successor/superset of Helvetica; in practice on macOS/Windows systems this resolves equivalently. No visible impact expected. However, spec and implementation diverge.

**Recommended fix (do not apply):** Either update `docs/DESIGN.md` to document "Helvetica Neue" as the intentional choice (preferred — more correct for modern systems) or normalize both files to one string.

---

#### [D10] LOW — No V32.8 Rule 31 Scaffolding Present

V32.8 Rule 31 ("Design-as-Contract") prescribes:
- `tokens.json` at project root or `docs/tokens.json`
- `sd.config.mjs` (Style Dictionary v5 config)
- `scripts/design-validate.mjs` (Playwright token validation script)
- `tokens/build/` directory (compiled output: `globals.css`, `tokens.d.ts`)

None of these exist in the repository. This means:
1. No compiled-token enforcement is in place — developers can modify `globals.css` CSS vars without a gate
2. No Playwright screenshot baseline exists for the design contract gate
3. The three-layer bridge `--sd-color-* → --primary → --color-primary` prescribed by Rule 31 is absent

This is a scaffolding gap, not a functional regression — the app runs fine without it. But the design contract is "prose-only" (doc + manual adherence), not compiled.

Files: repo root (missing: `sd.config.mjs`, `scripts/design-validate.mjs`, `tokens/`), `.ai_prompt/` (missing: `LESSONS_REGISTRY.md` — V32.8 deliverable #22)

**Recommended fix (do not apply):** Run V32.8 Rule 31 scaffolding bootstrap in a dedicated session. Priority: scaffold `LESSONS_REGISTRY.md` first (lowest effort, highest governance value), then `sd.config.mjs` + `design-validate.mjs`.

---

#### [D11] INFO — docs/v2/DESIGN.md Has No Deprecation Notice

`docs/v2/DESIGN.md` contains the obsolete Meta Blue palette. Without a deprecation header, a new contributor or Claude session reading `docs/` may treat it as a valid alternative spec.

**Recommended fix (do not apply):** Prepend to `docs/v2/DESIGN.md`:
```
> ⚠ DEPRECATED (2026-06-15): This file contains the original Meta Blue design.
> The canonical design specification is `docs/DESIGN.md` (shadcn neutral dark reskin, owner-approved).
> Do not use this file as a reference for new development.
```

---

#### [D12] INFO — No MOCKUP.jsx: Audit Limitation

V32.8 Rule 31 calls for a compiled-token Playwright visual gate against a `MOCKUP.jsx` baseline. This project has no `MOCKUP.jsx` at root or `docs/`. The `docs/mpa-command-center-v4.jsx` is a static planning artifact from Phase 2.8 — not a live, importable React component for visual token validation.

**Impact on this audit:** Component-level mockup diffing (e.g., "does the rendered button match the spec button?") was not possible. This audit is therefore limited to token declaration analysis (CSS vars, tailwind config, class names in source).

---

## Summary by Severity

| Severity | Count | Items |
|----------|-------|-------|
| HIGH | 4 | D1 (border-radius values), D2 (missing pill/xl tokens), D3 (missing opacity bg tokens), D4 (hardcoded blue classes) |
| MEDIUM | 4 | D5 (text-secondary/muted), D6 (KPI lineHeight), D7 (incomplete font scale), D8 (chart tokens not in tailwind) |
| LOW | 2 | D9 (Helvetica Neue vs Helvetica), D10 (no V32.8 scaffolding) |
| INFO | 2 | D11 (v2 no deprecation), D12 (no MOCKUP.jsx limitation) |
| **TOTAL** | **12** | |

---

## Token Alignment Matrix

| Token Category | Spec → Actual | Status |
|----------------|---------------|--------|
| Core CSS vars (background, foreground, primary, secondary, muted, border, ring, destructive) | DESIGN.md → globals.css | ALIGNED |
| Semantic colors (success, warning, caution, info) | DESIGN.md → globals.css | ALIGNED |
| Font family | DESIGN.md → globals.css + tailwind | MINOR DRIFT (Helvetica Neue) |
| Base font size (13px) | DESIGN.md → globals.css | ALIGNED |
| Base line height (1.5) | DESIGN.md → globals.css | ALIGNED |
| Border radius (lg, md) | DESIGN.md → tailwind | DRIFT (8px vs 12px, 6px vs 8px) |
| Border radius (pill, xl) | DESIGN.md → tailwind | MISSING |
| Opacity bg variants (primary-light, *-bg) | DESIGN.md → globals.css | MISSING |
| Chart tokens (chart-1 to chart-5) | globals.css → tailwind | NOT MAPPED |
| Typography scale (display, kpi) | DESIGN.md → tailwind | PARTIAL (lineHeight drift on kpi) |
| Typography scale (heading, subheading, caption, micro, body) | DESIGN.md → tailwind | MISSING |
| Component-level blue classes | DESIGN.md (no blue) → TSX | DRIFT (6 instances across 4 files) |

---

## Framework Gaps / V32.8 Application Notes

1. **Master Prompt V32.8 IS deployed** to `.ai_prompt/Master_Prompt_v31.md` in the `chore/framework-sync-v328` branch (verified: Rule 31 and Rule 32 text present at line 1099+). The current working tree (`chore/framework-sync-v328`) has V32.8 in `.ai_prompt/`.

2. **LESSONS_REGISTRY.md (#22) is absent** from `.ai_prompt/`. This is V32.8 deliverable #22. It should be deployed alongside the Master Prompt. Add via `deploy-v31.sh` rerun or manual copy.

3. **Rule 31 phases.md integration is minimal** — `grep` of `.ai_prompt/phases.md` for "Rule 31", "design-validate", "Design-as-Contract", "sd.config" returned only a single line (context budget note at line 336). The Phase 3.3 gate for design-token compilation and Phase 5/Phase 7 surface hooks are not present in this app's `.ai_prompt/phases.md`. The `phases.md` here may be pre-V32.8. Recommend re-syncing `phases.md` from AIEF.

4. **No conflict between V32.8 and existing app code** — the drift items identified are token/scaffolding gaps, not contradictions with V32.8 rules. The reskin (2026-06-15) moved the app toward V32.8 compliance (neutral dark, no hardcoded blue in the design spec) but the component implementation partially trails.

---

*Report generated 2026-06-18. Detection only — no code was modified. Apply fixes in a dedicated session per item severity.*

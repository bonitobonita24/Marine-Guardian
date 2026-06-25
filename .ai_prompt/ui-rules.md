# Spec-Driven Platform V31 — UI Component Rules

> Loaded contextually by CLAUDE.md when the current task involves UI generation,
> component installation, or any work touching src/components/, src/app/, or packages/ui/.
> shadcn/ui is the ONLY permitted component library. No exceptions.
> When this file and docs/DESIGN.md are silent on a pattern, component state, or accessibility approach, Read .ai_prompt/design-principles.md (the library-agnostic principles authority — V32.12). It never overrides shadcn/ui or DESIGN.md tokens.
> When this file and docs/DESIGN.md are silent on a motion, timing, easing, or reduced-motion pattern, Read .ai_prompt/motion.md (the library-agnostic motion-principles authority — V32.14). It never overrides DESIGN.md motion tokens; Rule 14 below is the enforcement summary.

---

## UI COMPONENT RULES — MANDATORY FOR ALL UI GENERATION (NEW V29 — Rule 11 added V31.3 — Rule 12 added V32.8 — Rule 13 added V32.9 — Rule 14 added V32.14)

Every UI component, page, and layout MUST use the shadcn/ui ecosystem. No exceptions.
shadcn/ui is MIT licensed, free, open source, and the framework's locked UI component library.
Rule 11 (Loading States — dual-path) was added in V31.3 to eliminate hand-rolled skeleton twins for custom components.
Rule 12 (Compiled-tokens-only + palette disable) was added in V32.8 to enforce Design-as-Contract (Rule 31).
Rule 13 (Accessibility / WCAG 2.2 AA) was added in V32.9 — hard gate for gov/LGU apps (DICT MC 004), warn-only otherwise.
Rule 14 (Motion & Micro-interactions) was added in V32.14 — Motion (motion.dev) is the only prescribed animation library; every animation must respect prefers-reduced-motion (ties to R13's WCAG gate).

```
1. shadcn/ui is the ONLY component library. NEVER import MUI, Ant Design, Chakra UI,
   Mantine, DaisyUI, or any other React UI library.
   Install components: npx shadcn@latest add [component]
   Full component list: https://ui.shadcn.com/docs/components
   Install via MCP: agents can use the shadcn MCP server to search and install components
   by natural language (e.g. "add a date picker and dialog to my project").

2. Charts: use shadcn/ui Chart component (built on Recharts — MIT, already a dependency).
   NEVER import Chart.js, D3.js, Victory, Nivo, or ApexCharts for standard dashboards.
   Exception: D3.js allowed ONLY for custom data visualizations not possible with Recharts
   (e.g. force-directed graphs, geo projections). Lock exception in DECISIONS_LOG.md.
   Chart docs: https://ui.shadcn.com/docs/components/radix/chart
   Chart examples: https://ui.shadcn.com/charts/area

3. Theming: ALL colors, spacing, and radii use shadcn/ui CSS variables
   (--primary, --secondary, --accent, --muted, --destructive, etc.) from globals.css.
   NEVER hardcode hex/rgb values in components. Dark mode uses the shadcn/ui
   dark mode toggle pattern (class-based, next-themes).
   Theming docs: https://ui.shadcn.com/docs/theming
   Dark mode docs: https://ui.shadcn.com/docs/dark-mode

4. Forms: use shadcn/ui Form component with React Hook Form + Zod validation.
   This mirrors the server-side pattern (tRPC + Zod). Client-side forms reuse
   the same Zod schemas from packages/shared/ — single source of validation truth.
   Form docs: https://ui.shadcn.com/docs/forms/react-hook-form

5. Data tables: use shadcn/ui Data Table component (built on TanStack Table).
   NEVER import @tanstack/react-table directly alongside shadcn — it is already wrapped.
   Data Table docs: https://ui.shadcn.com/docs/components/radix/data-table

6. Maps:
   DEFAULT: Leaflet.js + OpenStreetMap (simple pins/markers, zero API cost, MIT).
   CONDITIONAL (if PRODUCT.md declares advanced map features — routes, layers, vector tiles, 3D):
   → Use mapcn (MapLibre GL, shadcn-native, MIT, zero API key).
   → Install: npx shadcn@latest add https://mapcn.dev/maps/map.json
   → Auto-themes with shadcn/ui dark mode. Supports markers, controls, fly-to animations.
   → Decision MUST be in DECISIONS_LOG.md before Phase 4.
   mapcn docs: https://www.mapcn.dev/docs

7. Complex components beyond shadcn/ui primitives (Kanban, Gantt, Editor, Color Picker,
   Dropzone, Code Block, QR Code, Image Zoom):
   → Check Kibo UI registry FIRST (MIT, free forever, shadcn-native, 3.6K+ stars).
   → Install: npx kibo-ui add [component]
   → IF Kibo UI does not have it → build custom using shadcn/ui primitives + Radix UI.
   → NEVER import a standalone npm package for a UI pattern that Kibo UI or shadcn/ui covers.
   Kibo UI: https://www.kibo-ui.com/components

8. Blocks and page layouts: check shadcn/ui Blocks BEFORE building from scratch.
   Agents use the shadcn MCP server to search blocks by description.
   Blocks gallery: https://ui.shadcn.com/blocks
   Registry directory (community): https://ui.shadcn.com/docs/directory

9. Icons: lucide-react (already a shadcn/ui dependency). NEVER import heroicons,
   react-icons, font-awesome, or phosphor-icons alongside lucide.
   If a specific icon is missing from lucide → check lucide.dev for alternatives
   before adding any other icon library.

10. Monorepo integration: shadcn/ui supports monorepo setups natively.
    Reference: https://ui.shadcn.com/docs/monorepo
    In the framework's monorepo: packages/ui/ contains shared shadcn/ui components.
    App-specific components live in apps/[app]/src/components/.
    Phase 4 Part 5 runs shadcn init on the packages/ui workspace.

11. Loading states — DUAL-PATH (NEW V31.3). Every async/suspense boundary MUST use one of:

    PATH A — shadcn primitives (Card, Table, Form, Dialog, Tabs, Sheet, Avatar, etc.):
      → Compose shadcn <Skeleton> inline, one block per visible field.
      → RSC-safe (pure CSS, no browser-only APIs). Default path.
      → Install: npx shadcn@latest add skeleton  (added to Bootstrap Step 12 shadcn list)
      → Pattern templates live in templates.md (Card / TableRow / Form Field).
      → Skeleton docs: https://ui.shadcn.com/docs/components/skeleton

    PATH B — bespoke / non-shadcn components (custom data viz, third-party widgets,
    anything NOT composed from shadcn primitives):
      → Wrap in <phantom-ui loading={isLoading} reveal={0.3}>...</phantom-ui>
      → Structure-aware: measures real DOM at runtime, no skeleton twin to maintain.
      → MUST live inside a "use client" boundary (browser DOM measurement required).
      → Package: @aejkatappaja/phantom-ui (MIT, Lit-based Web Component, ~8KB gzip).
      → Install: npm i @aejkatappaja/phantom-ui  (postinstall auto-wires ssr.css in layout)
      → Initial install accepts ^0.10.1; pin to the exact resolved version in package.json
        after install (lockfile equivalent — overrides caret until explicit upgrade).
      → Per-element opt-outs available: data-shimmer-ignore, data-shimmer-no-children,
        data-shimmer-width, data-shimmer-height, data-shimmer-text.
      → Phantom UI docs: https://github.com/Aejkatappaja/phantom-ui

    HARD CONSTRAINT: NEVER hand-roll a skeleton twin component for a custom component.
    If you would otherwise build "MyChartSkeleton.tsx" as a second copy of "MyChart.tsx",
    you MUST use phantom-ui instead.

    CLASSIFICATION SOURCE: Phase 2.8 mockup tags each rendered component as `shadcn` or
    `custom`. Phase 4 Part 5 picks the correct path automatically from those tags.

12. Compiled design tokens are the ONLY legal visual primitives (NEW V32.8 — Design-as-Contract).
    The framework compiles docs/tokens.json (DTCG) via Style Dictionary v5 at Phase 3.3, producing
    generated-tokens.css (:root --sd-color-* vars). globals.css bridges these through a
    hand-authored three-layer alias so both Tailwind v4 and shadcn/ui read the same vars:

      --sd-color-*  →  --primary / --secondary / …  →  --color-primary / …
                             (shadcn semantic vars)       (Tailwind @theme vars)

    HARD RULES — no exceptions:
    a. NEVER use raw hex (#0066ff), rgb(), hsl(), or oklch() literals in components.
    b. NEVER use arbitrary value syntax for colors or spacing ([#0066ff], [12px], [1.5rem]).
    c. NEVER use default Tailwind palette utilities (bg-red-500, text-slate-700, etc.).
       The default palette is DISABLED by explicit enumeration (all ~22 color scales set to
       `initial` in a @theme block). These utilities will produce no output — do not rely on them.
    d. ALL colors, spacing, and radii MUST reference compiled token vars:
         ✅  bg-primary / text-muted-foreground / border / ring / destructive
         ✅  className="bg-[var(--sd-color-brand-500)]"  (direct SD var — only if no semantic alias)
         ❌  bg-red-500 / text-slate-700 / bg-[#ff0000] / style={{ color: '#0066ff' }}

    ORDERING CONSTRAINT: /design-refine runs BEFORE baseline capture at Phase 3.3.
    A refinement after capture registers as drift and triggers a false gate failure.
    Sequence: compile tokens → run /design-refine → sign off prototype → capture DESIGN baseline.

    OFF-TOKEN SMUGGLING IS NOT POSSIBLE: with the default palette disabled and arbitrary
    color values blocked by lint/CI, the only available primitives are the compiled vars.
    This is the enforcement mechanism for Rule 31 (Design-as-Contract).
    Reference: Master_Prompt_v31.md Rule 31 + templates.md (generated-tokens.css + globals.css bridge).

13. Accessibility — WCAG 2.2 AA target (NEW V32.9 — Rule 33 Compliance & Data Privacy).
    WCAG 2.2 AA is the framework's named accessibility target for all apps.

    GATE BEHAVIOUR:
    a. HARD GATE (Phase 5 cannot close) — triggered when PRODUCT.md Non-functional Requirements
       contains `accessibility: wcag_aa` AND the app's client is a Philippine government agency
       or LGU. This is legally required under DICT MC 004 (2017) for PH gov/LGU digital services.
       Phase 5 output contract gains one additional item:
         □ accessibility:check — exit 0 (run `npx accessibility-agents audit` or equivalent;
           all WCAG 2.2 AA failures must be resolved before Phase 6 may start).
    b. WARN-ONLY (all other apps) — run the same audit; output warnings but do not block Phase 5.
       Record any FAIL items in DECISIONS_LOG.md under "Accessibility — non-blocking deferred items".

    ENFORCEMENT TOOLS:
    - Generation-time: `accessibility-agents` skill (Community-Access/accessibility-agents) — install
      with `npx skills add Community-Access/accessibility-agents`. Integrates into Phase 4 Parts 5-6
      and Phase 7 UI generation passes. Run it BEFORE committing UI components.
    - Audit: `design-auditor` skill — paired with accessibility-agents for end-of-phase design review.
      Run during Phase 5 (gov/LGU: HARD GATE; other: WARN-ONLY).
    - Hook 18 (memory-governance.md §3) fires during build phases to surface accessibility gaps
      detected by accessibility-agents before they reach Phase 5.

    WCAG 2.2 AA KEY REQUIREMENTS (non-exhaustive — accessibility-agents enforces full list):
    - Contrast ratio ≥ 4.5:1 for normal text; ≥ 3:1 for large text (1.4.3)
    - All interactive elements keyboard-navigable (2.1.1)
    - Visible focus indicators (2.4.11 — new in WCAG 2.2)
    - No focus traps (2.1.2)
    - All images have meaningful alt text (1.1.1)
    - Forms: inputs have associated labels; errors are identified and described (1.3.1, 3.3.1)
    - Target size ≥ 24×24 CSS pixels for interactive elements (2.5.8 — new in WCAG 2.2)
    - Dragging movements have single-pointer alternatives (2.5.7 — new in WCAG 2.2)

    shadcn/ui components are WCAG 2.2 AA-aligned by default (built on Radix UI primitives).
    Custom components and design token overrides must be audited — accessibility-agents catches drift.

    Reference: Master_Prompt_v31.md Rule 33 + .ai_prompt/privacy.md (gov/LGU gate definition).

14. Motion & micro-interactions (NEW V32.14 — Rule 33-aligned, ties to R13 WCAG gate).
    Motion is part of the design system, not improvised per component. shadcn/ui already builds on
    Motion, so the prescribed animation library honors the shadcn-only rule.

    HARD RULES — no exceptions:
    a. Motion (motion.dev) is the ONLY prescribed React animation library. NEVER import
       framer-motion (legacy name aside), react-spring, anime.js, or any other animation runtime
       for standard app UI. Motion is the same primitive shadcn/ui uses — shadcn-only is preserved.
    b. Use the LazyMotion / mini import path by default (small runtime, ~4.6KB) — pull in extra
       features only when a specific interaction needs them.
    c. EVERY animation MUST respect reduced motion. In React: a `useReducedMotion()` guard; in
       CSS/Tailwind: a `@media (prefers-reduced-motion: reduce)` block (Tailwind `motion-reduce:`
       variant). A guardless animation is a defect. This is a HARD requirement and ties directly to
       Rule 13's WCAG 2.2 AA gate (SC 2.3.3 Animation from Interactions) — on gov/LGU apps a guardless
       animation FAILS the Phase 5 accessibility gate. Reduced-motion is a design decision, not a
       blanket kill-switch: substitute a fade or instant change, preserving the feedback.
    d. Animate `transform` and `opacity` ONLY. NEVER animate layout/reflow properties
       (`width`/`height`/`margin`/`padding`/`top`/`left`/`right`/`bottom`/inset) — they force layout
       every frame and drop frames. Move with `transform: translate`, scale with `transform: scale`.
    e. Easing by intent: ease-out for entrances/exits; ease-in-out for on-screen movement; never
       `linear` for UI transitions. Duration by element type: micro-interactions ≈100–200ms;
       components ≈150–300ms; modals/sheets ≈250–400ms; page/route ≈300–500ms.
    f. GSAP is OPT-IN ONLY — permitted solely when PRODUCT.md signals marketing-site /
       scroll-storytelling / timeline-heavy needs. It is now fully free (all plugins) but still
       requires `@gsap/react` + a hand-written `gsap.matchMedia()` reduced-motion guard (GSAP does
       not auto-honor the preference). Lock the opt-in in DECISIONS_LOG.md.
    g. Three.js / React Three Fiber (R3F) are PARKED — 3D/WebGL is out of scope for standard apps,
       available only when a PRODUCT.md explicitly requires 3D. When it does, R3F is the correct
       entry point (not raw Three.js). Lock the decision in DECISIONS_LOG.md.

    For the full library-agnostic principles (when/when-not, easing families, duration budgets,
    spring-vs-tween, interruptibility, CSS-vs-JS, the Motion+Tailwind mapping appendix, and the
    motion QA checklist), Read .ai_prompt/motion.md.
    Reference: Master_Prompt_v31.md V32.14 changelog + .ai_prompt/motion.md + Rule 13 (WCAG gate).
```

**shadcn/ui MCP Server** — enables agents to search and install components via natural language.
Installed by Bootstrap Step 10. Agents use it during Phase 4 scaffold and Phase 7 Feature Updates.
Example prompts to the MCP server:
  "Show me all available form components"
  "Add button, dialog, and card to my project"
  "Find a sidebar component from the shadcn registry"
Reference: https://ui.shadcn.com/docs/mcp

**Community registries** — optional, MIT, free:
  Kibo UI: https://www.kibo-ui.com — complex components (Kanban, Gantt, Editor, Dropzone)
  mapcn: https://www.mapcn.dev — shadcn-native maps (MapLibre GL, zero API key)
  awesome-shadcn-ui: https://github.com/birobirobiro/awesome-shadcn-ui — discovery list (200+ registries)
  shadcnregistry.com: https://shadcnregistry.com — searchable registry index

**shadcn/studio Pro — sanctioned design generator (NEW V32.11).**
The owner's licensed shadcn/studio **Pro** MCP is the framework's DEFAULT design-generation path. It is a
BUILD-TIME generator built on shadcn/ui — output is plain shadcn/ui + Tailwind (MIT-compatible), so apps
carry NO runtime dependency on the Pro account. Command routing (full detail: AI_Tools_Skills_MCPs_Reference §2.5
+ phases.md Phase 3.3 / Parts 5-6 / Phase 7 MODEL HOOKs):
  /cui  Create UI  — DEFAULT daily driver; whole pages / multiple sections from Pro blocks ("collect first, install last").
  /iui  Inspire UI — Pro-only; ONE distinctive section at a time (hero / pricing / feature) — not whole pages.
  /rui  Refine UI  — polish an already-generated block.
  /ftc  Figma→Code — CONDITIONAL; only with a Figma design + the Figma MCP present.
HARD — INHERIT-not-REPLACE: generated blocks carry their own design tokens; reconcile every block to the
compiled tokens (Rule 12). The block NEVER overrides docs/DESIGN.md. `/iui` is a Phase 3.3 tool only —
Phase 4 Parts 5-6 and Phase 7 default to `/cui` + `/rui` so the finalized design is not re-opened.
FALLBACK: if the Pro MCP is unreachable, use the plain shadcn/ui MCP + Blocks gallery (same shadcn/ui output target).

**DESIGN GENERATION DECISION TREE (canonical — cited by phases.md MODEL HOOKs + LESSONS_REGISTRY `framework.design-generation.routing`):**

| Situation | Command | Allowed in |
|-----------|---------|-----------|
| New whole page / multiple sections | `/cui` | Phase 3.3 · 4 Parts 5-6 · 7 |
| New distinctive single section (hero / pricing / feature) | `/iui` | Phase 3.3 ONLY (design frozen after) |
| Tweak an already-generated block | `/rui` | Phase 3.3 · 4 Parts 5-6 · 7 |
| Design source is Figma + Figma MCP present | `/ftc` | any (conditional) |
| Pro MCP unreachable | plain shadcn/ui MCP + Blocks | any (fallback) |

ALWAYS reconcile a generated block's tokens to `docs/DESIGN.md` / compiled tokens (Rule 12) — never override.
OFF-ROUTING IS A FINDING: hand-writing a component a Pro block covers · using `/iui` after the Phase 3.3 freeze ·
letting a block's own tokens override `docs/DESIGN.md`. Consulted at work-start + done-claim via the Rule 32 loop.

**Optional / non-default component sources:**
  shadcn/studio FREE (shadcnstudio.com GitHub, MIT) — the free block set; optional supplement to the sanctioned Pro generator above.
  shadcn.io — community registry with a Pro paid tier; free-tier boundaries unclear. Not a default.

---

## FILE DELIVERY RULES

---
name: design-principles
description: Library-agnostic UI/UX design-principles reference. Read on-demand when the project design system (docs/DESIGN.md + ui-rules.md) is silent on a layout pattern, component state, spacing/type decision, or accessibility approach. Principles win for structural decisions; the design system wins for concrete token values.
---

# Design Principles — On-Demand Reference (V32.12)

> Condensed from typeui.sh design fundamentals (MIT). Source: <https://typeui.sh> — MIT License.
> The design system (docs/DESIGN.md + ui-rules.md) tells you WHICH token/component; this file
> tells you WHY a structural choice is correct and HOW to avoid principle violations.
> INHERIT-not-REPLACE: never contradict the design system. If a principle conflicts with a
> design-system rule, the design system wins. Flag the conflict in DECISIONS_LOG.md.

## Conflict Resolution (load order)

1. **docs/DESIGN.md + ui-rules.md win** for concrete values — colors, sizes, spacing tokens, component library.
2. **These principles win** for structural decisions — layout patterns, information architecture, interaction design, hierarchy logic — where the design system is silent.
3. **Accessibility overrides aesthetics everywhere** — no contrast ratio, target size, or keyboard rule is waivable for style. Accessibility wins over brand, density, and consistency.
4. **ui-rules.md R13 + privacy.md hold the WCAG gov/LGU HARD GATE** — do not duplicate that gate here; point to those files. Gov/LGU apps: WCAG 2.2 AA is a hard block on Phase 5 close.
5. When this file and the design system conflict on a concrete value, **open a DECISIONS_LOG.md entry** and wait for human review.

---

## Pillar 1 — Visual Clarity & Perception

**Core:** A UI communicates before it is read. Every element must be instantly classified: interactive vs. static, important vs. secondary, grouped vs. independent.

**Agent rules — DO:**
- Ensure interactive elements (buttons, links, inputs) are visually distinct from static ones at rest — before hover.
- Distinguish input fields from their parent surface at rest: use a visible border or clearly different fill (never flush with background).
- Apply Gestalt principles — proximity groups, similarity signals relationship, common-region creates containment.
- Provide at least two perceptual signals for every semantic state: color + icon, color + text, color + shape. Never color alone.
- Use whitespace as a primary grouping tool — stronger than borders for most content.

**Agent rules — DO NOT:**
- Do not rely on color alone to convey hierarchy, state, or meaning (SC 1.4.1).
- Do not use grey text on colored backgrounds — match hue, not just lightness.
- Do not use true black (`#000`) for text or backgrounds unless the design system explicitly calls for it.
- Do not animate the sole indicator of importance — support it with position, size, or weight.

**Testable checks:**
- [ ] Every interactive element is visually distinct from static content without hover.
- [ ] Every input field has a visible boundary (border or fill contrast) at rest.
- [ ] No state is communicated by color alone — a second signal always exists.

---

## Pillar 2 — Hierarchy & Emphasis

**Core:** One dominant element per surface. If everything competes, nothing wins.

**Agent rules — DO:**
- Identify the single most important element on every surface and ensure it dominates — size, weight, position, or contrast.
- Use no more than 3–4 hierarchical levels per surface.
- Validate hierarchy by squinting: the primary element must be first even at reduced visual acuity.
- Build hierarchy across multiple dimensions (size + weight, or size + color) — not a single axis.
- Use progressive disclosure: show essentials first, deeper detail on demand. Signal that more exists (chevron, "show more," step indicator).
- Apply white space as an active hierarchy tool — restraint often reveals structure better than adding elements.

**Agent rules — DO NOT:**
- Do not make every element bold; if everything is emphasized, nothing is.
- Do not hide information the user needs *now* behind progressive-disclosure layers — disclose complexity, not essentials.
- Do not rely on color alone for hierarchy — reinforce with size, position, or weight.
- Do not animate as the sole hierarchy signal.

**Typography hierarchy floors** (override only if docs/DESIGN.md says otherwise):
- Primary headings (h1, major h2): `line-height: 1`, `margin-bottom: 32px`.
- Body paragraphs, button labels: ≥ 16px.
- Supporting / secondary copy: ≥ 14px.
- Micro UI only (badges, chips, timestamps): < 14px permitted.
- Display-scale sizes (≥ 30px): hero h1 and major section h2 openers only.
- Card/tile titles: ≤ 20px.

**Testable checks:**
- [ ] One element dominates each surface; squint test passes.
- [ ] No more than 4 hierarchy levels visible simultaneously.
- [ ] All body text ≥ 16px; all secondary text ≥ 14px.
- [ ] Hierarchy reinforced by at least two perceptual signals.

---

## Pillar 3 — Layout & Spacing

**Core:** Spacing is the primary grouping signal. Proximity says "these belong together"; separation says "new group."

**Spacing rules:**
- Use a 4-point grid (multiples of 4px: 4, 8, 12, 16, 20, 24, 32, 48, 64, 96…) for all margins, padding, and gaps.
- Three spacing tiers must be visibly distinct: tight (within a component), default (between related components), loose (between sections or major groups).
- Start generous; remove space until grouping still reads clearly — do not start tight and increment.
- Intra-component spacing ≤ 8px; inter-component spacing 16–24px; inter-section spacing ≥ 48px (adjust to design system tokens when defined).

**Layout rules:**
- Choose a grid type once per surface: block (single-column long-form), column (editorial/pricing), modular (gallery/e-commerce), hierarchical (dashboard/homepage). Do not mix without reason.
- Use a soft grid (consistent columns + spacing, no baseline snapping) for most digital products.
- Collapse column grids aggressively on mobile — most 3–4 column grids become 1–2 at 360px.
- Use container queries when a component must adapt to its own size, not the viewport.

**Agent rules — DO:**
- Use spacing to group before using borders — whitespace is cheaper and cleaner.
- Keep all spacing values on the 4-point grid; never use arbitrary pixel values.
- Verify three spacing tiers are visible in every composed layout.

**Agent rules — DO NOT:**
- Do not use borders to separate content that closer proximity would group naturally.
- Do not use viewport units (`vw`/`vh`) for spacing without `clamp()`.

**Testable checks:**
- [ ] All spacing values are multiples of 4px.
- [ ] Three distinct spacing tiers are visible (tight / default / loose).
- [ ] Mobile layout tested at 360px — columns collapse, no overflow.

---

## Pillar 4 — Typography

**Core:** Decide typeface(s) and weights once, before writing styles. Build a modular scale and derive every size from it. Readability before aesthetics.

**Scale rules:**
- Pick one modular ratio (1.125, 1.2, 1.25, 1.333, 1.414, 1.5, or 1.618) and derive every size from `base × ratio^n`. Never set sizes by eye.
- Use 1–2 font families maximum; 3+ is a system failure.
- Use `clamp()` for fluid headings — never bare `vw` units.

**Readability rules:**
- Optimal line length: 45–75 characters per line (use `max-width` or `ch` units on prose containers).
- Body `line-height`: 1.4–1.6 for paragraph text; 1–1.2 for display headings.
- Body text: 16px minimum on all surfaces.
- Do not use font-weight variation as the only hierarchy signal — pair with size.
- No underline on button labels in any state.

**Responsive rules:**
- Design mobile-first: if type works at 360px it almost always works on desktop; the reverse is rarely true.
- Test at 320px, 360px, 768px, 1024px, 1440px, 1920px+.
- Respect platform interface guidelines when building native apps (Apple HIG, Material Design).

**Agent rules — DO:**
- Build the type scale once; apply consistently across all surfaces.
- Validate readability at 16px and 14px before shipping.
- Use semantic heading levels (h1–h6); no skipped levels; one h1 per page.
- Hero uses `<h1>`; every other major section opens with `<h2>`.

**Agent rules — DO NOT:**
- Do not add a third typeface for personality on a single surface.
- Do not ship sub-14px type outside true micro UI (badges, chips).
- Do not use `tabindex > 0` to manage reading order — fix the DOM order instead.

**Testable checks:**
- [ ] All sizes traceable to `base × ratio^n` — no arbitrary values.
- [ ] Heading levels sequential; one h1 per page.
- [ ] Body text ≥ 16px; secondary text ≥ 14px; line-length ≤ 75ch on prose.
- [ ] Fluid headings use `clamp()` — no bare `vw` type.

---

## Pillar 5 — Color

**Core:** Color communicates meaning before users read text. Define semantic roles; apply them consistently; always pair color with a second signal.

**Semantic color roles (define these before designing surfaces):**
- **Primary action** — the single strongest call-to-action color.
- **Secondary action** — visually quieter than primary.
- **Destructive / danger** — paired with icon + label text, never color alone.
- **Success / warning / info** — each paired with an icon; never color-only badges.
- **Muted / disabled** — visually reduced; must still meet 3:1 contrast for non-text UI elements.

**Contrast requirements (WCAG 2.2 AA):**
- Normal text (< 18px / < 14px bold): **4.5:1** minimum against background.
- Large text (≥ 18px or ≥ 14px bold): **3:1** minimum.
- UI components and graphical objects: **3:1** against adjacent colors.
- Focus indicators: **3:1** against background.

**Color rules:**
- Every semantic state must use color + a second channel: error = red border + error icon + error text; required = asterisk + "(required)" label; selected = background + checkmark + `aria-selected`.
- When a palette color fails contrast, shift it along its own hue axis (darker or lighter variant) — never replace with an unrelated hue.
- Do not use grey text on colored backgrounds — match hue family.

**Agent rules — DO:**
- Define semantic color roles before designing any surface.
- Verify every text/background pairing with a contrast checker before shipping.
- Pair every semantic color with a non-color signal (icon, text label, pattern).

**Agent rules — DO NOT:**
- Do not use a brand secondary color for a primary action.
- Do not use true black (`#000`) or pure white (`#FFF`) unless the design system calls for it.
- Do not use color-only navigation indicators (current page = color + underline or sidebar indicator).

**Testable checks:**
- [ ] All text/background pairs ≥ 4.5:1 (normal) or ≥ 3:1 (large).
- [ ] All interactive UI elements ≥ 3:1 against adjacent colors.
- [ ] No semantic state communicates via color alone — a second signal exists for each.

---

## Pillar 6 — Interaction, Controls & UX

**Core:** Every action must produce feedback. Silent failures erode trust. Users complete tasks, not admire interfaces.

**Cognitive principles (apply before designing any flow):**
- **Fitts' Law** — primary actions must be large and reachable; destructive actions smaller and distanced from primary.
- **Hick's Law** — limit choices per screen; use progressive disclosure to reveal complexity only when needed. Decision time grows with the number of options.
- **Mental model alignment** — use the user's vocabulary (not internal DB names); mirror the structure of real-world processes when possible. Change one variable at a time when forcing a model shift.

### UX Laws

The 12 operative laws an agent applies when designing flows (law → build implication):

- **Fitts' Law** — distance + size govern targeting → primary actions large and reachable; destructive actions smaller and distanced.
- **Hick's Law** — decision time grows with option count → limit choices per screen; use progressive disclosure.
- **Gestalt (proximity)** — close elements are read as a group → use spacing, not borders, to group related content.
- **Progressive disclosure** — complexity revealed on demand → show essentials first; signal that deeper detail exists.
- **Jakob's Law** — users expect your app to work like the others they know → follow established patterns and platform conventions; do not reinvent familiar interactions.
- **Miller's Law** — working memory holds ~7±2 items → chunk content into groups; limit menu and option counts per view.
- **Postel's Law** — be liberal in what you accept, strict in what you emit → parse input tolerantly (whitespace, formats); emit clear, predictable output.
- **Doherty Threshold** — keep system response < **400ms**, or show feedback → any action ≥ 400ms must display a loading/progress state.
- **Aesthetic-Usability Effect** — polished UI is perceived as more usable → visual quality is functional, not decoration; invest in polish.
- **Peak-End Rule** — users judge an experience by its peak moment and its end → invest in critical moments and completion/success states.
- **Tesler's Law (conservation of complexity)** — irreducible complexity must live somewhere → absorb inherent complexity in the system; do not push it onto the user.
- **Recognition over Recall** — showing options beats forcing memory → use visible affordances, autocomplete, recents, and selectable lists instead of free recall.

**Interactive state rules:**
- Every interactive element must have: default, hover, focus, active, disabled states — at minimum.
- Buttons must also have loading and error states when they trigger async operations.
- Button type (submit/destructive/navigate) × style (primary/secondary/ghost) × state (default/loading/error…) are three orthogonal dimensions — do not encode functional differences into style alone.
- Focus must be visible: `:focus-visible` outline, not removed. Never `outline: 0` without a replacement.

**Feedback rules:**
- Loading states must set expectations: progress indicator for determinate waits, skeleton screens for predictable content layouts, spinner only for indeterminate short waits.
- Error messages must explain the problem and offer a next step: "Email already used — log in instead?" not "Unknown error."
- Empty states must explain why empty and offer an action when one exists.

**Form design:**
- Labels visible at all times — not placeholder-only (placeholder disappears on input).
- Validate inline as the user types, not only after submission.
- Never hide invalid fields inside collapsed sections — expand and scroll to the error.
- Required fields: asterisk + "(required)" label text — not color alone (SC 1.4.1 / F81).

**Navigation & IA:**
- Use the user's vocabulary for navigation labels — not internal system names.
- Current page: color + non-color indicator (underline, sidebar bar, bold) — not color alone.
- Provide a skip-to-content link as the first focusable element on every page — visible on `:focus`.

**Consistency rules:**
- One pattern per UI problem across the product: one button style per role, one card per role, one search affordance.
- Reuse the same mechanism for the same job — two search UIs for the same data type is a consistency failure.
- Platform consistency: desktop search filters must be recognizable on mobile.

**Agent rules — DO:**
- Define all five base states (default/hover/focus/active/disabled) before shipping any control.
- Size all touch targets at ≥ 44 × 44px on touch devices; ≥ 8px spacing between adjacent targets.
- Use `padding` (not just text size) to meet target minimums.
- Trap focus inside modals until dismissed; return focus to the trigger element on close.
- Ensure every interactive element is reachable via Tab/Shift-Tab and activates on Enter (links + buttons) / Space (buttons).

**Agent rules — DO NOT:**
- Do not use `tabindex > 0` — it creates unpredictable tab order.
- Do not use `pointer-events: none` as a substitute for `disabled` — removes from keyboard/AT.
- Do not use hover-only affordances for critical information — hover does not exist on touch or keyboard.
- Do not place destructive actions adjacent to primary actions without sufficient spacing.

**Testable checks:**
- [ ] All controls have ≥ 5 states defined (default/hover/focus/active/disabled).
- [ ] All touch targets ≥ 44 × 44px with ≥ 8px spacing between adjacent targets.
- [ ] Focus ring visible on all interactive elements — `outline: 0` not present without replacement.
- [ ] All form fields have persistent visible labels (not placeholder-only).
- [ ] Every async action has a loading state.
- [ ] Error messages name the problem and offer a next step.

---

## Pillar 7 — Accessibility (Structural)

> This pillar covers structural and behavioral accessibility. For the WCAG gov/LGU HARD GATE,
> see **ui-rules.md R13** and **privacy.md** — those files own that gate and Phase 5 cannot
> close until they return green. Do not duplicate the gate here.

**Non-negotiable floors (WCAG 2.2 AA — test these, not guidelines):**

| Check | Standard | Threshold |
|---|---|---|
| Text contrast (normal) | SC 1.4.3 AA | 4.5:1 |
| Text contrast (large) | SC 1.4.3 AA | 3:1 |
| Non-text UI contrast | SC 1.4.11 AA | 3:1 |
| Focus indicator contrast | SC 1.4.11 / 2.4.11 AA | 3:1 |
| Touch target minimum | SC 2.5.8 AA (WCAG 2.2) | 24 × 24px hard floor; 44 × 44px best practice |
| Keyboard navigable | SC 2.1.1 A | All functionality via keyboard |
| Focus visible | SC 2.4.7 AA | All keyboard focus indicators visible |
| Color not sole signal | SC 1.4.1 A | Color always paired with a second channel |
| Images have alt text | SC 1.1.1 A | Meaningful alt; decorative = `alt=""` |
| Form labels | SC 1.3.1 A | Programmatic label on every input |
| Error identification | SC 3.3.1 A | Text description of the error |
| Skip navigation | SC 2.4.1 A | Skip link as first focusable element |
| Page language | SC 3.1.1 A | `lang` attribute on `<html>` |
| No seizure triggers | SC 2.3.1 A | No flashing > 3 times/sec |

**Semantic structure rules:**
- Use heading levels sequentially (h1 → h2 → h3); never skip levels.
- One `<h1>` per page.
- Landmark regions (`<main>`, `<nav>`, `<header>`, `<footer>`, `<aside>`) present on every page.
- Links must be visually evident without color vision: underline or icon or weight change (F73).
- Required fields: asterisk + "(required)" text — not color alone (F81).
- Images with text in them: alt text must include information conveyed by color differences in the image (F13).

**Motion & animation:**
- Respect `prefers-reduced-motion`: no auto-playing animations, no parallax, minimal transitions when the preference is set.
- No flashing content > 3 times/second on any surface.

**Testable checks:**
- [ ] All text contrast ≥ 4.5:1 (normal) or ≥ 3:1 (large) — verified with a checker.
- [ ] All non-text UI ≥ 3:1 against adjacent colors.
- [ ] All touch targets ≥ 24 × 24px (AA floor); ≥ 44 × 44px (best practice).
- [ ] Tab order is logical and matches visual reading order.
- [ ] Focus ring visible on every interactive element.
- [ ] Skip-to-content link present as first focusable element, visible on focus.
- [ ] All images have descriptive alt text; decorative images use `alt=""`.
- [ ] Every form input has a programmatic label.
- [ ] No flashing content > 3/sec.
- [ ] `prefers-reduced-motion` respected — no auto-play animations in reduced-motion mode.
- [ ] `lang` attribute on `<html>`.

---

## QA Checklist (run at /design-review and Phase 5)

Use this at every `/design-review` invocation and as the Phase 5 design-principles gate.
All items are binary pass/fail. Fails block Phase 5 close.

### Visual Clarity
- [ ] Every interactive element visually distinct from static content at rest (before hover).
- [ ] Every input field has a visible boundary at rest (border or fill contrast — not flush with parent).
- [ ] No state communicated by color alone — second signal (icon, text, pattern) always present.

### Hierarchy
- [ ] One dominant element per surface; squint test passes.
- [ ] ≤ 4 hierarchy levels visible simultaneously.
- [ ] Hierarchy reinforced by ≥ 2 perceptual signals (e.g., size + weight).
- [ ] Progressive disclosure present where density is high; essentials not hidden.

### Spacing & Layout
- [ ] All spacing values on the 4-point grid (multiples of 4px).
- [ ] Three spacing tiers visibly distinct: tight / default / loose.
- [ ] Layout tested at 360px viewport — no overflow, columns collapse correctly.

### Typography
- [ ] All body text ≥ 16px; all secondary/supporting text ≥ 14px.
- [ ] All sizes traceable to `base × modular ratio^n` — no arbitrary values.
- [ ] One h1 per page; heading levels sequential, no skipped levels.
- [ ] Prose containers have `max-width` limiting line length to ≤ 75ch.
- [ ] Fluid headings use `clamp()` — no bare `vw` for font sizes.

### Color
- [ ] All normal text/background pairs ≥ 4.5:1 contrast.
- [ ] All large text/background pairs ≥ 3:1 contrast.
- [ ] All interactive UI elements ≥ 3:1 against adjacent colors.
- [ ] Semantic states (error/success/warning/required) each use color + a non-color signal.

### Interaction & Controls
- [ ] All controls define ≥ 5 states (default / hover / focus / active / disabled).
- [ ] Async actions have loading states; error states name the problem and offer a next step.
- [ ] Doherty threshold: any async action responding ≥ 400ms shows a loading/progress state.
- [ ] Empty states explain why and offer an action.
- [ ] Touch targets ≥ 44 × 44px with ≥ 8px between adjacent targets.
- [ ] Focus ring visible on all interactive elements — no bare `outline: 0`.
- [ ] All form fields have persistent visible labels (not placeholder-only).
- [ ] Inline validation present on forms; errors visible without page reload.
- [ ] Destructive actions distanced from primary actions.

### Accessibility
- [ ] Skip-to-content link first focusable element, visible on focus.
- [ ] Keyboard navigation covers all interactive elements (Tab / Shift-Tab / Enter / Space).
- [ ] Tab order matches visual reading order.
- [ ] All images have alt text; decorative images use `alt=""`.
- [ ] Every form input has a programmatic label.
- [ ] No flashing content > 3 times/second.
- [ ] `prefers-reduced-motion` respected.
- [ ] `lang` attribute on `<html>`.
- [ ] For gov/LGU apps: WCAG 2.2 AA gate owned by **ui-rules.md R13** — verify there, not here.

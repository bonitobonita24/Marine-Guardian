---
name: motion
description: Library-agnostic UI/UX motion-principles reference. Read on-demand when the project design system (docs/DESIGN.md + ui-rules.md) is silent on a motion, timing, easing, or reduced-motion pattern. Principles win for structural/timing decisions; the design system wins for concrete duration/easing token values. Motion is always subordinate to the WCAG 2.2 AA gate (ui-rules.md R13 + R14).
---

# Motion Principles — On-Demand Reference (V32.14)

> Motion principles informed by Emil Kowalski's "Animations on the Web" (animations.dev) and
> the MIT-licensed emilkowalski/skills + vercel-labs/open-agents skill files. Restated in the
> framework's own words; no source text reproduced.
> The design system (docs/DESIGN.md + ui-rules.md) tells you WHICH duration/easing token to use;
> this file tells you WHY a motion choice is correct and HOW to avoid motion anti-patterns.
> INHERIT-not-REPLACE: never contradict the design system. If a principle conflicts with a
> design-system rule, the design system wins. Flag the conflict in DECISIONS_LOG.md.

## Conflict Resolution (load order)

1. **docs/DESIGN.md + ui-rules.md win** for concrete values — duration tokens, named easing curves, spring configs the design system defines.
2. **These principles win** for structural/timing decisions — when to animate, which easing family fits an intent, what to never animate — where the design system is silent.
3. **Accessibility overrides motion everywhere** — `prefers-reduced-motion` and the no-seizure rule are never waivable for style. Reduced motion wins over delight, brand, and consistency.
4. **ui-rules.md R13 + R14 + privacy.md hold the WCAG gov/LGU HARD GATE** — do not duplicate that gate here; point to those files. Gov/LGU apps: WCAG 2.2 AA (including SC 2.3.3 Animation from Interactions) is a hard block on Phase 5 close.
5. When this file and the design system conflict on a concrete value, **open a DECISIONS_LOG.md entry** and wait for human review.

---

## Pillar 1 — When to Animate (and When Not To)

**Core:** Motion is a communication tool, not decoration. Animate to explain a change — where something came from, where it went, what is loading, what just succeeded or failed. If a motion does not clarify a state change, it is noise.

**Agent rules — DO:**
- Animate state transitions that would otherwise be abrupt or unexplained: a panel opening, an item entering a list, a value updating, a route change.
- Use motion to direct attention to the one thing that changed — not to decorate the whole surface.
- Keep motion subtle enough that a user notices the result, not the animation.

**Agent rules — DO NOT:**
- Do not animate high-frequency, repeated actions. A transition a user triggers dozens of times per session (a list-row hover that fires on every scroll, a keystroke echo, a counter that ticks rapidly) becomes friction — make these instant or near-instant.
- Do not animate purely to look impressive. If removing the animation does not lose information, question whether it belongs.
- Do not block the user from acting while a non-essential animation plays — interaction must never wait on delight.

**Testable checks:**
- [ ] Every animation explains a state change or directs attention — none is pure decoration.
- [ ] No animation fires on a high-frequency repeated action without being instant/near-instant.
- [ ] The user can act immediately; no non-essential animation gates input.

---

## Pillar 2 — Easing by Intent

**Core:** Easing communicates physical intent. The curve must match what the element is doing. Linear motion reads as mechanical and wrong for UI — almost nothing in the physical world moves at a constant speed.

**Easing rules (intent → curve family):**
- **Entrances and exits** (something appears or leaves): use an **ease-out** family — fast start, gentle settle. The element arrives quickly and decelerates into place; on exit it accelerates away.
- **On-screen movement** (an element already visible repositions, resizes, or reflows): use an **ease-in-out** family — gentle acceleration and deceleration on both ends, so the move reads as deliberate.
- **Never use linear** for UI transitions of position, size, or opacity. Reserve linear only for genuinely continuous, mechanical motion (a marquee, an indeterminate spinner rotation, a progress bar filling at a known constant rate).

**Agent rules — DO:**
- Pick the easing family from the element's intent first; only then reach for the design-system's named curve token.
- Prefer the design system's defined easing tokens; this file's families are the fallback when none is defined.

**Agent rules — DO NOT:**
- Do not apply the same curve to every animation regardless of intent.
- Do not hand-author arbitrary curve values when the design system already defines an easing token.

**Testable checks:**
- [ ] Entrances/exits use an ease-out family; on-screen moves use ease-in-out.
- [ ] No `linear` easing on opacity/position/size UI transitions.
- [ ] Easing values trace to a design-system token where one exists.

---

## Pillar 3 — Duration Budgets

**Core:** Duration scales with distance and importance, not taste. Small, local changes should feel instant; large, spatial transitions need enough time to be read but never enough to be waited on. Too fast reads as a glitch; too slow reads as sluggish.

**Duration guidance by element type** (override only if docs/DESIGN.md defines tokens):
- **Micro-interactions** (button press feedback, toggle, checkbox, small hover affordance): very short — roughly 100–200ms. The user should perceive responsiveness, not a journey.
- **Standard component transitions** (dropdown, popover, tooltip, small panel, tab content): short — roughly 150–300ms.
- **Modal / sheet / drawer / large overlay**: medium — roughly 250–400ms; large spatial moves justify the upper end.
- **Full page / route transitions**: medium — roughly 300–500ms; long enough to convey continuity, short enough to stay responsive.
- **Hover transitions**: keep brief (roughly 100–200ms) so the affordance feels immediate and reversible.
- **Stagger** (sequencing a list or group): keep each item's offset small (tens of milliseconds) and cap total elapsed time — a long stagger over many items becomes a wait. Stagger a handful of items, not an entire long list.

**Agent rules — DO:**
- Match duration to the element type and the distance it travels.
- Keep total perceived motion time low; favor the shorter end of each range for frequently seen transitions.

**Agent rules — DO NOT:**
- Do not give a tooltip the same duration as a page transition.
- Do not stagger a long list such that the last item arrives after a noticeable wait.

**Testable checks:**
- [ ] Micro-interactions feel instant (≈100–200ms); large overlays/pages use the longer ranges.
- [ ] Durations trace to design-system tokens where defined.
- [ ] No stagger produces a perceptible cumulative wait on long lists.

---

## Pillar 4 — Performance: Animate Only Compositor-Friendly Properties

**Core:** The browser can animate some properties cheaply (on the compositor, off the main thread) and others only expensively (forcing layout/paint every frame). Janky animation is almost always an animation of the wrong property.

**Hard rules — no exceptions:**
- **Animate `transform` and `opacity` ONLY.** These are GPU-compositable and do not trigger layout.
- **NEVER animate layout-affecting properties** in a transition or keyframe: `width`, `height`, `margin`, `padding`, `top`, `left`, `right`, `bottom`, `inset`, or anything that reflows the page. Animating these forces synchronous layout every frame and drops frames.
- To move an element, animate `transform: translate(...)`, not `top`/`left`.
- To scale an element, animate `transform: scale(...)`, not `width`/`height`.
- To fade, animate `opacity`, not `visibility` toggles mid-transition.
- For an element that must change layout size (e.g., an accordion), prefer a technique that animates `transform` against a measured target, or a purpose-built layout-animation primitive, rather than animating the raw box dimensions.

**Agent rules — DO:**
- Reach for `transform`/`opacity` first for any motion; treat any urge to animate a layout property as a design smell to solve differently.
- Add `will-change` sparingly and only for known-hot animations; remove it after.

**Agent rules — DO NOT:**
- Do not animate `width`/`height`/`margin`/`top`/`left` for visual movement.
- Do not leave `will-change` set on many elements permanently (it costs memory).

**Testable checks:**
- [ ] Every animation/transition touches only `transform` and/or `opacity`.
- [ ] No keyframe or transition animates a layout/reflow property.
- [ ] No permanent broad `will-change` usage.

---

## Pillar 5 — Accessibility (First-Class — ties to the WCAG 2.2 AA Hard Gate)

> Motion accessibility is not optional polish. For the gov/LGU WCAG HARD GATE,
> see **ui-rules.md R13 + R14** and **privacy.md** — those files own the gate and Phase 5
> cannot close until they return green. Do not duplicate the gate here.

**Core:** Some users experience motion as discomfort, nausea, or a vestibular trigger. The platform exposes `prefers-reduced-motion` so they can ask for less. Honoring it is a requirement, not a courtesy.

**Non-negotiable floors (test these, not guidelines):**
- **`prefers-reduced-motion` is mandatory.** Every non-trivial animation MUST check it. In a React app this means a `useReducedMotion()` guard (or a CSS `@media (prefers-reduced-motion: reduce)` block); a guardless animation is a defect.
- **Reduced motion is a design decision, not a global kill-switch.** Do not simply delete all motion when the preference is set. Replace large, spatial, or looping motion (slides, parallax, scale-ins, auto-playing loops) with a minimal, non-vestibular alternative — typically a simple opacity fade or an instant state change. Essential feedback (a loading indicator, a focus move, a success confirmation) should still communicate, just without large movement.
- **No content flashes more than 3 times per second** (SC 2.3.1) — never, regardless of preference.
- **Motion triggered by interaction must be dismissible/reducible** (SC 2.3.3, AAA but framework-targeted for gov/LGU): non-essential interaction-driven animation must respect reduced-motion.

**Agent rules — DO:**
- Wrap every animation in a reduced-motion guard at the point it is defined — not as an afterthought.
- Provide a meaningful reduced-motion fallback (fade or instant), preserving the information the animation conveyed.
- Keep focus-visibility and state feedback intact under reduced motion.

**Agent rules — DO NOT:**
- Do not ship an animation with no `prefers-reduced-motion` handling.
- Do not treat reduced-motion as "remove everything" — that can strip necessary feedback.
- Do not auto-play looping or parallax motion that ignores the preference.

**Testable checks:**
- [ ] Every animation has a `prefers-reduced-motion` guard (`useReducedMotion()` or CSS media query).
- [ ] Reduced-motion mode replaces large/looping motion with a fade or instant alternative — not a blanket removal of feedback.
- [ ] No content flashes > 3×/sec.
- [ ] Interaction-driven non-essential motion respects reduced-motion (SC 2.3.3).

---

## Pillar 6 — Spring vs Tween, Interruptibility, CSS vs JS

**Core:** The animation technique is an engineering decision driven by the interaction, not a default. Pick the model that matches how the user drives the motion.

**Spring vs tween:**
- **Tween (duration + easing)** suits discrete, fire-and-forget transitions with a known endpoint and a desired feel-over-time: a tooltip fade, a modal entrance, a tab switch.
- **Spring (physics: stiffness/damping)** suits motion that should feel physical and, especially, motion a user can grab and redirect — drags, gesture-driven sheets, anything velocity-aware. Springs naturally absorb an interruption mid-flight.

**Gesture interruptibility:**
- Gesture-driven and user-redirectable animations must be **interruptible** — if the user grabs an element mid-animation, the motion must hand control back smoothly rather than fighting the input or snapping. This is a primary reason to choose a spring for draggable/sheet interactions.

**CSS vs JS (an engineering tradeoff, not a style choice):**
- Prefer **CSS transitions/animations** for simple, declarative, one-shot transitions of `transform`/`opacity` — they are cheap, run off the main thread, and need no runtime.
- Reach for a **JS animation library** when you need orchestration (sequencing, stagger, shared-element/layout transitions), spring physics, gesture/velocity tracking, or mid-flight interruptibility that CSS cannot express.
- Do not pull in a JS animation runtime for a transition a two-line CSS rule handles.

**Testable checks:**
- [ ] Tween used for discrete transitions; spring used for gesture/velocity-driven motion.
- [ ] Draggable/sheet motion is interruptible — grabbing mid-animation hands control back smoothly.
- [ ] Simple `transform`/`opacity` transitions use CSS; JS runtime reserved for orchestration/physics/gesture.

---

## Pillar 7 — INHERIT-not-REPLACE & No Ad-Hoc Motion

**Core:** Motion is part of the design system. It is defined once and applied consistently — never improvised per component.

**Agent rules — DO:**
- Source durations, easing curves, and spring configs from the design system's motion tokens (docs/DESIGN.md). Where the system is silent on a *value*, use this file's ranges; where it is silent on a *pattern* (which easing for which intent, what to never animate), this file governs.
- Reuse the same motion for the same job across the product — one entrance pattern, one modal transition, one hover feel.

**Agent rules — DO NOT:**
- Do not invent a new duration/easing per component when a token exists.
- Do not let one screen slide while an equivalent screen fades for the same kind of transition — that is a consistency failure.
- Do not regenerate a motion system from scratch when one is already established; extend it.

**Testable checks:**
- [ ] Motion values come from design-system tokens where defined; this file fills gaps only.
- [ ] The same transition type uses the same motion across the product.
- [ ] No ad-hoc per-component motion that contradicts the established system.

---

## Appendix — Motion + Tailwind Mapping (the framework's prescribed stack)

This framework's UI stack is shadcn/ui + Tailwind. Motion (motion.dev) is the prescribed React
animation library because it is the same animation primitive shadcn/ui already builds on — so it
honors the shadcn-only rule (ui-rules.md). Concrete wiring:

**Motion (motion.dev) — prescribed React animation library:**
- **Use the LazyMotion / mini import path by default.** Import the lightweight feature set and the
  reduced bundle entry point rather than the full library, keeping the runtime cost small
  (roughly ~4.6KB for the mini path vs the full bundle). Only pull in additional features when a
  specific interaction needs them.
- **`useReducedMotion()` is MANDATORY on every animation.** Read the hook and branch: when reduced
  motion is requested, swap large/spatial motion for an opacity fade or an instant change. This is
  the enforcement point for Pillar 5 and ui-rules.md R14.
- Use Motion's spring configs for gesture/draggable/sheet interactions (interruptible by design);
  use its tween (duration + easing) for discrete entrances/exits.
- Reconcile every duration/easing back to docs/DESIGN.md motion tokens (INHERIT-not-REPLACE).

**Tailwind utilities — for simple CSS-only transitions:**
- For one-shot `transform`/`opacity` transitions, prefer Tailwind's `transition`, `duration-*`,
  `ease-out` / `ease-in-out`, `translate-*`, `scale-*`, and `opacity-*` utilities — no JS runtime.
- Gate them with the `motion-reduce:` variant (e.g. `motion-reduce:transition-none`) so they honor
  `prefers-reduced-motion` without JS.
- Never use Tailwind to animate `w-*`/`h-*`/`m-*`/inset utilities for motion (Pillar 4).

**GSAP — OPT-IN only (gated on a PRODUCT.md signal):**
- GSAP is permitted ONLY when PRODUCT.md indicates marketing-site / scroll-storytelling /
  timeline-heavy animation needs. It is not part of the standard app stack.
- GSAP is now 100% free including all plugins (since the Webflow ownership change), so cost is no
  longer a gating factor — the gate is purely the PRODUCT.md signal.
- Requires `@gsap/react` (the `useGSAP()` hook) for safe React integration, AND a hand-written
  `gsap.matchMedia()` reduced-motion guard — GSAP does not auto-honor `prefers-reduced-motion`, so
  the guard is mandatory and must be authored explicitly. Lock the opt-in in DECISIONS_LOG.md.

**Three.js / React Three Fiber (R3F) — PARKED-AVAILABLE (3D only):**
- 3D / WebGL motion is OUT OF SCOPE for standard apps. It is available only when a future
  PRODUCT.md explicitly requires 3D.
- When that requirement appears, **React Three Fiber (R3F) is the correct entry point** — not raw
  Three.js — because R3F integrates with React's render model and the rest of the stack. Lock the
  decision in DECISIONS_LOG.md before adopting.

**Decision tree (canonical):**

| Situation | Use |
|-----------|-----|
| Simple one-shot `transform`/`opacity` transition | Tailwind utilities + `motion-reduce:` variant |
| React entrance/exit, orchestration, stagger, shared layout | Motion (motion.dev), LazyMotion/mini, `useReducedMotion()` guard |
| Gesture / draggable / velocity-aware / interruptible | Motion springs (interruptible), `useReducedMotion()` guard |
| Marketing / scroll-storytelling / timeline (PRODUCT.md signal) | GSAP + `@gsap/react` + `gsap.matchMedia()` guard (opt-in, DECISIONS_LOG.md) |
| 3D / WebGL (PRODUCT.md explicitly requires) | React Three Fiber (R3F), not raw Three.js (parked) |

EVERY path above carries a reduced-motion guard. A guardless animation is a defect (Pillar 5 + R14).

---

## QA Checklist (run at /design-review and Phase 5)

Use this at every `/design-review` invocation and as the Phase 5 motion gate.
All items are binary pass/fail. Fails block Phase 5 close on gov/LGU apps (WARN otherwise).

### Purpose & Restraint
- [ ] Every animation explains a state change or directs attention — none is pure decoration.
- [ ] No animation on a high-frequency repeated action without being instant/near-instant.
- [ ] User input is never gated by a non-essential animation.

### Easing & Duration
- [ ] Entrances/exits use ease-out; on-screen moves use ease-in-out; no `linear` on UI transitions.
- [ ] Micro-interactions ≈100–200ms; overlays/pages use the longer ranges; durations trace to tokens where defined.
- [ ] No stagger produces a perceptible cumulative wait.

### Performance
- [ ] Only `transform` and `opacity` are animated.
- [ ] No layout/reflow property (`width`/`height`/`margin`/`top`/`left`/inset) is animated.
- [ ] No permanent broad `will-change`.

### Accessibility (ties to WCAG 2.2 AA — ui-rules.md R13 + R14)
- [ ] Every animation has a `prefers-reduced-motion` guard (`useReducedMotion()` or CSS media query).
- [ ] Reduced-motion mode substitutes a fade/instant alternative — feedback preserved, not blanket-removed.
- [ ] No content flashes > 3×/sec.
- [ ] Interaction-driven non-essential motion respects reduced-motion (SC 2.3.3).
- [ ] For gov/LGU apps: motion accessibility gate owned by **ui-rules.md R13 + R14** — verify there, not here.

### Library & System Fit
- [ ] React animation uses Motion (motion.dev) via LazyMotion/mini; GSAP only on a PRODUCT.md signal (with `@gsap/react` + `gsap.matchMedia()` guard, logged in DECISIONS_LOG.md).
- [ ] Three.js/R3F not present unless PRODUCT.md explicitly requires 3D (R3F entry point, logged in DECISIONS_LOG.md).
- [ ] Motion values reconcile to docs/DESIGN.md tokens (INHERIT-not-REPLACE); no ad-hoc per-component motion.

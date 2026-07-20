"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type TimelineRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  /** Horizontal offset; lets alternating timeline sides enter inward. */
  x?: number;
};

/**
 * Scroll-reveal wrapper for the development timeline.
 *
 * Three deliberate properties:
 *
 *  1. TRANSFORM + OPACITY ONLY. Never animates layout properties
 *     (ui-rules.md R14 / .ai_prompt/motion.md), so a reveal can never cause
 *     layout thrash while the page is scrolling.
 *
 *  2. THE REDUCED-MOTION OPT-OUT IS PURE CSS, NOT JAVASCRIPT. The obvious
 *     implementation — call `useReducedMotion()` and branch — is a trap that
 *     this codebase has already been bitten by. That hook reads a media query,
 *     so it is ALWAYS false during SSR and may be true on the client's first
 *     paint. Branching the rendered DOM on it makes the server and client trees
 *     disagree, React discards the server HTML and re-renders the subtree, and
 *     the result is hydration error #418 aimed squarely at the users the
 *     accessibility branch was meant to help. (LESSONS_GLOBAL:
 *     react.ssr.reduced-motion-branching-breaks-hydration.)
 *
 *     Branching only the animation PROPS is no better: `initial={false}` makes
 *     Motion mount at "no animation state", so an element that has not yet
 *     scrolled into view keeps the opacity-0 it was server-rendered with and
 *     stays permanently INVISIBLE for reduced-motion visitors. Verified in a
 *     real browser before this comment was written.
 *
 *     So there is NO JavaScript branch at all: every visitor gets byte-identical
 *     markup and identical props, and the `motion-reduce:` utilities below
 *     neutralise the effect through the CSS cascade. A media query is evaluated
 *     by the browser at paint time, so it cannot desynchronise from SSR. The
 *     `!` (important) prefix is required because Motion writes `opacity` and
 *     `transform` as INLINE styles, which would otherwise win.
 *
 *  3. `viewport.once` — an element reveals a single time and is then left
 *     alone; nothing re-animates on scroll-back.
 */
export function TimelineReveal({
  children,
  className,
  delay = 0,
  y = 24,
  x = 0,
}: TimelineRevealProps) {
  return (
    <motion.div
      className={cn(
        "motion-reduce:!transform-none motion-reduce:!opacity-100",
        className,
      )}
      initial={{ opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const }}
    >
      {children}
    </motion.div>
  );
}

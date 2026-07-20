"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
};

/**
 * Scroll-reveal wrapper. Animates transform + opacity ONLY (never layout
 * props), and fully honours WCAG SC 2.3.3 / ui-rules R14.
 *
 * THE REDUCED-MOTION OPT-OUT IS PURE CSS, NOT JAVASCRIPT. This component used
 * to call `useReducedMotion()` and return a plain <div> when it was true. That
 * is a hydration bug: the hook reads a media query, so it is ALWAYS false
 * during SSR and may be true on the client's first render. Branching the
 * rendered DOM on it makes the server and client trees disagree, React
 * discards the server HTML and re-renders the subtree, and the result is
 * hydration error #418 aimed squarely at the users the accessibility branch
 * was meant to help. (LESSONS_GLOBAL:
 * react.ssr.reduced-motion-branching-breaks-hydration.)
 *
 * Branching only the animation PROPS is no better: `initial={false}` makes
 * Motion mount at "no animation state", so an element that has not yet
 * scrolled into view keeps the opacity-0 it was server-rendered with and stays
 * permanently INVISIBLE for reduced-motion visitors.
 *
 * So there is NO JavaScript branch at all: every visitor gets byte-identical
 * markup and identical props, and the `motion-reduce:` utilities below
 * neutralise the effect through the CSS cascade. A media query is evaluated by
 * the browser at paint time, so it cannot desynchronise from SSR. The `!`
 * (important) prefix is required because Motion writes `opacity` and
 * `transform` as INLINE styles, which would otherwise win.
 *
 * Mirrors `showcase/timeline/_components/timeline-reveal.tsx`.
 */
export function Reveal({ children, className, delay = 0, y = 24 }: RevealProps) {
  return (
    <motion.div
      className={cn(
        "motion-reduce:!transform-none motion-reduce:!opacity-100",
        className,
      )}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const }}
    >
      {children}
    </motion.div>
  );
}

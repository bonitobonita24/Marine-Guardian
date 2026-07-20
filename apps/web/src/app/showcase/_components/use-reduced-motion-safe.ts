"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Hydration-safe reduced-motion preference.
 *
 * `useReducedMotion()` reads a browser media query, so it is ALWAYS false
 * during SSR and may be true on the client's very first render. Any component
 * that branches its rendered DOM on the raw hook renders one tree on the server
 * and a different tree at hydration — React discards the server HTML, re-renders
 * the subtree, and reports hydration error #418, aimed squarely at the users the
 * accessibility branch was meant to help.
 * (LESSONS_GLOBAL: react.ssr.reduced-motion-branching-breaks-hydration.)
 *
 * This hook returns `false` during SSR **and during the first client render**,
 * then flips to the real preference in an effect — after hydration has
 * committed. Server and first-client trees therefore agree by construction, and
 * the reduced-motion variant swaps in one commit later.
 *
 * ⚠ PREFER PURE CSS WHERE POSSIBLE. If the preference only changes HOW
 * something animates, do NOT use this hook — keep one tree and neutralise the
 * motion with Tailwind's `motion-reduce:` variants (see `reveal.tsx` and
 * `timeline/_components/timeline-reveal.tsx`). A media query evaluated by the
 * browser at paint time cannot desynchronise from SSR at all, so it is strictly
 * safer than any JS gate.
 *
 * Use this hook ONLY when the preference genuinely changes WHAT is rendered —
 * e.g. a scrolling marquee vs a static wrapped row, or a poster play-gate vs a
 * looping video — where no CSS override can express the difference.
 */
export function useReducedMotionSafe(): boolean {
  const preference = useReducedMotion();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated ? Boolean(preference) : false;
}

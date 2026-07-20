"use client";

import { cn } from "@/lib/utils";
import { Marquee } from "@/components/ui/marquee";
import { MARQUEE_CHIPS } from "./data";
import { useReducedMotionSafe } from "./use-reduced-motion-safe";

function Chip({ label }: { label: string }) {
  return (
    <span className="mx-2 inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-secondary/40 px-4 py-1.5 text-sm text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--info))]" />
      {label}
    </span>
  );
}

export function FeatureMarquee() {
  // The two branches below render genuinely DIFFERENT content (a single wrapped
  // row vs the Marquee's 4× repeated scrolling track), so no `motion-reduce:`
  // CSS override can express the difference — this is the one case that needs
  // the hydration-safe gate. Reading the raw `useReducedMotion()` here would
  // make the server and first client trees disagree → React #418.
  const shouldReduceMotion = useReducedMotionSafe();

  // Reduced motion: render a static, wrapping row of chips instead of a scroll.
  if (shouldReduceMotion) {
    return (
      <div className="border-y border-border/60 bg-background py-6">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-2 px-4 sm:px-6 lg:px-8">
          {MARQUEE_CHIPS.map((c) => (
            <Chip key={c} label={c} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative border-y border-border/60 bg-background py-6">
      <Marquee pauseOnHover className={cn("[--duration:38s]")}>
        {MARQUEE_CHIPS.map((c) => (
          <Chip key={c} label={c} />
        ))}
      </Marquee>
      {/* Edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}

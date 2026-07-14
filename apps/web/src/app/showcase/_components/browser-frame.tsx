"use client";

import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { Safari } from "@/components/ui/safari";
import { BorderBeam } from "@/components/ui/border-beam";

type BrowserFrameProps = {
  src: string;
  alt: string;
  url?: string;
  className?: string;
  /** Animated cyan→green beam around the frame. Auto-disabled for reduced motion. */
  beam?: boolean;
  beamColorFrom?: string;
  beamColorTo?: string;
};

/**
 * Frames a real product screenshot inside the Magic UI Safari browser chrome,
 * with an optional animated BorderBeam. The beam is gated behind
 * useReducedMotion() so it never animates for visitors who opt out (WCAG SC 2.3.3).
 */
export function BrowserFrame({
  src,
  alt,
  url = "app.marine-guardian",
  className,
  beam = true,
  beamColorFrom = "#00C9DB",
  beamColorTo = "#31A24C",
}: BrowserFrameProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;

  return (
    <div className={cn("relative rounded-xl", className)}>
      <Safari imageSrc={src} url={url} className="w-full" />
      {/* Screen-reader label for the framed screenshot (Safari's own <img> is decorative). */}
      <span className="sr-only">{alt}</span>
      {beam && !shouldReduceMotion ? (
        <BorderBeam
          size={90}
          duration={7}
          colorFrom={beamColorFrom}
          colorTo={beamColorTo}
          className="opacity-70"
        />
      ) : null}
    </div>
  );
}

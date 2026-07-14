"use client";

import { motion, type MotionStyle, type Transition } from "motion/react";

import { cn } from "@/lib/utils";

interface BorderBeamProps {
  /** The size of the border beam. */
  size?: number;
  /** The duration of the border beam. */
  duration?: number;
  /** The delay of the border beam. */
  delay?: number;
  /** The color of the border beam from. */
  colorFrom?: string;
  /** The color of the border beam to. */
  colorTo?: string;
  /** The motion transition of the border beam. */
  transition?: Transition;
  /** The class name of the border beam. */
  className?: string;
  /** The style of the border beam. */
  style?: React.CSSProperties;
  /** Whether to reverse the animation direction. */
  reverse?: boolean;
  /** The initial offset position (0-100). */
  initialOffset?: number;
  /** The border width of the beam. */
  borderWidth?: number;
}

/**
 * BorderBeam — Magic UI (magicui.design/r/border-beam). The upstream component
 * is authored for Tailwind v4 (mask-*, bg-linear-to-l, border-(length:…) and
 * from-(--var) utilities). This app is on Tailwind v3, so the border-only mask
 * and the beam gradient are expressed as inline styles instead of v4 utilities;
 * the motion offsetPath animation is unchanged. Callers must gate rendering on
 * useReducedMotion() to honour WCAG SC 2.3.3 (see showcase usage).
 */
export const BorderBeam = ({
  className,
  size = 60,
  delay = 0,
  duration = 6,
  colorFrom = "#00C9DB",
  colorTo = "#31A24C",
  transition,
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1.5,
}: BorderBeamProps) => {
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      style={{
        padding: borderWidth,
        // Intersect a content-box mask with a full mask so only the border ring
        // renders (v3 equivalent of the upstream v4 mask-intersect utilities).
        WebkitMask:
          "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
        mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
      }}
    >
      <motion.div
        className={cn("absolute aspect-square", className)}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            background: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent)`,
            ...style,
          } as MotionStyle
        }
        initial={{ offsetDistance: `${initialOffset}%` }}
        animate={{
          offsetDistance: reverse
            ? [`${100 - initialOffset}%`, `${-initialOffset}%`]
            : [`${initialOffset}%`, `${100 + initialOffset}%`],
        }}
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration,
          delay: -delay,
          ...transition,
        }}
      />
    </div>
  );
};

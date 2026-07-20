"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { ArrowRight, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrowserFrame } from "./browser-frame";
import { useReducedMotionSafe } from "./use-reduced-motion-safe";

/**
 * Reduced-motion opt-out for the entrance animations, expressed in PURE CSS.
 *
 * The previous implementation branched the animation props on
 * `useReducedMotion()` (`initial={false}` vs `initial={{opacity:0,…}}`). Motion
 * writes `initial` into the element's INLINE style during the very first
 * render, so the server emitted `opacity:0` while a reduced-motion client
 * emitted none — a hydration mismatch (React #418) even though the element tree
 * matched. These utilities neutralise the animation through the cascade
 * instead, so every visitor gets byte-identical markup and identical props.
 * `!` is required because Motion's values are inline styles.
 */
const MOTION_REDUCE = "motion-reduce:!transform-none motion-reduce:!opacity-100";

export type HeroProps = {
  eyebrow: string;
  headline: string;
  headlineAccent: string;
  subcopy: string;
  ctaPrimaryLabel: string;
  ctaSecondaryLabel: string;
};

export function Hero({
  eyebrow,
  headline,
  headlineAccent,
  subcopy,
  ctaPrimaryLabel,
  ctaSecondaryLabel,
}: HeroProps) {
  // Real preference, used ONLY to drive video playback in an effect — never to
  // branch what is rendered. See MOTION_REDUCE above for the visual opt-out.
  const shouldReduceMotion = useReducedMotionSafe();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Entrance animation config — transform + opacity only, and IDENTICAL for
  // every visitor. The reduced-motion opt-out is the MOTION_REDUCE class.
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] as const },
  });

  // Playback decided after hydration, not by a server/client-divergent
  // `autoPlay` attribute (a differing attribute is itself a hydration mismatch).
  useEffect(() => {
    const video = videoRef.current;
    if (video === null) return;
    if (shouldReduceMotion) {
      video.pause();
      video.currentTime = 0;
      return;
    }
    void video.play().catch(() => {
      // Autoplay blocked — the poster frame remains, which is the intended
      // fallback for this decorative background.
    });
  }, [shouldReduceMotion]);

  return (
    <section id="top" className="relative overflow-hidden">
      {/* Muted story-reel background — AI-generated (watermark-free), muted +
          looping, no audio track. Reduced motion → poster still only, no
          autoplay (WCAG 2.3.3). Poster paints first so it never blocks LCP. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          poster="/showcase/mg-hero-reel-poster.jpg"
          loop
          muted
          playsInline
          preload="metadata"
        >
          <source src="/showcase/mg-hero-reel.webm" type="video/webm" />
          <source src="/showcase/mg-hero-reel.mp4" type="video/mp4" />
        </video>
        {/* Legibility overlay — darkens the footage and fades to solid at the
            bottom so the headline stays readable and the section blends out. */}
        <div className="absolute inset-0 bg-background/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/75 to-background" />
      </div>

      {/* Ocean / cyan glow backdrop — marketing surface only. Pure CSS gradients,
          no motion, harmonised with the app's near-black neutral base. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-10%] h-[520px] w-[820px] max-w-[120vw] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,hsl(var(--info)/0.20),transparent)] blur-2xl" />
        <div className="absolute right-[8%] top-[28%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(closest-side,hsl(var(--success)/0.12),transparent)] blur-2xl" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-16 sm:px-6 sm:pt-20 lg:px-8 lg:pb-24 lg:pt-28">
        <motion.div
          {...rise(0)}
          className={cn(MOTION_REDUCE, "mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1 text-caption text-muted-foreground")}
        >
          <Radio className="h-3.5 w-3.5 text-[hsl(var(--info))]" />
          {eyebrow}
        </motion.div>

        <motion.h1
          {...rise(0.08)}
          className={cn(MOTION_REDUCE, "mt-6 max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl")}
        >
          {headline}
          <span className="block bg-gradient-to-r from-[hsl(var(--info))] to-[hsl(var(--success))] bg-clip-text text-transparent">
            {headlineAccent}
          </span>
        </motion.h1>

        <motion.p
          {...rise(0.16)}
          className={cn(MOTION_REDUCE, "mt-5 max-w-2xl text-lg text-muted-foreground sm:text-xl")}
        >
          {subcopy}
        </motion.p>

        <motion.div {...rise(0.24)} className={cn(MOTION_REDUCE, "mt-8 flex flex-wrap items-center gap-3")}>
          <Button asChild size="lg">
            <a href="#features">
              {ctaPrimaryLabel}
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#contact">{ctaSecondaryLabel}</a>
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 34 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.32, ease: [0.22, 1, 0.36, 1] as const }}
          className={cn(MOTION_REDUCE, "relative mt-14 lg:mt-20")}
        >
          <BrowserFrame
            src="/showcase/real/command-center-fullscreen.png"
            alt="Marine Guardian Command Center War Room — live map of the Mindoro/Palawan MPAs with event markers, KPI cards, alerts panel and live event feed"
            url="app.marine-guardian / command-center"
            className="mx-auto w-full max-w-6xl shadow-2xl shadow-black/60"
          />
        </motion.div>
      </div>
    </section>
  );
}

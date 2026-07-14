"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrowserFrame } from "./browser-frame";

export function Hero() {
  const shouldReduceMotion = useReducedMotion() ?? false;

  // Entrance animation config — transform + opacity only. Reduced motion
  // collapses every transition to a static, immediate render.
  const rise = (delay: number) =>
    shouldReduceMotion
      ? { initial: false as const }
      : {
          initial: { opacity: 0, y: 22 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section id="top" className="relative overflow-hidden">
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
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1 text-caption text-muted-foreground"
        >
          <Radio className="h-3.5 w-3.5 text-[hsl(var(--info))]" />
          Marine Protected Area Operations Intelligence
        </motion.div>

        <motion.h1
          {...rise(0.08)}
          className="mt-6 max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
        >
          Marine Guardian
          <span className="block bg-gradient-to-r from-[hsl(var(--info))] to-[hsl(var(--success))] bg-clip-text text-transparent">
            Command Center
          </span>
        </motion.h1>

        <motion.p
          {...rise(0.16)}
          className="mt-5 max-w-2xl text-lg text-muted-foreground sm:text-xl"
        >
          Real-time operations intelligence for marine protected areas.
          EarthRanger collects the field data — Marine Guardian turns it into a
          live command center for monitoring, incident escalation, patrol
          planning, and the reports that used to take days.
        </motion.p>

        <motion.div {...rise(0.24)} className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <a href="#features">
              See it in action
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#contact">Request a demo</a>
          </Button>
        </motion.div>

        <motion.div
          {...(shouldReduceMotion
            ? { initial: false as const }
            : {
                initial: { opacity: 0, y: 34 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.7, delay: 0.32, ease: [0.22, 1, 0.36, 1] as const },
              })}
          className="relative mt-14 lg:mt-20"
        >
          <BrowserFrame
            src="/showcase/hero-warroom.png"
            alt="Marine Guardian Command Center War Room on a wall display"
            url="app.marine-guardian / command-center"
            className="mx-auto max-w-5xl shadow-2xl shadow-black/60"
          />
        </motion.div>
      </div>
    </section>
  );
}

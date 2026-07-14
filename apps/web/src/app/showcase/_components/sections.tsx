"use client";

import { AlertTriangle, Clock, FileWarning, Check, ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { Reveal } from "./reveal";
import { BrowserFrame } from "./browser-frame";
import { FEATURES, ROLES, STEPS, BENTO } from "./data";

/* ---------------------------------------------------------------- Problem -- */

const PAINS = [
  {
    icon: FileWarning,
    title: "Reports built by hand",
    body: "Per-area breakdowns, patrol stats, and ranger matrices assembled manually as static monthly PDFs — tedious and error-prone.",
  },
  {
    icon: Clock,
    title: "Insights arrive stale",
    body: "By the time a monthly report is finished, the data it describes is weeks old. Decisions run on yesterday's picture.",
  },
  {
    icon: AlertTriangle,
    title: "No real-time view or alerting",
    body: "EarthRanger collects field data but offers no charts, no cross-area analytics, and no configurable alerting or command center.",
  },
];

export function ProblemSection() {
  return (
    <section className="border-b border-border/60 bg-background py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-[hsl(var(--info))]">
            The reporting gap
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            EarthRanger captures the field. Nothing turns it into command.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            EarthRanger is an excellent field data collection platform — but it
            has no reporting, no charts for events or patrols, no cross-area
            analytics within a site, and no configurable alerting. So managers
            hand-build stale monthly PDFs, with no unified view for real-time
            monitoring, escalation, or patrol planning.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {PAINS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.08}>
              <div className="h-full rounded-xl border border-border bg-secondary/20 p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--destructive)/0.16)] text-[hsl(var(--destructive))]">
                  <p.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{p.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Features -- */

export function FeatureSections() {
  return (
    <section id="features" className="bg-background py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-[hsl(var(--info))]">
            One platform, every layer of the operation
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            From live map to finished report
          </h2>
        </Reveal>

        <div className="mt-16 flex flex-col gap-20 lg:gap-28">
          {FEATURES.map((f, i) => {
            const reversed = i % 2 === 1;
            return (
              <div
                key={f.id}
                id={f.id}
                className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
              >
                <Reveal
                  className={cn(reversed && "lg:order-2")}
                  y={20}
                >
                  <div
                    className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-caption font-medium"
                    style={{ color: `hsl(${f.accent})` }}
                  >
                    <f.icon className="h-3.5 w-3.5" />
                    {f.eyebrow}
                  </div>
                  <h3 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {f.title}
                  </h3>
                  <p className="mt-4 text-base text-muted-foreground">{f.body}</p>
                  <ul className="mt-6 space-y-3">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-3 text-sm text-foreground/90">
                        <span
                          className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full"
                          style={{ backgroundColor: `hsl(${f.accent} / 0.16)`, color: `hsl(${f.accent})` }}
                        >
                          <Check className="h-3 w-3" />
                        </span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </Reveal>

                <Reveal
                  className={cn(reversed && "lg:order-1")}
                  delay={0.06}
                  y={20}
                >
                  <BrowserFrame
                    src={f.image}
                    alt={f.imageAlt}
                    url={`app.marine-guardian / ${f.id}`}
                    beamColorFrom={`hsl(${f.accent})`}
                    beamColorTo="#00C9DB"
                    className="shadow-xl shadow-black/40"
                  />
                </Reveal>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Bento -- */

export function BentoSection() {
  return (
    <section className="border-y border-border/60 bg-background py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-[hsl(var(--info))]">
            And there is more under the hood
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Built for how MPA teams actually work
          </h2>
        </Reveal>

        <Reveal className="mt-14">
          <BentoGrid className="lg:grid-cols-3">
            {BENTO.map((item) => (
              <BentoCard
                key={item.name}
                name={item.name}
                description={item.description}
                Icon={item.icon}
                className={item.className}
                href="#contact"
                cta="Request a demo"
                background={
                  item.image != null ? (
                    <div className="absolute inset-0">
                      {/* Decorative product-screenshot wash behind the tile copy. */}
                      <img
                        src={item.image}
                        alt=""
                        aria-hidden
                        className="h-full w-full object-cover object-top opacity-20 [mask-image:linear-gradient(to_bottom,black,transparent)]"
                      />
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_10%,hsl(var(--info)/0.12),transparent_60%)]" />
                  )
                }
              />
            ))}
          </BentoGrid>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- How it works */

export function HowItWorks() {
  return (
    <section id="how" className="bg-background py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-[hsl(var(--info))]">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            From connection to command in four steps
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <div className="relative h-full rounded-xl border border-border bg-secondary/20 p-6">
                <span className="text-sm font-bold text-[hsl(var(--info))]">{s.n}</span>
                <div className="mt-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--info)/0.14)] text-[hsl(var(--info))]">
                  <s.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Roles -- */

export function RolesSection() {
  return (
    <section id="roles" className="border-t border-border/60 bg-background py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-[hsl(var(--info))]">
            Roles & permissions
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            The right access for every seat
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Scoped, tenant-isolated roles from the command floor to the platform.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {ROLES.map((r, i) => (
            <Reveal key={r.name} delay={i * 0.06}>
              <div className="flex h-full gap-4 rounded-xl border border-border bg-secondary/20 p-6">
                <div className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-[hsl(var(--info)/0.14)] text-[hsl(var(--info))]">
                  <r.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">{r.name}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{r.can}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- CTA -- */

export function ClosingCTA() {
  return (
    <section id="contact" className="relative overflow-hidden bg-background py-24 lg:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[720px] max-w-[120vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,hsl(var(--info)/0.16),transparent)] blur-2xl" />
      </div>
      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Bring your marine protected area into one command center
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Connect EarthRanger, watch the War Room come alive, and export the
            report that used to take days — in seconds.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <a href="mailto:hello@powerbyteitsolutions.com?subject=Marine%20Guardian%20demo">
                Request a demo
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#features">Explore the features</a>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

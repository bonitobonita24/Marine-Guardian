"use client";

import { ArrowRight, Check, GitCommitHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ShowcaseMedia } from "../../_components/showcase-media";
import { SHOWCASE_HOME } from "../../_components/showcase-base";
import { TimelineReveal } from "./timeline-reveal";
import {
  MILESTONES,
  NEXT_FEATURES,
  TIMELINE_MODE,
  type Milestone,
} from "./timeline-data";

/**
 * Resolves the label shown on a milestone's marker, honouring TIMELINE_MODE
 * (see timeline-data.ts). "phases" is the default and claims no calendar dates.
 */
function milestoneLabel(m: Milestone): string {
  return TIMELINE_MODE === "dates-feb" ? m.monthLabel : m.phase;
}

/* --------------------------------------------------------------- Timeline -- */

export function TimelineHero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60 bg-background py-20 lg:py-28">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[380px] w-[820px] max-w-[130vw] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[radial-gradient(closest-side,hsl(var(--info)/0.14),transparent)] blur-2xl" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <TimelineReveal className="mx-auto max-w-3xl text-center">
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-[hsl(var(--info))]">
            Development timeline
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            How Marine Guardian was built
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            From a tenant-isolated foundation to a live command center, a
            printable report suite and officer-controlled attribution — the
            capabilities below are all shipped and running. What is still
            planned is marked as such, further down the page.
          </p>
        </TimelineReveal>
      </div>
    </section>
  );
}

export function MilestoneTimeline() {
  return (
    <section
      id="milestones"
      className="bg-background py-20 lg:py-28"
      aria-labelledby="milestones-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <TimelineReveal className="mx-auto max-w-3xl text-center">
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-[hsl(var(--info))]">
            Shipped capabilities
          </p>
          <h2
            id="milestones-heading"
            className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
            The road so far
          </h2>
        </TimelineReveal>

        {/* Rail is decorative and desktop-only; the list itself carries meaning. */}
        <ol className="relative mt-16 space-y-16 lg:space-y-24">
          <span
            aria-hidden
            className="pointer-events-none absolute left-[15px] top-2 hidden h-full w-px bg-gradient-to-b from-[hsl(var(--info)/0.5)] via-border to-transparent lg:block"
          />

          {MILESTONES.map((m, i) => {
            const Icon = m.icon;
            const reversed = i % 2 === 1;
            const media =
              m.media ??
              (m.image != null && m.imageAlt != null
                ? [{ src: m.image, alt: m.imageAlt }]
                : []);
            const hasImage = media.length > 0;

            return (
              <li key={m.id} id={m.id} className="relative lg:pl-16">
                <span
                  aria-hidden
                  className="absolute left-0 top-1 hidden h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-[hsl(var(--info))] lg:flex"
                >
                  <GitCommitHorizontal className="h-4 w-4" />
                </span>

                <div
                  className={cn(
                    "grid items-center gap-8",
                    hasImage && "lg:grid-cols-2 lg:gap-14",
                  )}
                >
                  <TimelineReveal
                    className={cn(hasImage && reversed && "lg:order-2")}
                    y={20}
                  >
                    <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-caption font-medium text-[hsl(var(--info))]">
                      <Icon className="h-3.5 w-3.5" />
                      {milestoneLabel(m)}
                    </div>
                    <h3 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                      {m.title}
                    </h3>
                    <p className="mt-4 text-base text-muted-foreground">{m.body}</p>
                    <ul className="mt-6 space-y-3">
                      {m.highlights.map((h) => (
                        <li
                          key={h}
                          className="flex items-start gap-3 text-sm text-foreground/90"
                        >
                          <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[hsl(var(--info)/0.16)] text-[hsl(var(--info))]">
                            <Check className="h-3 w-3" />
                          </span>
                          {h}
                        </li>
                      ))}
                    </ul>
                  </TimelineReveal>

                  {hasImage && (
                    <TimelineReveal
                      className={cn(
                        "lg:self-center",
                        reversed && "lg:order-1",
                      )}
                      delay={0.06}
                      y={20}
                    >
                      <ShowcaseMedia
                        images={media}
                        frame={m.frame ?? "safari"}
                        url={`app.marine-guardian / ${m.id}`}
                      />
                    </TimelineReveal>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ What's next -- */

export function WhatsNextSection() {
  return (
    <section
      id="whats-next"
      className="border-t border-border/60 bg-background py-20 lg:py-28"
      aria-labelledby="whats-next-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <TimelineReveal className="mx-auto max-w-3xl text-center">
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-[hsl(var(--warning))]">
            Planned — not yet available
          </p>
          <h2
            id="whats-next-heading"
            className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
            What&rsquo;s next
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            The six capabilities below are on the roadmap. Every screen shown in
            this section is a concept mockup of planned work, not shipped
            functionality — with one exception, noted on its card, where an
            existing feature is being extended.
          </p>
          <p className="mt-4 text-base text-muted-foreground">
            They all feed{" "}
            <span className="font-medium text-foreground">
              Project Management
            </span>{" "}
            for consolidated reporting, so catch, fuel, science &amp; research,
            asset custody, enforcement follow-up and patrol activity roll up into a
            single organisation-wide view.
          </p>
        </TimelineReveal>

        <div className="mt-16 space-y-16 lg:space-y-24">
          {NEXT_FEATURES.map((f, i) => {
            const Icon = f.icon;
            const reversed = i % 2 === 1;
            const isShipping = f.status === "Shipped · expanding";

            return (
              <article
                key={f.id}
                id={f.id}
                className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
              >
                <TimelineReveal className={cn(reversed && "lg:order-2")} y={20}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-caption font-medium text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      Roadmap
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-caption font-semibold uppercase tracking-[0.1em]",
                        isShipping
                          ? "bg-[hsl(var(--success)/0.16)] text-[hsl(var(--success))]"
                          : "bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--warning))]",
                      )}
                    >
                      {f.status}
                    </span>
                  </div>

                  <h3 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {f.title}
                  </h3>

                  <dl className="mt-5 space-y-4">
                    <div>
                      <dt className="text-caption font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        What it is
                      </dt>
                      <dd className="mt-1 text-base text-muted-foreground">
                        {f.what}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Its purpose
                      </dt>
                      <dd className="mt-1 text-base text-muted-foreground">
                        {f.purpose}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Who uses it
                      </dt>
                      <dd className="mt-1 text-base text-muted-foreground">
                        {f.who}
                      </dd>
                    </div>
                  </dl>
                </TimelineReveal>

                <TimelineReveal
                  className={cn(reversed && "lg:order-1")}
                  delay={0.06}
                  y={20}
                >
                  <figure>
                    <ShowcaseMedia
                      images={[{ src: f.image, alt: f.imageAlt }]}
                      frame="safari"
                      url={`concept / ${f.id}`}
                    />
                    <figcaption className="mt-3 text-center text-caption text-muted-foreground">
                      Concept mockup — {f.title} is{" "}
                      {isShipping
                        ? "shipped today and being extended; the screen above shows the planned extension."
                        : "planned work and is not available in the product today."}
                    </figcaption>
                  </figure>
                </TimelineReveal>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- CTA -- */

export function TimelineCTA() {
  return (
    <section className="relative overflow-hidden bg-background py-24 lg:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[720px] max-w-[120vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,hsl(var(--info)/0.16),transparent)] blur-2xl" />
      </div>
      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <TimelineReveal>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            See where it is headed next
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Marine Guardian is in active development. Talk to us about the
            roadmap, or explore what the platform already does today.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <a href="mailto:hello@powerbyteitsolutions.com?subject=Marine%20Guardian%20roadmap">
                Talk about the roadmap
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={SHOWCASE_HOME}>Explore the platform</a>
            </Button>
          </div>
        </TimelineReveal>
      </div>
    </section>
  );
}

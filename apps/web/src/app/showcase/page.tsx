import type { Metadata } from "next";

import { getServerTrpc } from "@/lib/trpc/server";
import { ShowcaseNav } from "./_components/showcase-nav";
import { Hero } from "./_components/hero";
import { StoryReel } from "./_components/story-reel";
import { FeatureMarquee } from "./_components/feature-marquee";
import {
  ProblemSection,
  FeatureSections,
  BentoSection,
  HowItWorks,
  RolesSection,
  ClosingCTA,
} from "./_components/sections";
import { ShowcaseFooter } from "./_components/showcase-footer";
import {
  text,
  resolveFeatures,
  resolveRoles,
  resolveSteps,
  resolveBento,
  resolvePains,
  type CmsFields,
} from "./_components/resolve-cms";

export const metadata: Metadata = {
  title: "Marine Guardian — Command Center | Operations intelligence for marine protected areas",
  description:
    "EarthRanger collects the field data — Marine Guardian turns it into a live command center for real-time monitoring, incident escalation, patrol planning, and reports that used to take days.",
};

/**
 * Public, unauthenticated product showcase / marketing landing page at
 * /showcase. Allow-listed in src/middleware.ts so it renders without a session
 * or tenant. Marketing archetype: full-width immersive sections, no app shell.
 *
 * Text is CMS-backed (CMS_BUILD_PLAN.md — W5): fetched ONCE here via the
 * server-side tRPC caller (cmsShowcase.getAll, public) and resolved with a
 * fallback to the current literal for every field, so an empty/partial table
 * renders byte-identical to the pre-CMS page. Layout/icons/images/animation
 * stay in ./_components/data.ts (code), untouched by this wiring.
 */
export default async function ShowcasePage() {
  const trpc = await getServerTrpc();
  let fields: CmsFields = {};
  try {
    fields = await trpc.cmsShowcase.getAll();
  } catch {
    // DB unreachable / empty — fall through with {} so every text()/list()
    // call below resolves to its literal fallback (byte-identical page).
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <ShowcaseNav />
      <Hero
        eyebrow={text(fields, "hero.eyebrow", "Marine Protected Area Operations Intelligence")}
        headline={text(fields, "hero.headline", "Marine Guardian")}
        headlineAccent={text(fields, "hero.headlineAccent", "Command Center")}
        subcopy={text(
          fields,
          "hero.subcopy",
          "Real-time operations intelligence for marine protected areas. EarthRanger collects the field data — Marine Guardian turns it into a live command center for monitoring, incident escalation, patrol planning, and the reports that used to take days.",
        )}
        ctaPrimaryLabel={text(fields, "hero.ctaPrimaryLabel", "See it in action")}
        ctaSecondaryLabel={text(fields, "hero.ctaSecondaryLabel", "Request a demo")}
      />
      <StoryReel />
      <FeatureMarquee />
      <ProblemSection
        eyebrow={text(fields, "problem.eyebrow", "The reporting gap")}
        title={text(
          fields,
          "problem.title",
          "EarthRanger captures the field. Nothing turns it into command.",
        )}
        body={text(
          fields,
          "problem.body",
          "EarthRanger is an excellent field data collection platform — but it has no reporting, no charts for events or patrols, no cross-area analytics within a site, and no configurable alerting. So managers hand-build stale monthly PDFs, with no unified view for real-time monitoring, escalation, or patrol planning.",
        )}
        pains={resolvePains(fields)}
      />
      <FeatureSections
        eyebrow={text(fields, "features.eyebrow", "One platform, every layer of the operation")}
        title={text(fields, "features.title", "From live map to finished report")}
        features={resolveFeatures(fields)}
      />
      <BentoSection
        eyebrow={text(fields, "bento.eyebrow", "And there is more under the hood")}
        title={text(fields, "bento.title", "Built for how MPA teams actually work")}
        bento={resolveBento(fields)}
      />
      <HowItWorks
        eyebrow={text(fields, "steps.eyebrow", "How it works")}
        title={text(fields, "steps.title", "From connection to command in four steps")}
        steps={resolveSteps(fields)}
      />
      <RolesSection
        eyebrow={text(fields, "roles.eyebrow", "Roles & permissions")}
        title={text(fields, "roles.title", "The right access for every seat")}
        subcopy={text(
          fields,
          "roles.subcopy",
          "Scoped, tenant-isolated roles from the command floor to the platform.",
        )}
        roles={resolveRoles(fields)}
      />
      <ClosingCTA
        title={text(
          fields,
          "cta.title",
          "Bring your marine protected area into one command center",
        )}
        body={text(
          fields,
          "cta.body",
          "Connect EarthRanger, watch the War Room come alive, and export the report that used to take days — in seconds.",
        )}
        primaryLabel={text(fields, "cta.primaryLabel", "Request a demo")}
        secondaryLabel={text(fields, "cta.secondaryLabel", "Explore the features")}
      />
      <ShowcaseFooter />
    </main>
  );
}

import type { Metadata } from "next";

import { ShowcaseNav } from "./_components/showcase-nav";
import { Hero } from "./_components/hero";
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

export const metadata: Metadata = {
  title: "Marine Guardian — Command Center | Operations intelligence for marine protected areas",
  description:
    "EarthRanger collects the field data — Marine Guardian turns it into a live command center for real-time monitoring, incident escalation, patrol planning, and reports that used to take days.",
};

/**
 * Public, unauthenticated product showcase / marketing landing page at
 * /showcase. Allow-listed in src/middleware.ts so it renders without a session
 * or tenant. Marketing archetype: full-width immersive sections, no app shell.
 */
export default function ShowcasePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <ShowcaseNav />
      <Hero />
      <FeatureMarquee />
      <ProblemSection />
      <FeatureSections />
      <BentoSection />
      <HowItWorks />
      <RolesSection />
      <ClosingCTA />
      <ShowcaseFooter />
    </main>
  );
}

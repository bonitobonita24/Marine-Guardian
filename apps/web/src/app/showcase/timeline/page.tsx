import type { Metadata } from "next";

import { ShowcaseNav } from "../_components/showcase-nav";
import { ShowcaseFooter } from "../_components/showcase-footer";
import {
  TimelineHero,
  MilestoneTimeline,
  WhatsNextSection,
  TimelineCTA,
} from "./_components/timeline-sections";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://marine-guardian.powerbyte.app";
const PATH = "/showcase/timeline";
const TITLE =
  "Development Timeline — how Marine Guardian was built | Marine Guardian";
const DESCRIPTION =
  "The development timeline of Marine Guardian: from a multi-tenant foundation and EarthRanger sync to the Command Center, interactive report map, printable report suite and officer-controlled attribution — plus the four capabilities planned next.";

/**
 * PUBLIC marketing surface (/showcase is allow-listed in src/middleware.ts), so
 * this route takes the FULL SEO baseline per Rule 35 / .ai_prompt/seo.md:
 * indexable, canonical URL, Open Graph + Twitter cards, and inclusion in
 * app/sitemap.ts. Authenticated app routes stay noindex via app/robots.ts.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  robots: { index: true, follow: true },
  openGraph: {
    type: "article",
    url: PATH,
    siteName: "Marine Guardian",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/showcase/timeline/command-center.png",
        width: 1600,
        height: 1000,
        alt: "Marine Guardian Command Center war room with a live map, KPI cards and event feed",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/showcase/timeline/command-center.png"],
  },
};

export default function ShowcaseTimelinePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <ShowcaseNav />
      <TimelineHero />
      <MilestoneTimeline />
      <WhatsNextSection />
      <TimelineCTA />
      <ShowcaseFooter />
    </main>
  );
}

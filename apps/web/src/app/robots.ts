import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://marine-guardian.powerbyte.app";

/**
 * Fail-closed robots policy (Rule 35 / .ai_prompt/seo.md).
 *
 * Everything is disallowed by default; only the surfaces that
 * src/middleware.ts allow-lists as public are opened up. This keeps every
 * authenticated route — the tenant dashboard, the admin CMS, the print
 * renderer and the API — out of search indexes, which is a security-adjacent
 * concern as much as an SEO one: internal surfaces must never be discoverable.
 *
 * `allow` entries are more specific than the blanket `disallow: "/"`, and the
 * major crawlers resolve the conflict in favour of the more specific rule.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/showcase", "/docs", "/privacy"],
        disallow: "/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

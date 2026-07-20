import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://marine-guardian.powerbyte.app";

/**
 * Sitemap for the PUBLIC surfaces only (Rule 35 / .ai_prompt/seo.md).
 *
 * Only routes that src/middleware.ts allow-lists as public are listed here.
 * Every authenticated app route ([tenant]/…, /admin/…) is deliberately absent
 * and is additionally disallowed in app/robots.ts — the baseline fails closed
 * to private so an internal surface can never leak into search.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: `${SITE_URL}/showcase`,
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/showcase/timeline`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/docs`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}

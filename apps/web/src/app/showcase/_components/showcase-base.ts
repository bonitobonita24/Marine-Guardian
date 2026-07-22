// Where the showcase LANDING lives, driven by NEXT_PUBLIC_SHOWCASE_AT_ROOT.
//
// - Public prod/staging domains (flag "true"): the showcase IS the site root.
//   The landing is served at "/" (middleware rewrites "/" → /showcase and
//   retires the bare "/showcase" URL by redirecting it to "/"). SHOWCASE_HOME
//   is therefore "/".
// - Local dev (flag unset): the app owns the root (app/page.tsx dispatch), so
//   the showcase keeps its own path and SHOWCASE_HOME is "/showcase".
//
// The Timeline subpage stays at /showcase/timeline in BOTH modes (only the
// landing moves). Because the value is a NEXT_PUBLIC_* env var it is inlined at
// build time, so server and client components resolve the same SHOWCASE_HOME.
export const SHOWCASE_AT_ROOT =
  process.env.NEXT_PUBLIC_SHOWCASE_AT_ROOT === "true";

/** Landing root: "/" at the domain root, "/showcase" in dev. */
export const SHOWCASE_HOME = SHOWCASE_AT_ROOT ? "/" : "/showcase";

/**
 * Build an href to a section anchor on the landing page, resolving correctly
 * from BOTH the landing and its subpages (e.g. the timeline) in either mode.
 * landingHref("#features") → "/#features" (root) or "/showcase#features" (dev).
 */
export function landingHref(anchor: string): string {
  return `${SHOWCASE_HOME}${anchor}`;
}

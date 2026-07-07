export const IMPERSONATION_COOKIE_NAME = "mg-impersonate-tenant";
// Path-based multi-tenancy: sibling cookie carrying the impersonated tenant's
// SLUG (the URL segment), set/cleared alongside IMPERSONATION_COOKIE_NAME by
// trpc.platformImpersonation.{enter,exit}. The edge middleware + the
// /[tenant]/layout.tsx gate compare it against the requested URL slug so an
// impersonating super_admin is confined to the tenant they entered.
export const IMPERSONATION_SLUG_COOKIE_NAME = "mg-impersonate-slug";

export function parseImpersonationCookieFromHeader(
  cookieHeader: string | null | undefined,
): string | null {
  if (cookieHeader === null || cookieHeader === undefined || cookieHeader === "") return null;
  const pairs = cookieHeader.split(";").map((p) => p.trim());
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq);
    if (name === IMPERSONATION_COOKIE_NAME) {
      const value = pair.slice(eq + 1);
      if (!value) return null;
      // cuid format: alphanumeric only — reject anything else as defensive guard
      if (!/^[a-z0-9]{20,40}$/i.test(value)) return null;
      return value;
    }
  }
  return null;
}

// Tenant slug format: lowercase alphanumeric + internal hyphens (mirrors the
// platform.create slug regex). Rejects anything else as a defensive guard so a
// tampered cookie can never smuggle a path segment / control chars into a
// comparison or redirect.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function parseImpersonationSlugFromHeader(
  cookieHeader: string | null | undefined,
): string | null {
  if (cookieHeader === null || cookieHeader === undefined || cookieHeader === "") return null;
  const pairs = cookieHeader.split(";").map((p) => p.trim());
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq);
    if (name === IMPERSONATION_SLUG_COOKIE_NAME) {
      const value = pair.slice(eq + 1);
      if (!value) return null;
      if (!SLUG_RE.test(value)) return null;
      return value;
    }
  }
  return null;
}

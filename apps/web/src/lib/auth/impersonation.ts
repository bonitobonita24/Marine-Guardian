export const IMPERSONATION_COOKIE_NAME = "mg-impersonate-tenant";

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

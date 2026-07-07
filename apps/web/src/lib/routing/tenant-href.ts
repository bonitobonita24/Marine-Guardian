// Path-based multi-tenancy — prefix an internal, tenant-scoped app path with the
// current tenant slug. Turns a bare route ("/map", "/patrols/123") into a
// tenant URL ("/demo-site/map"). Use for every internal link/redirect that
// targets a tenant page; do NOT use it for global routes (/login, /privacy,
// /admin/**), which stay un-prefixed.
export function tenantHref(slug: string, path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `/${slug}${suffix}`;
}

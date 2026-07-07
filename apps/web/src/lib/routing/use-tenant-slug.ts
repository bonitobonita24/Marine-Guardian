"use client";

import { useParams } from "next/navigation";

// Path-based multi-tenancy — the current tenant slug from the [tenant] route
// segment. Only valid inside the /[tenant]/… route tree (every tenant page).
export function useTenantSlug(): string {
  return useParams<{ tenant: string }>().tenant;
}
